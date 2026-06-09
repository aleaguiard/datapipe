import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { GetCommand } from '@aws-sdk/lib-dynamodb';
import { dynamo, httpHeaders } from '../lib/aws-clients';

const JOBS_TABLE = process.env.JOBS_TABLE!;

export async function handler(
  event: APIGatewayProxyEvent,
): Promise<APIGatewayProxyResult> {
  const jobId = event.pathParameters?.jobId;

  if (!jobId) {
    return {
      statusCode: 400,
      headers: httpHeaders(event.headers?.origin ?? event.headers?.Origin),
      body: JSON.stringify({ error: 'jobId is required' }),
    };
  }

  const result = await dynamo.send(
    new GetCommand({ TableName: JOBS_TABLE, Key: { pk: jobId } }),
  );

  if (!result.Item) {
    return {
      statusCode: 404,
      headers: httpHeaders(event.headers?.origin ?? event.headers?.Origin),
      body: JSON.stringify({ error: 'Job not found' }),
    };
  }

  return {
    statusCode: 200,
    headers: httpHeaders(event.headers?.origin ?? event.headers?.Origin),
    body: JSON.stringify(result.Item),
  };
}
