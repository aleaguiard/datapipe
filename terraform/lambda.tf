locals {
  lambda_role_arn = "arn:aws:iam::${data.aws_caller_identity.current.account_id}:role/studentLambdaExecutionRole"

  common_env = {
    JOBS_TABLE            = aws_dynamodb_table.jobs.name
    ROWS_TABLE            = aws_dynamodb_table.rows.name
    UPLOADS_BUCKET        = aws_s3_bucket.uploads.bucket
    PROCESSING_QUEUE_URL  = aws_sqs_queue.processing.url
    ALLOWED_ORIGIN        = var.allowed_origin
    ENDPOINT_OVERRIDE     = var.localstack_endpoint
  }

  handlers = {
    upload    = { source = "${path.module}/../.build/upload.js",    handler = "upload.handler",    timeout = 30,  memory = 256 }
    processor = { source = "${path.module}/../.build/processor.js", handler = "processor.handler", timeout = 300, memory = 256 }
    status    = { source = "${path.module}/../.build/status.js",    handler = "status.handler",    timeout = 10,  memory = 128 }
    list_jobs = { source = "${path.module}/../.build/list-jobs.js", handler = "list-jobs.handler", timeout = 10,  memory = 128 }
    rows      = { source = "${path.module}/../.build/rows.js",      handler = "rows.handler",      timeout = 10,  memory = 128 }
  }
}

data "archive_file" "upload" {
  type        = "zip"
  source_file = "${path.module}/../.build/upload.js"
  output_path = "${path.module}/../.build/upload.zip"
}

data "archive_file" "processor" {
  type        = "zip"
  source_file = "${path.module}/../.build/processor.js"
  output_path = "${path.module}/../.build/processor.zip"
}

data "archive_file" "status" {
  type        = "zip"
  source_file = "${path.module}/../.build/status.js"
  output_path = "${path.module}/../.build/status.zip"
}

data "archive_file" "list_jobs" {
  type        = "zip"
  source_file = "${path.module}/../.build/list-jobs.js"
  output_path = "${path.module}/../.build/list-jobs.zip"
}

data "archive_file" "rows" {
  type        = "zip"
  source_file = "${path.module}/../.build/rows.js"
  output_path = "${path.module}/../.build/rows.zip"
}

resource "aws_lambda_function" "upload" {
  function_name    = "datapipe-upload"
  filename         = data.archive_file.upload.output_path
  source_code_hash = data.archive_file.upload.output_base64sha256
  handler          = "upload.handler"
  runtime          = "nodejs22.x"
  architectures    = ["arm64"]
  timeout          = 30
  memory_size      = 256
  role             = local.lambda_role_arn

  environment { variables = local.common_env }
}

resource "aws_lambda_function" "processor" {
  function_name    = "datapipe-processor"
  filename         = data.archive_file.processor.output_path
  source_code_hash = data.archive_file.processor.output_base64sha256
  handler          = "processor.handler"
  runtime          = "nodejs22.x"
  architectures    = ["arm64"]
  timeout          = 300
  memory_size      = 256
  role             = local.lambda_role_arn

  environment { variables = local.common_env }
}

resource "aws_lambda_function" "status" {
  function_name    = "datapipe-status"
  filename         = data.archive_file.status.output_path
  source_code_hash = data.archive_file.status.output_base64sha256
  handler          = "status.handler"
  runtime          = "nodejs22.x"
  architectures    = ["arm64"]
  timeout          = 10
  memory_size      = 128
  role             = local.lambda_role_arn

  environment { variables = local.common_env }
}

resource "aws_lambda_function" "list_jobs" {
  function_name    = "datapipe-list-jobs"
  filename         = data.archive_file.list_jobs.output_path
  source_code_hash = data.archive_file.list_jobs.output_base64sha256
  handler          = "list-jobs.handler"
  runtime          = "nodejs22.x"
  architectures    = ["arm64"]
  timeout          = 10
  memory_size      = 128
  role             = local.lambda_role_arn

  environment { variables = local.common_env }
}

resource "aws_lambda_function" "rows" {
  function_name    = "datapipe-rows"
  filename         = data.archive_file.rows.output_path
  source_code_hash = data.archive_file.rows.output_base64sha256
  handler          = "rows.handler"
  runtime          = "nodejs22.x"
  architectures    = ["arm64"]
  timeout          = 10
  memory_size      = 128
  role             = local.lambda_role_arn

  environment { variables = local.common_env }
}

resource "aws_lambda_event_source_mapping" "processor_sqs" {
  event_source_arn = aws_sqs_queue.processing.arn
  function_name    = aws_lambda_function.processor.arn
  batch_size       = 1
  enabled          = true
}
