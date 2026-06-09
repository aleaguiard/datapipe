# Datapipe

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
