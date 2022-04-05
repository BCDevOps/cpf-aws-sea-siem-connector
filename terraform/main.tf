provider "aws" {
  region = "ca-central-1"
}

locals {
  //Put all common tags here
  common_tags = {
    Project = "Secops log transfer"
  }
  lambda_src_path = "../lambda"
}
data "aws_caller_identity" "current" {}
data "aws_region" "current" {}
data "aws_ssm_parameter" "kms_arn" {
  name = "/PBMMAccel/encrypt/kms/1/arn"
}

resource "aws_s3_bucket" "log_connector_lambda_bucket" {
  bucket = "siem-log-connector-${data.aws_caller_identity.current.account_id}-${data.aws_region.current.name}"
}

resource "random_uuid" "lambda_src_hash" {
  keepers = {
    for filename in setunion(
      fileset(local.lambda_src_path, "*.js"),
      fileset(local.lambda_src_path, "*.json")
    ) :
    filename => filemd5("${local.lambda_src_path}/${filename}")
  }
}
resource "null_resource" "install_dependencies" {
  provisioner "local-exec" {
    command = "cd ${local.lambda_src_path} && npm install"
  }
  # Only re-run this if the dependencies or their versions
  # have changed since the last deployment with Terraform
  triggers = {
    dependencies_versions = filemd5("${local.lambda_src_path}/package.json")

  }
}

data "archive_file" "lambda_log_connector" {
  type = "zip"

  source_dir  = local.lambda_src_path
  output_path = "${path.module}/.tmp/${random_uuid.lambda_src_hash.result}.zip"
  depends_on  = [null_resource.install_dependencies]
}

resource "aws_s3_object" "lambda_log_connector" {
  bucket = aws_s3_bucket.log_connector_lambda_bucket.id
  key    = "lambda.zip"
  source = data.archive_file.lambda_log_connector.output_path
  etag   = filemd5(data.archive_file.lambda_log_connector.output_path)
}

resource "aws_lambda_function" "log_connector" {
  function_name = "SiemLogConnector"
  description   = "Node serverless function to push AWS Logs to SecOps Endpoint"

  s3_bucket = aws_s3_bucket.log_connector_lambda_bucket.id
  s3_key    = aws_s3_object.lambda_log_connector.key

  runtime = "nodejs14.x"
  handler = "./index.handler"

  environment {
    variables = {
      "LOG_CONSUMER_ENDPOINT" = var.log_consumer_endpoint
    }
  }

  source_code_hash = data.archive_file.lambda_log_connector.output_base64sha256
  role             = aws_iam_role.lambda_exec.arn
}


resource "aws_iam_role" "lambda_exec" {
  name = "SecOps_log_transfer_role"

  assume_role_policy = <<EOF
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Action": "sts:AssumeRole",
      "Principal": {
        "Service": "lambda.amazonaws.com"
      },
      "Effect": "Allow",
      "Sid": ""
    }
  ]
}
EOF
}

resource "aws_iam_policy" "lambda_policy" {
  name        = "SecOps_log_transfer_policy"
  description = "Policy for the Secops Connection Lambda"

  policy = <<EOF
{
    "Version": "2012-10-17",
    "Statement": [
        {
            "Sid": "VisualEditor0",
            "Effect": "Allow",
            "Action": [
                "s3:GetObjectAcl",
                "s3:GetObject",
                "kms:Decrypt",
                "kms:GenerateDataKey",
                "kms:DescribeKey"
            ],
            "Resource": [
                "arn:aws:s3:::*/*",
                "arn:aws:kms:*:${data.aws_caller_identity.current.account_id}:key/*"
            ]
        },
        {
            "Sid": "VisualEditor1",
            "Effect": "Allow",
            "Action": [
                "ssm:GetParameters",
                "ssm:GetParameter"
            ],
            "Resource": "arn:aws:ssm:${data.aws_region.current.name}:${data.aws_caller_identity.current.account_id}:parameter/secops/siem/cert"
        },
         {
          "Sid": "VisualEditor2",
          "Effect": "Allow",
          "Action": [
              "logs:CreateLogStream",
              "logs:CreateLogGroup",
              "logs:PutLogEvents"
          ],
          "Resource": "*"
        }
    ]
}
EOF
}

resource "aws_iam_role_policy_attachment" "test-attach" {
  role       = aws_iam_role.lambda_exec.name
  policy_arn = aws_iam_policy.lambda_policy.arn
}


data "aws_s3_bucket" "trigger" {
  for_each = var.trigger_bucket
  bucket   = each.value
}
resource "aws_lambda_permission" "allow_bucket" {
  for_each      = var.trigger_bucket
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.log_connector.arn
  principal     = "s3.amazonaws.com"
  source_arn    = data.aws_s3_bucket.trigger[each.key].arn
}

resource "aws_s3_bucket_notification" "bucket_notification" {
  for_each = var.trigger_bucket
  bucket   = data.aws_s3_bucket.trigger[each.key].id
  lambda_function {
    lambda_function_arn = aws_lambda_function.log_connector.arn
    events              = ["s3:ObjectCreated:*"]

  }

  depends_on = [aws_lambda_permission.allow_bucket]
}