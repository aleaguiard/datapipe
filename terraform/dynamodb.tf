resource "aws_dynamodb_table" "jobs" {
  name         = "datapipe-jobs"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "pk"

  attribute {
    name = "pk"
    type = "S"
  }
}

resource "aws_dynamodb_table" "rows" {
  name         = "datapipe-rows"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "pk"
  range_key    = "sk"

  attribute {
    name = "pk"
    type = "S"
  }

  attribute {
    name = "sk"
    type = "S"
  }

  attribute {
    name = "jobId"
    type = "S"
  }

  attribute {
    name = "rowIndex"
    type = "N"
  }

  global_secondary_index {
    name            = "jobId-index"
    hash_key        = "jobId"
    range_key       = "rowIndex"
    projection_type = "ALL"
  }
}
