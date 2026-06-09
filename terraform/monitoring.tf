# SNS topic for alarm notifications
resource "aws_sns_topic" "alarms" {
  name = "datapipe-alarms"
}

resource "aws_sns_topic_subscription" "alarm_email" {
  count     = var.alarm_email != "" ? 1 : 0
  topic_arn = aws_sns_topic.alarms.arn
  protocol  = "email"
  endpoint  = var.alarm_email
}

# Alarm: messages arriving in DLQ (processing failures)
resource "aws_cloudwatch_metric_alarm" "dlq_depth" {
  alarm_name          = "datapipe-dlq-messages"
  alarm_description   = "Messages in the dead letter queue — processing failures requiring investigation"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 1
  metric_name         = "ApproximateNumberOfMessagesVisible"
  namespace           = "AWS/SQS"
  period              = 60
  statistic           = "Sum"
  threshold           = 0
  treat_missing_data  = "notBreaching"
  alarm_actions       = [aws_sns_topic.alarms.arn]
  ok_actions          = [aws_sns_topic.alarms.arn]

  dimensions = {
    QueueName = aws_sqs_queue.processing_dlq.name
  }
}

# Alarm: Lambda processor errors
resource "aws_cloudwatch_metric_alarm" "processor_errors" {
  alarm_name          = "datapipe-processor-errors"
  alarm_description   = "datapipe-processor Lambda invocation errors"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 1
  metric_name         = "Errors"
  namespace           = "AWS/Lambda"
  period              = 60
  statistic           = "Sum"
  threshold           = 0
  treat_missing_data  = "notBreaching"
  alarm_actions       = [aws_sns_topic.alarms.arn]

  dimensions = {
    FunctionName = aws_lambda_function.processor.function_name
  }
}

# Alarm: upload Lambda errors
resource "aws_cloudwatch_metric_alarm" "upload_errors" {
  alarm_name          = "datapipe-upload-errors"
  alarm_description   = "datapipe-upload Lambda invocation errors"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 1
  metric_name         = "Errors"
  namespace           = "AWS/Lambda"
  period              = 60
  statistic           = "Sum"
  threshold           = 0
  treat_missing_data  = "notBreaching"
  alarm_actions       = [aws_sns_topic.alarms.arn]

  dimensions = {
    FunctionName = aws_lambda_function.upload.function_name
  }
}
