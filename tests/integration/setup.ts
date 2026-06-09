import {
  DynamoDBClient,
  CreateTableCommand,
  DeleteTableCommand,
  ListTablesCommand,
  waitUntilTableNotExists,
} from '@aws-sdk/client-dynamodb';
import {
  S3Client,
  CreateBucketCommand,
  ListBucketsCommand,
} from '@aws-sdk/client-s3';
import {
  SQSClient,
  CreateQueueCommand,
  GetQueueUrlCommand,
} from '@aws-sdk/client-sqs';

const ENDPOINT = 'http://localhost:4566';
const REGION = 'eu-west-1';
const CREDS = { accessKeyId: 'test', secretAccessKey: 'test' };

const dynamo = new DynamoDBClient({ endpoint: ENDPOINT, region: REGION, credentials: CREDS });
const s3 = new S3Client({
  endpoint: ENDPOINT,
  region: REGION,
  forcePathStyle: true,
  credentials: CREDS,
});
const sqs = new SQSClient({ endpoint: ENDPOINT, region: REGION, credentials: CREDS });

async function resetTable(
  name: string,
  params: Omit<import('@aws-sdk/client-dynamodb').CreateTableCommandInput, 'TableName' | 'BillingMode'>,
) {
  const { TableNames } = await dynamo.send(new ListTablesCommand({}));
  if (TableNames?.includes(name)) {
    await dynamo.send(new DeleteTableCommand({ TableName: name }));
    await waitUntilTableNotExists({ client: dynamo, maxWaitTime: 30 }, { TableName: name });
  }
  await dynamo.send(
    new CreateTableCommand({
      TableName: name,
      BillingMode: 'PAY_PER_REQUEST',
      ...params,
    }),
  );
}

async function ensureBucket(name: string) {
  const { Buckets } = await s3.send(new ListBucketsCommand({}));
  if (Buckets?.some((b) => b.Name === name)) return;
  await s3.send(new CreateBucketCommand({ Bucket: name }));
}

async function ensureQueue(name: string) {
  try {
    await sqs.send(new GetQueueUrlCommand({ QueueName: name }));
  } catch {
    await sqs.send(new CreateQueueCommand({ QueueName: name }));
  }
}

export default async function globalSetup() {
  if (!process.env.JEST_INTEGRATION) return;

  await resetTable('datapipe-jobs', {
    AttributeDefinitions: [
      { AttributeName: 'pk', AttributeType: 'S' },
      { AttributeName: 'userId', AttributeType: 'S' },
      { AttributeName: 'createdAt', AttributeType: 'S' },
    ],
    KeySchema: [{ AttributeName: 'pk', KeyType: 'HASH' }],
    GlobalSecondaryIndexes: [
      {
        IndexName: 'userId-index',
        KeySchema: [
          { AttributeName: 'userId', KeyType: 'HASH' },
          { AttributeName: 'createdAt', KeyType: 'RANGE' },
        ],
        Projection: { ProjectionType: 'ALL' },
      },
    ],
  });

  await resetTable('datapipe-rows', {
    AttributeDefinitions: [
      { AttributeName: 'pk', AttributeType: 'S' },
      { AttributeName: 'jobId', AttributeType: 'S' },
      { AttributeName: 'rowIndex', AttributeType: 'N' },
    ],
    KeySchema: [{ AttributeName: 'pk', KeyType: 'HASH' }],
    GlobalSecondaryIndexes: [
      {
        IndexName: 'jobId-index',
        KeySchema: [
          { AttributeName: 'jobId', KeyType: 'HASH' },
          { AttributeName: 'rowIndex', KeyType: 'RANGE' },
        ],
        Projection: { ProjectionType: 'ALL' },
      },
    ],
  });

  await ensureBucket('datapipe-uploads-local');
  await ensureQueue('datapipe-processing');
  await ensureQueue('datapipe-processing-dlq');
}
