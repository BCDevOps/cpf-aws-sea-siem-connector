//module outputs should be defined and documented here.
output "s3_bucket" {
  description = "The S3 bucket where the connector lambda function is stored"
  value = aws_s3_bucket.log_connector_lambda_bucket.id
}
