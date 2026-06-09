terraform {
  backend "s3" {
    bucket = "datapipe-tfstate-799395849303"
    key    = "datapipe/terraform.tfstate"
    region = "eu-west-1"
  }
}
