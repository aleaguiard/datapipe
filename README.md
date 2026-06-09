# Datapipe

![CI](https://github.com/aleaguiard/datapipe/actions/workflows/ci.yml/badge.svg)
![Deploy](https://github.com/aleaguiard/datapipe/actions/workflows/deploy.yml/badge.svg)

Serverless bulk file import platform built on AWS. Upload CSV or JSON files through a web UI, validate each row against a predefined schema, and track processing status in real time.

## Architecture

```
Browser → CloudFront → S3 (static frontend)
Browser → API Gateway → UploadFunction → S3 + DynamoDB + SQS
                                                      ↓
                                           ProcessorFunction (SQS trigger)
                                                      ↓
                                            DynamoDB (rows + job status)
```

| Layer     | Service                                         |
|-----------|-------------------------------------------------|
| CDN       | Amazon CloudFront (HTTPS, price class 100)      |
| API       | Amazon API Gateway (REST)                       |
| Compute   | AWS Lambda (Node.js 22.x, arm64 / Graviton)     |
| Queue     | Amazon SQS + Dead Letter Queue                  |
| Storage   | Amazon S3 (uploads + static frontend)           |
| Database  | Amazon DynamoDB (jobs + rows)                   |
| IaC       | Terraform + esbuild                             |
| Local dev | Floci (AWS emulator, port 4566)                 |
| CI tests  | LocalStack v3                                   |

## Features

- **CSV and JSON** upload (auto-detects `;` vs `,` delimiter for CSV)
- **Schema validation** — `users`, `orders`, `contacts` built-in schemas
- **Idempotency** — duplicate file + schema combinations rejected with HTTP 409
- **Row-level results** — every row stored with per-field validation errors
- **Job statuses** — `PENDING → PROCESSING → COMPLETED / PARTIAL_FAILURE / FAILED`
- **Smart polling** — frontend polls only active jobs, stops on terminal state
- **CORS** — per-origin allowlist, no wildcard `*`

## Architectural Decision

**Why serverless (Lambda + SQS + DynamoDB)?**

The core challenge is reliable bulk async processing — files can have thousands of rows, processing may fail per-row, and uploads must respond instantly. A serverless event-driven stack is the natural fit:

- **Decoupled upload and processing:** Upload Lambda responds in <1s regardless of file size. SQS carries the work to the Processor Lambda asynchronously — no HTTP timeout risk.
- **Lambda over ECS/EC2:** No idle cost, automatic scaling, zero ops. For batch workloads that run on-demand, serverless is cheaper and simpler than maintaining always-on containers.
- **DynamoDB over RDS:** Schema-free rows (each import may have different fields), single-digit millisecond reads for status polling, and pay-per-request billing that costs nothing when idle.
- **SQS over SNS/EventBridge:** Built-in retry with visibility timeout, dead letter queue after 3 failures, and exactly-once processing with conditional writes on the consumer side.
- **Terraform over SAM/CDK:** Gives full control over every resource (API GW binary types, DynamoDB GSI, CloudFront) without framework abstractions hiding behaviour.
- **CloudFront over direct S3:** HTTPS on the frontend with zero extra infrastructure. Price class 100 covers EU + NA edge locations — sufficient for the course audience.

Trade-offs accepted: API Gateway's 10 MB payload limit caps file size (pre-signed URL upload would remove this); shared `studentLambdaExecutionRole` is broader than least-privilege per-function IAM; no custom domain (would require ACM + Route 53).

## Schemas

| Schema     | Required fields                              | Optional      |
|------------|----------------------------------------------|---------------|
| `users`    | `name`, `email`                              | `age` (number)|
| `orders`   | `orderId`, `productName`, `quantity`, `price`| —             |
| `contacts` | `firstName`, `lastName`, `email`             | `phone`       |

## Project Structure

```
src/
  handlers/
    upload.ts        # POST /jobs/upload — parses multipart, deduplicates, queues
    processor.ts     # SQS consumer — validates rows, writes to DynamoDB
    status.ts        # GET /jobs/{jobId}
    list-jobs.ts     # GET /jobs
    rows.ts          # GET /jobs/{jobId}/rows?failed=true
  lib/
    aws-clients.ts   # SDK clients + CORS header helper
    parser.ts        # CSV and JSON parsing
    schemas.ts       # Schema definitions
    validator.ts     # Per-field row validation
  types/index.ts     # Shared TypeScript types

tests/
  unit/              # Parser, schema, validator — no AWS needed
  integration/       # Full handler tests against LocalStack/Floci

frontend/
  index.html
  app.js
  config.example.js  # Copy to config.js (gitignored) with your API URL

terraform/
  provider.tf        # AWS provider with local/prod switching
  variables.tf       # Inputs: region, localstack_endpoint, allowed_origin
  dynamodb.tf        # Jobs + Rows tables
  sqs.tf             # Processing queue + DLQ
  s3.tf              # Uploads bucket + frontend bucket
  lambda.tf          # All Lambda functions + SQS event source mapping
  api_gateway.tf     # REST API, routes, CORS OPTIONS, deployment
  outputs.tf         # api_url, frontend_url, uploads_bucket
  *.tfvars.example   # Copy to *.tfvars (gitignored) before deploying

scripts/
  build.js           # esbuild bundles all handlers to .build/

test-data/           # Sample files for manual testing
  users-good.csv     users-partial.csv     users-error.csv
  orders-good.json   orders-partial.json   orders-error.json
```

## API

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/jobs/upload` | Upload file — `multipart/form-data`: `file` + `schemaType` |
| `GET`  | `/jobs` | List jobs (most recent first) |
| `GET`  | `/jobs/{jobId}` | Get job status and counters |
| `GET`  | `/jobs/{jobId}/rows?failed=true` | Get rows (filter failed, max 50) |

## Local Development

### Prerequisites

- Node.js 22+
- Terraform 1.6+
- Docker (for Floci)

### Setup

```bash
git clone https://github.com/aleaguiard/datapipe
cd datapipe
npm install
cp terraform/local.tfvars.example terraform/local.tfvars
```

### Run locally

```bash
# 1. Start Floci (AWS emulator)
docker run --rm -p 4566:4566 floci/aws

# 2. Build Lambda bundles
npm run build

# 3. Deploy infrastructure to Floci
terraform -chdir=terraform init
terraform -chdir=terraform apply -var-file=local.tfvars

# 4. Serve frontend
cd frontend && python3 -m http.server 8080
```

The Terraform output prints the local API URL (e.g. `http://localhost:4566/restapis/.../api/_user_request_`).

### Testing

```bash
# Unit tests (no infrastructure needed)
npm run test:unit

# Integration tests (requires Floci on :4566)
npm run test:integration

# Lint + typecheck
npm run lint && npm run typecheck
```

**34 tests total** — 21 unit, 13 integration.

## Deploy to AWS

```bash
# 1. Build Lambda bundles
npm run build

# 2. Configure prod tfvars
cp terraform/prod.tfvars.example terraform/prod.tfvars
# First deploy: leave allowed_origin empty, fill in after step 3

# 3. Deploy infrastructure (creates CloudFront + all AWS resources)
terraform -chdir=terraform init
terraform -chdir=terraform apply -var-file=prod.tfvars

# Terraform prints:
#   api_url         = https://<id>.execute-api.eu-west-1.amazonaws.com/api
#   cloudfront_url  = https://<hash>.cloudfront.net
#   frontend_url    = http://datapipe-frontend-<account>.s3-website-eu-west-1.amazonaws.com

# 4. Update allowed_origin in prod.tfvars to the cloudfront_url, then redeploy
#    allowed_origin = "https://<hash>.cloudfront.net"
terraform -chdir=terraform apply -var-file=prod.tfvars

# 5. Upload frontend
API_URL=$(terraform -chdir=terraform output -raw api_url)
echo "window.DATAPIPE_API_URL = '${API_URL}';" > frontend/config.js
aws s3 sync frontend/ s3://datapipe-frontend-<account-id>/
```

Requires AWS credentials with Lambda, DynamoDB, SQS, S3, API Gateway, and CloudFront permissions.  
Uses a pre-existing `studentLambdaExecutionRole` IAM role — no `iam:CreateRole` needed.

## Proof of Fault Tolerance

### Validation failures (partial errors)

Upload a file with some invalid rows — the processor marks each invalid row with its error reason and continues processing the rest normally.

Using `test-data/users-partial.csv` (mix of valid and invalid rows):

```
POST /jobs/upload → 200 { "jobId": "...", "status": "PENDING" }
GET  /jobs/{jobId} → 200 {
  "status": "PARTIAL_FAILURE",
  "totalRows": 10,
  "processedRows": 7,
  "failedRows": 3
}
GET  /jobs/{jobId}/rows?failed=true → 200 {
  "rows": [
    { "rowIndex": 2, "valid": false, "errors": ["email: invalid format"] },
    { "rowIndex": 5, "valid": false, "errors": ["email: required"] },
    { "rowIndex": 8, "valid": false, "errors": ["name: required", "email: required"] }
  ]
}
```

Valid rows are persisted normally. Failed rows are stored with their error reasons. Job status reflects the split: `PARTIAL_FAILURE`.

### System-level failure → DLQ → alarm

To trigger a system failure (not a validation failure), inject a malformed message directly into SQS:

```bash
QUEUE_URL=$(aws sqs get-queue-url --queue-name datapipe-processing \
  --region eu-west-1 --query QueueUrl --output text)

aws sqs send-message \
  --queue-url "$QUEUE_URL" \
  --message-body '{"jobId":"test","s3Key":"noexiste.csv","schemaType":"users","etag":"abc"}' \
  --region eu-west-1
```

**What happens:**
1. Processor Lambda invoked → `GetObject("noexiste.csv")` → `AccessDenied` (S3 masks NoSuchKey as 403) → message returned via `batchItemFailures`
2. SQS retries 3 times (visibility timeout 300 s between each)
3. After 3 failures → message moved to Dead Letter Queue
4. CloudWatch detects `ApproximateNumberOfMessagesVisible > 0` on DLQ → alarm `datapipe-dlq-messages` transitions to `ALARM`
5. SNS publishes to `datapipe-alarms` topic → email delivered to subscribed address

Lambda logs (CloudWatch `/aws/lambda/datapipe-processor`) show the three failure attempts, each with the message ID and error:

```
ERROR Failed to process message <id>: AccessDenied: s3:ListBucket not authorized
ERROR Failed to process message <id>: AccessDenied: s3:ListBucket not authorized
ERROR Failed to process message <id>: AccessDenied: s3:ListBucket not authorized
```

To confirm message in DLQ:

```bash
DLQ_URL=$(aws sqs get-queue-url --queue-name datapipe-processing-dlq \
  --region eu-west-1 --query QueueUrl --output text)

aws sqs receive-message --queue-url "$DLQ_URL" \
  --attribute-names ApproximateReceiveCount --region eu-west-1
# → ApproximateReceiveCount: "4" (3 retries + 1 DLQ receive)
```

---

## Proof of Idempotency

Uploading the same file to the same schema twice returns HTTP 409 on the second attempt. The deduplication key is `etag#{userId}#{md5(file)}#{schemaType}` stored atomically in DynamoDB alongside the job record.

**Same file, same schema → rejected:**

```
POST /jobs/upload (file: users.csv, schema: users) → 200 { "jobId": "abc-123" }
POST /jobs/upload (file: users.csv, schema: users) → 409 { "error": "Duplicate file" }
```

No duplicate job is created. No duplicate rows are written.

**Same file, different schema → accepted:**

```
POST /jobs/upload (file: data.csv, schema: users)    → 200 { "jobId": "abc-123" }
POST /jobs/upload (file: data.csv, schema: contacts) → 200 { "jobId": "def-456" }
```

The deduplication is scoped to `(user, file content, schema)` — not just file content — so the same bytes can be imported under different schemas.

**Row-level idempotency:** the Processor uses `ConditionExpression: attribute_not_exists(pk)` on every DynamoDB row write. Reprocessing the same SQS message (e.g. after a Lambda timeout) will not duplicate rows — duplicate writes are silently ignored.

---

## Cost Estimate

For ~10,000 file uploads/month averaging 1,000 rows each:

| Service | Cost/month |
|---------|------------|
| Lambda (upload + processor invocations) | ~$2.50 |
| DynamoDB (10M writes + reads, PAY_PER_REQUEST) | ~$3.00 |
| SQS (10,000 messages) | ~$0.01 |
| S3 (10 GB storage + requests) | ~$0.30 |
| API Gateway (50,000 requests) | ~$0.18 |
| CloudFront (10 GB transfer, PriceClass_100) | ~$0.90 |
| **Total** | **~$7/month** |

Zero cost when idle — all services use pay-per-request billing.

## Git Workflow

- `main` — production, merged via PR from `dev` only
- `dev` — integration branch, merged via PR only
- Every PR must pass CI before merge
- Conventional commits: `feat:`, `fix:`, `chore:`, `ci:`, `test:`, `docs:`

## CI/CD

GitHub Actions runs on every PR targeting `dev` or `main`:

1. `npm run lint`
2. `npm run typecheck`
3. `npm run test:unit`
4. `npm run test:integration` — spins up LocalStack v3 as a service container

Required GitHub Secrets (Settings → Secrets and variables → Actions):
- `AWS_ACCESS_KEY_ID` — from `aws configure export-credentials`
- `AWS_SECRET_ACCESS_KEY` — from `aws configure export-credentials`
- `AWS_SESSION_TOKEN` — from `aws configure export-credentials` (rotates with SSO session)

## Destroy

To tear down all AWS infrastructure:

```bash
eval "$(aws configure export-credentials --format env)"
terraform -chdir=terraform destroy -auto-approve
```

This removes all Lambda functions, DynamoDB tables, SQS queues, S3 buckets (including uploaded files), API Gateway, and CloudFront distribution. The tfstate S3 bucket is NOT removed (it's managed outside Terraform). Delete it manually if needed:

```bash
aws s3 rb s3://datapipe-tfstate-799395849303 --force
```
