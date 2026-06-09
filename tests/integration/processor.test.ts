import { handler as uploadHandler } from '../../src/handlers/upload';
import { handler as processorHandler } from '../../src/handlers/processor';
import { buildMultipartEvent, getJob, testDynamo } from './helpers';
import { SQSEvent } from 'aws-lambda';
import { QueryCommand } from '@aws-sdk/lib-dynamodb';

function buildSQSEvent(body: object): SQSEvent {
  return {
    Records: [
      {
        messageId: 'test-msg-1',
        receiptHandle: 'test-receipt',
        body: JSON.stringify(body),
        attributes: {} as never,
        messageAttributes: {},
        md5OfBody: '',
        eventSource: 'aws:sqs',
        eventSourceARN: 'arn:aws:sqs:eu-west-1:000000000000:datapipe-processing',
        awsRegion: 'eu-west-1',
      },
    ],
  };
}

describe('processor handler', () => {
  it('processes a valid CSV file and sets job to COMPLETED', async () => {
    const csv = Buffer.from('name,email\nProcAlice,proc-alice@example.com\nProcBob,proc-bob@example.com');
    const uploadResult = await uploadHandler(buildMultipartEvent(csv, 'proc-test.csv', 'users'));
    const { jobId } = JSON.parse(uploadResult.body);

    const job = await getJob(jobId);
    const sqsEvent = buildSQSEvent({
      jobId,
      s3Key: job!.s3Key,
      schemaType: 'users',
      etag: job!.etag,
    });

    await processorHandler(sqsEvent);

    const processed = await getJob(jobId);
    expect(processed!.status).toBe('COMPLETED');
    expect(processed!.totalRows).toBe(2);
    expect(processed!.processedRows).toBe(2);
    expect(processed!.failedRows).toBe(0);
  });

  it('marks invalid rows as failed and sets status to PARTIAL_FAILURE', async () => {
    const csv = Buffer.from('name,email\nAlice,not-an-email\nBob,bob@example.com');
    const uploadResult = await uploadHandler(buildMultipartEvent(csv, 'partial-fail.csv', 'users'));
    const { jobId } = JSON.parse(uploadResult.body);

    const job = await getJob(jobId);
    const sqsEvent = buildSQSEvent({
      jobId,
      s3Key: job!.s3Key,
      schemaType: 'users',
      etag: job!.etag,
    });

    await processorHandler(sqsEvent);

    const processed = await getJob(jobId);
    expect(processed!.status).toBe('PARTIAL_FAILURE');
    expect(processed!.processedRows).toBe(1);
    expect(processed!.failedRows).toBe(1);
  });

  it('persists row data to RowsTable', async () => {
    const csv = Buffer.from('name,email\nCarlos,carlos@example.com');
    const uploadResult = await uploadHandler(buildMultipartEvent(csv, 'rows-check.csv', 'users'));
    const { jobId } = JSON.parse(uploadResult.body);

    const job = await getJob(jobId);
    const sqsEvent = buildSQSEvent({
      jobId,
      s3Key: job!.s3Key,
      schemaType: 'users',
      etag: job!.etag,
    });

    await processorHandler(sqsEvent);

    const rows = await testDynamo.send(
      new QueryCommand({
        TableName: 'datapipe-rows',
        IndexName: 'jobId-index',
        KeyConditionExpression: 'jobId = :jid',
        ExpressionAttributeValues: { ':jid': jobId },
      }),
    );

    expect(rows.Items).toHaveLength(1);
    expect(rows.Items![0].data).toEqual({ name: 'Carlos', email: 'carlos@example.com' });
    expect(rows.Items![0].valid).toBe(true);
  });

  it('is idempotent — reprocessing same file does not duplicate rows', async () => {
    const csv = Buffer.from('name,email\nEva,eva@example.com');
    const uploadResult = await uploadHandler(buildMultipartEvent(csv, 'idem-test.csv', 'users'));
    const { jobId } = JSON.parse(uploadResult.body);

    const job = await getJob(jobId);
    const sqsEvent = buildSQSEvent({
      jobId,
      s3Key: job!.s3Key,
      schemaType: 'users',
      etag: job!.etag,
    });

    await processorHandler(sqsEvent);
    await processorHandler(sqsEvent);

    const rows = await testDynamo.send(
      new QueryCommand({
        TableName: 'datapipe-rows',
        IndexName: 'jobId-index',
        KeyConditionExpression: 'jobId = :jid',
        ExpressionAttributeValues: { ':jid': jobId },
      }),
    );

    expect(rows.Items).toHaveLength(1);
  });
});
