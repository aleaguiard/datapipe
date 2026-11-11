import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { httpHeaders } from '../lib/aws-clients';
import { getOwnedJob, getUserId } from '../lib/auth';

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

  const userId = getUserId(event);
  if (!userId) {
    return {
      statusCode: 401,
      headers: httpHeaders(event.headers?.origin ?? event.headers?.Origin),
      body: JSON.stringify({ error: 'Unauthorized' }),
    };
  }

  const job = await getOwnedJob(JOBS_TABLE, jobId, userId);

  if (!job) {
    return {
      statusCode: 404,
      headers: httpHeaders(event.headers?.origin ?? event.headers?.Origin),
      body: JSON.stringify({ error: 'Job not found' }),
    };
  }

  return {
    statusCode: 200,
    headers: httpHeaders(event.headers?.origin ?? event.headers?.Origin),
    body: JSON.stringify(job),
  };
}
