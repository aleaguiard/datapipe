import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import { S3Client } from '@aws-sdk/client-s3';
import { SQSClient } from '@aws-sdk/client-sqs';

// ENDPOINT_OVERRIDE is used instead of AWS_ENDPOINT_URL because Lambda strips
// AWS_* prefixed env vars from user-provided variables (SAM local enforces this).
function localEndpoint() {
  return process.env.ENDPOINT_OVERRIDE ?? process.env.AWS_ENDPOINT_URL;
}

function localCreds() {
  if (localEndpoint()) {
    return {
      accessKeyId: process.env.AWS_ACCESS_KEY_ID ?? 'test',
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY ?? 'test',
    };
  }
  return undefined;
}

function baseConfig() {
  const endpoint = localEndpoint();
  const region = process.env.AWS_REGION ?? 'eu-west-1';
  const credentials = localCreds();
  return endpoint ? { endpoint, region, credentials } : { region };
}

function s3Config() {
  const endpoint = localEndpoint();
  const region = process.env.AWS_REGION ?? 'eu-west-1';
  const credentials = localCreds();
  return endpoint
    ? { endpoint, region, forcePathStyle: true, credentials, requestChecksumCalculation: 'WHEN_REQUIRED' as const }
    : { region, requestChecksumCalculation: 'WHEN_REQUIRED' as const };
}

export const s3 = new S3Client(s3Config());
export const sqs = new SQSClient(baseConfig());
export const dynamo = DynamoDBDocumentClient.from(
  new DynamoDBClient(baseConfig()),
  { marshallOptions: { removeUndefinedValues: true } },
);

const ALLOWED_ORIGINS = new Set(
  ['http://localhost:8081', process.env.ALLOWED_ORIGIN].filter(Boolean) as string[],
);

export function httpHeaders(origin?: string): Record<string, string> {
  const allowed = origin && ALLOWED_ORIGINS.has(origin) ? origin : undefined;
  return {
    'Content-Type': 'application/json',
    ...(allowed && { 'Access-Control-Allow-Origin': allowed }),
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
  };
}
