variable "region" {
  type    = string
  default = "eu-west-1"
}

variable "localstack_endpoint" {
  type        = string
  default     = ""
  description = "Set to http://localhost:4566 for local dev with Floci/LocalStack"
}

variable "allowed_origin" {
  type        = string
  default     = ""
  description = "Frontend origin allowed for CORS (e.g. https://my-bucket.s3-website-eu-west-1.amazonaws.com)"
}
