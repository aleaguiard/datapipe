terraform {
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
    archive = {
      source  = "hashicorp/archive"
      version = "~> 2.0"
    }
  }
}

provider "aws" {
  region = var.region

  dynamic "endpoints" {
    for_each = var.localstack_endpoint != "" ? [1] : []
    content {
      dynamodb   = var.localstack_endpoint
      s3         = var.localstack_endpoint
      sqs        = var.localstack_endpoint
      lambda     = var.localstack_endpoint
      apigateway = var.localstack_endpoint
      iam        = var.localstack_endpoint
    }
  }

  access_key                  = var.localstack_endpoint != "" ? "test" : null
  secret_key                  = var.localstack_endpoint != "" ? "test" : null
  skip_credentials_validation = var.localstack_endpoint != ""
  skip_metadata_api_check     = var.localstack_endpoint != ""
  skip_requesting_account_id  = var.localstack_endpoint != ""

  default_tags {
    tags = {
      Project     = "datapipe"
      Environment = var.environment
      Owner       = var.owner
    }
  }
}
