import { APIGatewayProxyEvent } from 'aws-lambda';
import { GetCommand } from '@aws-sdk/lib-dynamodb';
import { dynamo } from './aws-clients';

/** Cognito `sub` of the caller, or undefined if the request carries no claims. */
export function getUserId(event: APIGatewayProxyEvent): string | undefined {
  const claims = (event.requestContext as { authorizer?: { claims?: { sub?: unknown } } })
    ?.authorizer?.claims;
  return typeof claims?.sub === 'string' && claims.sub ? claims.sub : undefined;
}

/**
 * Loads a job only if it belongs to `userId`. Returns undefined both when the
 * job does not exist and when it belongs to someone else, so callers answer
 * 404 in both cases and job IDs cannot be probed across users.
 */
export async function getOwnedJob(
  jobsTable: string,
  jobId: string,
  userId: string,
): Promise<Record<string, unknown> | undefined> {
  const { Item } = await dynamo.send(
    new GetCommand({ TableName: jobsTable, Key: { pk: jobId } }),
  );
  return Item && Item.userId === userId ? Item : undefined;
}
