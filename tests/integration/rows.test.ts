import { handler as uploadHandler } from '../../src/handlers/upload';
import { handler as processorHandler } from '../../src/handlers/processor';
import { handler as rowsHandler } from '../../src/handlers/rows';
import { buildMultipartEvent, getJob } from './helpers';
import { APIGatewayProxyEvent, SQSEvent } from 'aws-lambda';

function buildSQSEvent(jobId: string, s3Key: string, schemaType: string, etag: string): SQSEvent {
  return {
    Records: [{
      messageId: 'rows-msg-1',
      receiptHandle: 'x',
      body: JSON.stringify({ jobId, s3Key, schemaType, etag }),
      attributes: {} as never,
      messageAttributes: {},
      md5OfBody: '',
      eventSource: 'aws:sqs',
      eventSourceARN: 'arn:aws:sqs:eu-west-1:000000000000:datapipe-processing',
      awsRegion: 'eu-west-1',
    }],
  };
}

function buildGetRowsEvent(jobId: string, failed?: boolean): APIGatewayProxyEvent {
  return {
    httpMethod: 'GET',
    path: `/jobs/${jobId}/rows`,
    headers: {},
    multiValueHeaders: {},
    queryStringParameters: failed ? { failed: 'true' } : null,
    multiValueQueryStringParameters: null,
    pathParameters: { jobId },
    stageVariables: null,
    requestContext: {} as never,
    resource: '',
    body: null,
    isBase64Encoded: false,
  } as APIGatewayProxyEvent;
}

describe('rows handler', () => {
  it('returns rows for a processed job', async () => {
    const csv = Buffer.from('name,email\nRowsAlice,rows-alice@example.com');
    const uploadResult = await uploadHandler(buildMultipartEvent(csv, 'rows-api.csv', 'users'));
    const { jobId } = JSON.parse(uploadResult.body);
    const job = await getJob(jobId);

    await processorHandler(buildSQSEvent(jobId, job!.s3Key, job!.schemaType, job!.etag));

    const result = await rowsHandler(buildGetRowsEvent(jobId));
    expect(result.statusCode).toBe(200);
    const body = JSON.parse(result.body);
    expect(body.rows).toHaveLength(1);
    expect(body.rows[0].valid).toBe(true);
    expect(body.rows[0].data.name).toBe('RowsAlice');
  });

  it('returns only failed rows with ?failed=true', async () => {
    const csv = Buffer.from('name,email\nFailedAlice,not-an-email\nFailedBob,bob-valid@example.com');
    const uploadResult = await uploadHandler(buildMultipartEvent(csv, 'rows-fail.csv', 'users'));
    const { jobId } = JSON.parse(uploadResult.body);
    const job = await getJob(jobId);

    await processorHandler(buildSQSEvent(jobId, job!.s3Key, job!.schemaType, job!.etag));

    const result = await rowsHandler(buildGetRowsEvent(jobId, true));
    expect(result.statusCode).toBe(200);
    const body = JSON.parse(result.body);
    expect(body.rows).toHaveLength(1);
    expect(body.rows[0].valid).toBe(false);
    expect(body.rows[0].errors.length).toBeGreaterThan(0);
  });
});
