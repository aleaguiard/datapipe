import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { QueryCommand, QueryCommandInput } from '@aws-sdk/lib-dynamodb';
import { dynamo, httpHeaders } from '../lib/aws-clients';
import { Row } from '../types';

const ROWS_TABLE = process.env.ROWS_TABLE!;
const PAGE_SIZE = 50;
// Upper bound on DynamoDB round-trips per request when filtering sparse
// failed rows. If reached, the caller gets a partial page plus a cursor.
const MAX_QUERIES = 10;

// Opaque cursor: base64url-encoded last returned rowIndex. Only the rowIndex
// is taken from the client — jobId always comes from the path, so a cursor
// cannot be used to read another job's rows.
export function encodeCursor(rowIndex: number): string {
  return Buffer.from(JSON.stringify({ r: rowIndex })).toString('base64url');
}

export function decodeCursor(cursor: string): number | null {
  try {
    const { r } = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8'));
    return Number.isSafeInteger(r) && r >= 0 ? r : null;
  } catch {
    return null;
  }
}

export async function handler(
  event: APIGatewayProxyEvent,
): Promise<APIGatewayProxyResult> {
  const headers = httpHeaders(event.headers?.origin ?? event.headers?.Origin);
  const jobId = event.pathParameters?.jobId;

  if (!jobId) {
    return {
      statusCode: 400,
      headers,
      body: JSON.stringify({ error: 'jobId is required' }),
    };
  }

  const onlyFailed = event.queryStringParameters?.failed === 'true';
  const rawCursor = event.queryStringParameters?.cursor;

  let startAfter: number | undefined;
  if (rawCursor) {
    const decoded = decodeCursor(rawCursor);
    if (decoded === null) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: 'invalid cursor' }),
      };
    }
    startAfter = decoded;
  }

  const rows: Row[] = [];
  let exclusiveStartKey: Record<string, unknown> | undefined =
    startAfter !== undefined ? { jobId, rowIndex: startAfter } : undefined;
  let exhausted = false;

  // Limit is applied by DynamoDB *before* FilterExpression, so a single query
  // with Limit=PAGE_SIZE can return far fewer failed rows than exist. Keep
  // querying until the page is full or the job's rows are exhausted.
  for (let i = 0; i < MAX_QUERIES && rows.length < PAGE_SIZE; i++) {
    const input: QueryCommandInput = {
      TableName: ROWS_TABLE,
      KeyConditionExpression: 'jobId = :jid',
      ExpressionAttributeValues: { ':jid': jobId },
      ExclusiveStartKey: exclusiveStartKey,
    };
    if (onlyFailed) {
      input.FilterExpression = 'valid = :f';
      input.ExpressionAttributeValues = { ':jid': jobId, ':f': false };
    } else {
      input.Limit = PAGE_SIZE - rows.length;
    }

    const result = await dynamo.send(new QueryCommand(input));
    rows.push(...((result.Items ?? []) as Row[]));
    exclusiveStartKey = result.LastEvaluatedKey;
    if (!exclusiveStartKey) {
      exhausted = true;
      break;
    }
  }

  // A filtered query may overshoot the page; trim it. The cursor then points
  // at the last row returned, which works because (jobId, rowIndex) is the
  // table's primary key.
  let nextCursor: string | null = null;
  if (rows.length > PAGE_SIZE) {
    rows.length = PAGE_SIZE;
    nextCursor = encodeCursor(rows[rows.length - 1].rowIndex);
  } else if (!exhausted && exclusiveStartKey) {
    nextCursor = encodeCursor(exclusiveStartKey.rowIndex as number);
  }

  return {
    statusCode: 200,
    headers,
    body: JSON.stringify({ rows, count: rows.length, nextCursor }),
  };
}
