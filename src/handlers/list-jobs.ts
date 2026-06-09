import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { QueryCommand } from '@aws-sdk/lib-dynamodb';
import { dynamo, httpHeaders } from '../lib/aws-clients';

const JOBS_TABLE = process.env.JOBS_TABLE!;

export async function handler(
  event: APIGatewayProxyEvent,
): Promise<APIGatewayProxyResult> {
  const origin = event.headers?.origin ?? event.headers?.Origin;
  const userId: string =
    (event.requestContext as any)?.authorizer?.claims?.sub ?? 'anonymous';

  const result = await dynamo.send(
    new QueryCommand({
      TableName: JOBS_TABLE,
      IndexName: 'userId-index',
      KeyConditionExpression: 'userId = :uid',
      ExpressionAttributeValues: { ':uid': userId },
      ScanIndexForward: false,
      Limit: 50,
    }),
  );

  return {
    statusCode: 200,
    headers: httpHeaders(origin),
    body: JSON.stringify({ jobs: result.Items ?? [] }),
  };
}
