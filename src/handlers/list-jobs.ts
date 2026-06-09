import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { ScanCommand } from '@aws-sdk/lib-dynamodb';
import { dynamo, httpHeaders } from '../lib/aws-clients';

const JOBS_TABLE = process.env.JOBS_TABLE!;

export async function handler(
  event: APIGatewayProxyEvent,
): Promise<APIGatewayProxyResult> {
  const result = await dynamo.send(
    new ScanCommand({
      TableName: JOBS_TABLE,
      Limit: 50,
    }),
  );

  const jobs = (result.Items ?? []).sort(
    (a, b) =>
      new Date(b.createdAt as string).getTime() -
      new Date(a.createdAt as string).getTime(),
  );

  return {
    statusCode: 200,
    headers: httpHeaders(event.headers?.origin ?? event.headers?.Origin),
    body: JSON.stringify({ jobs }),
  };
}
