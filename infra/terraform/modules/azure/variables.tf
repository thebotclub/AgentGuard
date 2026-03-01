variable "project_name" { type = string }
variable "environment" { type = string }
variable "location" { type = string }
variable "tags" { type = map(string) }
variable "is_production" { type = bool }

# Container images
variable "api_container_image" { type = string }
variable "worker_container_image" { type = string }
variable "dashboard_container_image" { type = string }

# Scaling
variable "api_min_replicas" { type = number }
variable "api_max_replicas" { type = number }
variable "worker_min_replicas" { type = number }
variable "worker_max_replicas" { type = number }
variable "dash_min_replicas" { type = number }
variable "dash_max_replicas" { type = number }

# Database
variable "database_sku" { type = string }
variable "database_username" { type = string }
variable "database_password" { type = string; sensitive = true }

# Secrets
variable "jwt_secret" { type = string; sensitive = true }
variable "api_key_salt" { type = string; sensitive = true }
