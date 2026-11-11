import { handler as uploadHandler } from '../../src/handlers/upload';
import { handler as processorHandler } from '../../src/handlers/processor';
import { handler as rowsHandler } from '../../src/handlers/rows';
import { buildMultipartEvent, getJob } from './helpers';
import { APIGatewayProxyEvent, SQSEvent } from 'aws-lambda';

function buildSQSEvent(jobId: string, s3Key: string, schemaType: string, etag: string): SQSEvent {
  return {
    Records: [{
      messageId: 'rows-msg-1',
      receiptHandle: 'x',
      body: JSON.stringify({ jobId, s3Key, schemaType, etag }),
      attributes: {} as never,
      messageAttributes: {},
      md5OfBody: '',
      eventSource: 'aws:sqs',
      eventSourceARN: 'arn:aws:sqs:eu-west-1:000000000000:datapipe-processing',
      awsRegion: 'eu-west-1',
    }],
  };
}

function buildGetRowsEvent(
  jobId: string,
  failed?: boolean,
  cursor?: string,
  userId: string | null = 'test-user-id',
): APIGatewayProxyEvent {
  const qs: Record<string, string> = {};
  if (failed) qs.failed = 'true';
  if (cursor) qs.cursor = cursor;
  return {
    httpMethod: 'GET',
    path: `/jobs/${jobId}/rows`,
    headers: {},
    multiValueHeaders: {},
    queryStringParameters: Object.keys(qs).length ? qs : null,
    multiValueQueryStringParameters: null,
    pathParameters: { jobId },
    stageVariables: null,
    requestContext: (userId ? { authorizer: { claims: { sub: userId } } } : {}) as never,
    resource: '',
    body: null,
    isBase64Encoded: false,
  } as APIGatewayProxyEvent;
}

describe('rows handler', () => {
  it('returns rows for a processed job', async () => {
    const csv = Buffer.from('name,email\nRowsAlice,rows-alice@example.com');
    const uploadResult = await uploadHandler(buildMultipartEvent(csv, 'rows-api.csv', 'users'));
    const { jobId } = JSON.parse(uploadResult.body);
    const job = await getJob(jobId);

    await processorHandler(buildSQSEvent(jobId, job!.s3Key, job!.schemaType, job!.etag));

    const result = await rowsHandler(buildGetRowsEvent(jobId));
    expect(result.statusCode).toBe(200);
    const body = JSON.parse(result.body);
    expect(body.rows).toHaveLength(1);
    expect(body.rows[0].valid).toBe(true);
    expect(body.rows[0].data.name).toBe('RowsAlice');
  });

  it('returns only failed rows with ?failed=true', async () => {
    const csv = Buffer.from('name,email\nFailedAlice,not-an-email\nFailedBob,bob-valid@example.com');
    const uploadResult = await uploadHandler(buildMultipartEvent(csv, 'rows-fail.csv', 'users'));
    const { jobId } = JSON.parse(uploadResult.body);
    const job = await getJob(jobId);

    await processorHandler(buildSQSEvent(jobId, job!.s3Key, job!.schemaType, job!.etag));

    const result = await rowsHandler(buildGetRowsEvent(jobId, true));
    expect(result.statusCode).toBe(200);
    const body = JSON.parse(result.body);
    expect(body.rows).toHaveLength(1);
    expect(body.rows[0].valid).toBe(false);
    expect(body.rows[0].errors.length).toBeGreaterThan(0);
  });

  async function processCsv(lines: string[], filename: string): Promise<string> {
    const csv = Buffer.from(['name,email', ...lines].join('\n'));
    const uploadResult = await uploadHandler(buildMultipartEvent(csv, filename, 'users'));
    const { jobId } = JSON.parse(uploadResult.body);
    const job = await getJob(jobId);
    await processorHandler(buildSQSEvent(jobId, job!.s3Key, job!.schemaType, job!.etag));
    return jobId;
  }

  async function fetchAll(jobId: string, failed: boolean) {
    const pages: { rowIndex: number; valid: boolean }[][] = [];
    let cursor: string | undefined;
    do {
      const result = await rowsHandler(buildGetRowsEvent(jobId, failed, cursor));
      expect(result.statusCode).toBe(200);
      const body = JSON.parse(result.body);
      pages.push(body.rows);
      cursor = body.nextCursor ?? undefined;
    } while (cursor);
    return pages;
  }

  it('paginates all rows in rowIndex order with nextCursor', async () => {
    const lines = Array.from({ length: 120 }, (_, i) => `Page${i},page${i}@example.com`);
    const jobId = await processCsv(lines, 'rows-paginate.csv');

    const pages = await fetchAll(jobId, false);
    const all = pages.flat();

    expect(pages[0]).toHaveLength(50);
    expect(all).toHaveLength(120);
    expect(all.map((r) => r.rowIndex)).toEqual(Array.from({ length: 120 }, (_, i) => i));
  });

  it('fills failed-row pages even when failures are sparse (Limit before filter)', async () => {
    // 200 rows, every 4th invalid -> 50 failed rows spread over the whole job.
    // The old single query (Limit=50 + filter) only saw the first 50 rows -> 12 failed.
    const lines = Array.from({ length: 200 }, (_, i) =>
      i % 4 === 3 ? `Sparse${i},not-an-email` : `Sparse${i},sparse${i}@example.com`,
    );
    const jobId = await processCsv(lines, 'rows-sparse-failed.csv');

    const pages = await fetchAll(jobId, true);
    const all = pages.flat();

    expect(pages[0]).toHaveLength(50);
    expect(all).toHaveLength(50);
    expect(all.every((r) => r.valid === false)).toBe(true);
    expect(new Set(all.map((r) => r.rowIndex)).size).toBe(50);
  });

  it('returns failed rows across multiple pages without gaps or duplicates', async () => {
    const lines = Array.from({ length: 150 }, (_, i) =>
      i % 2 === 0 ? `Multi${i},not-an-email` : `Multi${i},multi${i}@example.com`,
    );
    const jobId = await processCsv(lines, 'rows-multi-failed.csv');

    const pages = await fetchAll(jobId, true);
    const all = pages.flat();

    expect(pages[0]).toHaveLength(50);
    expect(all.map((r) => r.rowIndex)).toEqual(
      Array.from({ length: 75 }, (_, i) => i * 2),
    );
  });

  it('rejects a malformed cursor with 400', async () => {
    const result = await rowsHandler(buildGetRowsEvent('any-job', false, 'not-a-cursor'));
    expect(result.statusCode).toBe(400);
  });

  it("returns 404 for another user's job rows", async () => {
    const jobId = await processCsv(['Private,private@example.com'], 'rows-owner.csv');
    const result = await rowsHandler(buildGetRowsEvent(jobId, false, undefined, 'intruder-user'));
    expect(result.statusCode).toBe(404);
  });

  it('returns 401 without auth claims', async () => {
    const result = await rowsHandler(buildGetRowsEvent('any-job', false, undefined, null));
    expect(result.statusCode).toBe(401);
  });
});
