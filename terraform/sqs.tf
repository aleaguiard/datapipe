resource "aws_sqs_queue" "processing_dlq" {
  name                      = "datapipe-processing-dlq"
  message_retention_seconds = 1209600 # 14 days
}

resource "aws_sqs_queue" "processing" {
  name                       = "datapipe-processing"
  visibility_timeout_seconds = 300

  redrive_policy = jsonencode({
    deadLetterTargetArn = aws_sqs_queue.processing_dlq.arn
    maxReceiveCount     = 3
  })
}
