variable "log_consumer_endpoint" {
  type = string
}
//Typically Log-Archive in the SEA has two buckets to store the logs"
variable "trigger_bucket" {
  type = set(string)
  # default = ["bucketname", "bucketname"]
}