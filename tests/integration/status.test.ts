import { handler as uploadHandler } from '../../src/handlers/upload';
import { handler as statusHandler } from '../../src/handlers/status';
import { handler as listJobsHandler } from '../../src/handlers/list-jobs';
import { buildMultipartEvent } from './helpers';
import { APIGatewayProxyEvent } from 'aws-lambda';

function buildGetEvent(
  path: string,
  pathParameters: Record<string, string> | null,
): APIGatewayProxyEvent {
  return {
    httpMethod: 'GET',
    path,
    headers: {},
    multiValueHeaders: {},
    queryStringParameters: null,
    multiValueQueryStringParameters: null,
    pathParameters,
    stageVariables: null,
    requestContext: {} as never,
    resource: '',
    body: null,
    isBase64Encoded: false,
  } as APIGatewayProxyEvent;
}

describe('status handler', () => {
  it('returns job details for a valid jobId', async () => {
    const csv = Buffer.from('name,email\nStatusAlice,status-alice@example.com');
    const uploadResult = await uploadHandler(
      buildMultipartEvent(csv, 'status-test.csv', 'users'),
    );
    const { jobId } = JSON.parse(uploadResult.body);

    const result = await statusHandler(
      buildGetEvent(`/jobs/${jobId}`, { jobId }),
    );

    expect(result.statusCode).toBe(200);
    const body = JSON.parse(result.body);
    expect(body.pk).toBe(jobId);
    expect(body.status).toBe('PENDING');
    expect(body.schemaType).toBe('users');
  });

  it('returns 404 for non-existent jobId', async () => {
    const result = await statusHandler(
      buildGetEvent('/jobs/non-existent-id', { jobId: 'non-existent-id' }),
    );
    expect(result.statusCode).toBe(404);
  });
});

describe('listJobs handler', () => {
  it('returns an array of jobs', async () => {
    const csv = Buffer.from('name,email\nListAlice,list-alice@example.com');
    await uploadHandler(buildMultipartEvent(csv, 'list-test-1.csv', 'users'));

    const result = await listJobsHandler(buildGetEvent('/jobs', null));

    expect(result.statusCode).toBe(200);
    const body = JSON.parse(result.body);
    expect(Array.isArray(body.jobs)).toBe(true);
    expect(body.jobs.length).toBeGreaterThanOrEqual(1);
  });
});
