import { handler } from '../../src/handlers/upload';
import { buildMultipartEvent, getJob } from './helpers';

describe('upload handler', () => {
  const csvContent = Buffer.from('name,email\nAlice,alice@example.com\nBob,bob@example.com');
  const csvContent2 = Buffer.from('name,email\nCarol,carol@example.com\nDave,dave@example.com');

  it('returns 200 with jobId and PENDING status', async () => {
    const event = buildMultipartEvent(csvContent, 'users.csv', 'users');
    const result = await handler(event);

    expect(result.statusCode).toBe(200);
    const body = JSON.parse(result.body);
    expect(body.jobId).toBeDefined();
    expect(body.status).toBe('PENDING');
  });

  it('creates job record in DynamoDB', async () => {
    const event = buildMultipartEvent(csvContent2, 'users2.csv', 'users');
    const result = await handler(event);
    const body = JSON.parse(result.body);

    const job = await getJob(body.jobId);
    expect(job).toBeDefined();
    expect(job!.status).toBe('PENDING');
    expect(job!.schemaType).toBe('users');
    expect(job!.filename).toBe('users2.csv');
  });

  it('returns 409 for duplicate file (same content)', async () => {
    const dupContent = Buffer.from('name,email\nDupe,dupe@example.com');
    const event1 = buildMultipartEvent(dupContent, 'dup.csv', 'users');
    await handler(event1);

    const event2 = buildMultipartEvent(dupContent, 'dup.csv', 'users');
    const result = await handler(event2);

    expect(result.statusCode).toBe(409);
    const body = JSON.parse(result.body);
    expect(body.error).toBe('Duplicate file');
  });

  it('returns 400 for unsupported file extension', async () => {
    const event = buildMultipartEvent(Buffer.from('data'), 'data.xlsx', 'users');
    const result = await handler(event);
    expect(result.statusCode).toBe(400);
  });
});
