import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import Busboy from 'busboy';
import { PutObjectCommand } from '@aws-sdk/client-s3';
import { SendMessageCommand } from '@aws-sdk/client-sqs';
import { TransactWriteCommand } from '@aws-sdk/lib-dynamodb';
import { TransactionCanceledException } from '@aws-sdk/client-dynamodb';
import { v4 as uuidv4 } from 'uuid';
import { createHash } from 'crypto';
import { s3, sqs, dynamo, httpHeaders } from '../lib/aws-clients';
import { SchemaType, SQSJobMessage } from '../types';

const JOBS_TABLE = process.env.JOBS_TABLE!;
const UPLOADS_BUCKET = process.env.UPLOADS_BUCKET!;
const QUEUE_URL = process.env.PROCESSING_QUEUE_URL!;
const SUPPORTED_EXTENSIONS = ['csv', 'json'];

function parseMultipart(
  event: APIGatewayProxyEvent,
): Promise<{ file: Buffer; filename: string; schemaType: string }> {
  return new Promise((resolve, reject) => {
    const contentType =
      event.headers['Content-Type'] ?? event.headers['content-type'] ?? '';
    const busboy = Busboy({ headers: { 'content-type': contentType } });

    let fileBuffer: Buffer | null = null;
    let filename = '';
    let schemaType = '';

    busboy.on('file', (_field, stream, info) => {
      filename = info.filename;
      const chunks: Buffer[] = [];
      stream.on('data', (chunk: Buffer) => chunks.push(chunk));
      stream.on('end', () => {
        fileBuffer = Buffer.concat(chunks);
      });
    });

    busboy.on('field', (name, value) => {
      if (name === 'schemaType') schemaType = value;
    });

    busboy.on('finish', () => {
      if (!fileBuffer) return reject(new Error('No file uploaded'));
      if (!schemaType) return reject(new Error('schemaType is required'));
      resolve({ file: fileBuffer, filename, schemaType });
    });

    busboy.on('error', reject);

    const bodyStr = event.isBase64Encoded
      ? Buffer.from(event.body ?? '', 'base64').toString('binary')
      : event.body ?? '';

    busboy.write(bodyStr, 'binary');
    busboy.end();
  });
}

function ok(body: object, origin?: string): APIGatewayProxyResult {
  return { statusCode: 200, headers: httpHeaders(origin), body: JSON.stringify(body) };
}

function err(status: number, message: string, origin?: string): APIGatewayProxyResult {
  return { statusCode: status, headers: httpHeaders(origin), body: JSON.stringify({ error: message }) };
}

export async function handler(
  event: APIGatewayProxyEvent,
): Promise<APIGatewayProxyResult> {
  const origin = event.headers?.origin ?? event.headers?.Origin;
  let parsed: { file: Buffer; filename: string; schemaType: string };

  try {
    parsed = await parseMultipart(event);
  } catch (e) {
    return err(400, (e as Error).message, origin);
  }

  const { file, filename, schemaType } = parsed;
  const ext = filename.split('.').pop()?.toLowerCase() ?? '';

  if (!SUPPORTED_EXTENSIONS.includes(ext)) {
    return err(400, `Unsupported file type: ${ext}. Supported: csv, json`, origin);
  }

  const etag = createHash('md5').update(file).digest('hex');
  const jobId = uuidv4();
  const s3Key = `uploads/${jobId}/${filename}`;
  const now = new Date().toISOString();

  await s3.send(
    new PutObjectCommand({
      Bucket: UPLOADS_BUCKET,
      Key: s3Key,
      Body: file,
      ContentType: ext === 'csv' ? 'text/csv' : 'application/json',
    }),
  );

  try {
    await dynamo.send(
      new TransactWriteCommand({
        TransactItems: [
          {
            Put: {
              TableName: JOBS_TABLE,
              Item: { pk: `etag#${etag}#${schemaType}`, jobId, createdAt: now },
              ConditionExpression: 'attribute_not_exists(pk)',
            },
          },
          {
            Put: {
              TableName: JOBS_TABLE,
              Item: {
                pk: jobId,
                etag,
                status: 'PENDING',
                schemaType: schemaType as SchemaType,
                s3Key,
                filename,
                totalRows: 0,
                processedRows: 0,
                failedRows: 0,
                createdAt: now,
                updatedAt: now,
              },
            },
          },
        ],
      }),
    );
  } catch (e) {
    if (
      e instanceof TransactionCanceledException &&
      e.CancellationReasons?.some((r) => r.Code === 'ConditionalCheckFailed')
    ) {
      return err(409, 'Duplicate file', origin);
    }
    throw e;
  }

  const message: SQSJobMessage = {
    jobId,
    s3Key,
    schemaType: schemaType as SchemaType,
    etag,
  };

  await sqs.send(
    new SendMessageCommand({
      QueueUrl: QUEUE_URL,
      MessageBody: JSON.stringify(message),
    }),
  );

  return ok({ jobId, status: 'PENDING' }, origin);
}
