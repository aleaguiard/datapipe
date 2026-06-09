import { SQSEvent, SQSBatchResponse } from 'aws-lambda';
import { GetObjectCommand } from '@aws-sdk/client-s3';
import { PutCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { ConditionalCheckFailedException } from '@aws-sdk/client-dynamodb';
import { s3, dynamo } from '../lib/aws-clients';
import { parseFile } from '../lib/parser';
import { validateRow } from '../lib/validator';
import { SCHEMAS } from '../lib/schemas';
import { SQSJobMessage, SchemaType } from '../types';

const JOBS_TABLE = process.env.JOBS_TABLE!;
const ROWS_TABLE = process.env.ROWS_TABLE!;
const UPLOADS_BUCKET = process.env.UPLOADS_BUCKET!;

async function processJob(message: SQSJobMessage): Promise<void> {
  const { jobId, s3Key, schemaType } = message;

  await dynamo.send(
    new UpdateCommand({
      TableName: JOBS_TABLE,
      Key: { pk: jobId },
      UpdateExpression: 'SET #s = :s, updatedAt = :now',
      ExpressionAttributeNames: { '#s': 'status' },
      ExpressionAttributeValues: {
        ':s': 'PROCESSING',
        ':now': new Date().toISOString(),
      },
    }),
  );

  const s3Object = await s3.send(
    new GetObjectCommand({ Bucket: UPLOADS_BUCKET, Key: s3Key }),
  );

  const bodyBytes = await s3Object.Body!.transformToByteArray();
  const fileBuffer = Buffer.from(bodyBytes);
  const filename = s3Key.split('/').pop() ?? '';
  const rows = parseFile(fileBuffer, filename);
  const schema = SCHEMAS[schemaType as SchemaType];

  let processedRows = 0;
  let failedRows = 0;

  for (let i = 0; i < rows.length; i++) {
    const result = validateRow(rows[i], schema);
    const pk = `${jobId}#${i}`;

    try {
      await dynamo.send(
        new PutCommand({
          TableName: ROWS_TABLE,
          Item: {
            pk,
            jobId,
            rowIndex: i,
            data: result.data,
            valid: result.valid,
            errors: result.errors,
          },
          ConditionExpression: 'attribute_not_exists(pk)',
        }),
      );
    } catch (e) {
      if (!(e instanceof ConditionalCheckFailedException)) throw e;
    }

    if (result.valid) processedRows++;
    else failedRows++;
  }

  const finalStatus =
    failedRows === 0
      ? 'COMPLETED'
      : processedRows === 0
      ? 'FAILED'
      : 'PARTIAL_FAILURE';

  await dynamo.send(
    new UpdateCommand({
      TableName: JOBS_TABLE,
      Key: { pk: jobId },
      UpdateExpression:
        'SET #s = :s, totalRows = :total, processedRows = :proc, failedRows = :fail, updatedAt = :now',
      ExpressionAttributeNames: { '#s': 'status' },
      ExpressionAttributeValues: {
        ':s': finalStatus,
        ':total': rows.length,
        ':proc': processedRows,
        ':fail': failedRows,
        ':now': new Date().toISOString(),
      },
    }),
  );
}

export async function handler(event: SQSEvent): Promise<SQSBatchResponse> {
  const failures: SQSBatchResponse['batchItemFailures'] = [];

  for (const record of event.Records) {
    try {
      const message: SQSJobMessage = JSON.parse(record.body);
      await processJob(message);
    } catch (e) {
      console.error(`Failed to process message ${record.messageId}:`, e);
      failures.push({ itemIdentifier: record.messageId });
    }
  }

  return { batchItemFailures: failures };
}
