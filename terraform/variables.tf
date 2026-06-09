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
  description = "Frontend origin allowed for CORS"
}

variable "environment" {
  type        = string
  default     = "prod"
  description = "prod | local"
}

variable "owner" {
  type    = string
  default = "ale-aguiar"
}

variable "alarm_email" {
  type        = string
  default     = ""
  description = "Email address for CloudWatch alarm notifications"
}

variable "budget_amount" {
  type        = string
  default     = "20"
  description = "Monthly budget threshold in USD"
}
