output "api_url" {
  description = "REST API base URL"
  value       = "https://${aws_api_gateway_rest_api.api.id}.execute-api.${var.region}.amazonaws.com/${aws_api_gateway_stage.api.stage_name}"
}

output "frontend_url" {
  description = "S3 static website URL"
  value       = "http://${aws_s3_bucket.frontend.bucket}.s3-website-${var.region}.amazonaws.com"
}

output "uploads_bucket" {
  description = "S3 uploads bucket name"
  value       = aws_s3_bucket.uploads.bucket
}
