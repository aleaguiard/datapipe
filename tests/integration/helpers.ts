import { APIGatewayProxyEvent } from 'aws-lambda';
import { DynamoDBDocumentClient, GetCommand } from '@aws-sdk/lib-dynamodb';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { Job } from '../../src/types';

const ENDPOINT = 'http://localhost:4566';
const REGION = 'eu-west-1';
const CREDS = { accessKeyId: 'test', secretAccessKey: 'test' };

export const testDynamo = DynamoDBDocumentClient.from(
  new DynamoDBClient({ endpoint: ENDPOINT, region: REGION, credentials: CREDS }),
);

export function buildMultipartEvent(
  fileBuffer: Buffer,
  filename: string,
  schemaType: string,
): APIGatewayProxyEvent {
  const boundary = '----TestBoundary';
  const CRLF = '\r\n';

  const parts = [
    `--${boundary}${CRLF}`,
    `Content-Disposition: form-data; name="schemaType"${CRLF}${CRLF}`,
    `${schemaType}${CRLF}`,
    `--${boundary}${CRLF}`,
    `Content-Disposition: form-data; name="file"; filename="${filename}"${CRLF}`,
    `Content-Type: text/plain${CRLF}${CRLF}`,
  ];

  const prefix = Buffer.from(parts.join(''), 'binary');
  const suffix = Buffer.from(`${CRLF}--${boundary}--${CRLF}`, 'binary');
  const body = Buffer.concat([prefix, fileBuffer, suffix]);

  return {
    httpMethod: 'POST',
    path: '/jobs/upload',
    headers: {
      'Content-Type': `multipart/form-data; boundary=${boundary}`,
      'content-type': `multipart/form-data; boundary=${boundary}`,
    },
    multiValueHeaders: {},
    queryStringParameters: null,
    multiValueQueryStringParameters: null,
    pathParameters: null,
    stageVariables: null,
    requestContext: {} as never,
    resource: '',
    body: body.toString('base64'),
    isBase64Encoded: true,
  } as APIGatewayProxyEvent;
}

export async function getJob(jobId: string): Promise<Job | undefined> {
  const result = await testDynamo.send(
    new GetCommand({ TableName: 'datapipe-jobs', Key: { pk: jobId } }),
  );
  return result.Item as Job | undefined;
}
