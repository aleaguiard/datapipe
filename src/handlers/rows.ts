import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { QueryCommand } from '@aws-sdk/lib-dynamodb';
import { dynamo, httpHeaders } from '../lib/aws-clients';

const ROWS_TABLE = process.env.ROWS_TABLE!;
const PAGE_SIZE = 50;

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

  const onlyFailed = event.queryStringParameters?.failed === 'true';

  const result = await dynamo.send(
    new QueryCommand({
      TableName: ROWS_TABLE,
      IndexName: 'jobId-index',
      KeyConditionExpression: 'jobId = :jid',
      ExpressionAttributeValues: { ':jid': jobId },
      ...(onlyFailed && {
        FilterExpression: 'valid = :f',
        ExpressionAttributeValues: { ':jid': jobId, ':f': false },
      }),
      Limit: PAGE_SIZE,
    }),
  );

  return {
    statusCode: 200,
    headers: httpHeaders(event.headers?.origin ?? event.headers?.Origin),
    body: JSON.stringify({ rows: result.Items ?? [], count: result.Count ?? 0 }),
  };
}
