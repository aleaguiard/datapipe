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

output "cloudfront_url" {
  description = "CloudFront distribution domain (HTTPS frontend URL)"
  value       = length(aws_cloudfront_distribution.frontend) > 0 ? "https://${aws_cloudfront_distribution.frontend[0].domain_name}" : null
}

output "cognito_hosted_ui_url" {
  description = "Cognito Hosted UI login URL"
  value       = var.localstack_endpoint == "" ? "https://${aws_cognito_user_pool_domain.main.domain}.auth.${var.region}.amazoncognito.com" : null
}

output "cognito_client_id" {
  description = "Cognito App Client ID for the frontend"
  value       = var.localstack_endpoint == "" ? aws_cognito_user_pool_client.frontend.id : null
}

output "frontend_bucket" {
  description = "Frontend S3 bucket name"
  value       = aws_s3_bucket.frontend.bucket
}

output "cloudfront_distribution_id" {
  description = "CloudFront distribution ID for cache invalidation"
  value       = var.localstack_endpoint == "" ? aws_cloudfront_distribution.frontend[0].id : null
}
