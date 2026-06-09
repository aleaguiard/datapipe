resource "aws_dynamodb_table" "jobs" {
  name         = "datapipe-jobs"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "pk"

  attribute {
    name = "pk"
    type = "S"
  }

  attribute {
    name = "userId"
    type = "S"
  }

  attribute {
    name = "createdAt"
    type = "S"
  }

  global_secondary_index {
    name            = "userId-index"
    hash_key        = "userId"
    range_key       = "createdAt"
    projection_type = "ALL"
  }

  point_in_time_recovery {
    enabled = true
  }
}

resource "aws_dynamodb_table" "rows" {
  name         = "datapipe-rows"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "pk"

  attribute {
    name = "pk"
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

  point_in_time_recovery {
    enabled = true
  }
}
