###############################################################################
# AgentGuard — Root Variables
###############################################################################

variable "environment" {
  type        = string
  description = "Deployment environment (staging / production)"
  validation {
    condition     = contains(["staging", "production"], var.environment)
    error_message = "Environment must be staging or production."
  }
}

variable "azure_subscription_id" {
  type        = string
  description = "Azure subscription ID (leave empty to use CLI default)"
  default     = ""
}

variable "azure_location" {
  type        = string
  description = "Azure region"
  default     = "uksouth"
}

# ── Container images ────────────────────────────────────────────────────────

variable "api_container_image" {
  type        = string
  description = "Full image reference for the API container"
  default     = "agentguardacr.azurecr.io/agentguard-api:latest"
}

variable "worker_container_image" {
  type        = string
  description = "Full image reference for the worker container"
  default     = "agentguardacr.azurecr.io/agentguard-workers:latest"
}

variable "dashboard_container_image" {
  type        = string
  description = "Full image reference for the dashboard container"
  default     = "agentguardacr.azurecr.io/agentguard-dashboard:latest"
}

# ── Database ────────────────────────────────────────────────────────────────

variable "database_sku" {
  type        = string
  description = "PostgreSQL Flexible Server SKU"
  default     = "B_Standard_B1ms"
}

variable "database_username" {
  type        = string
  description = "PostgreSQL admin username"
  default     = "agentguardadmin"
}

variable "database_password" {
  type        = string
  description = "PostgreSQL admin password"
  sensitive   = true
}

# ── Secrets ─────────────────────────────────────────────────────────────────

variable "jwt_secret" {
  type        = string
  description = "JWT signing secret (HS256, ≥64 bytes)"
  sensitive   = true
}

variable "api_key_salt" {
  type        = string
  description = "bcrypt salt rounds for agent API key hashing"
  sensitive   = true
  default     = "12"
}

# ── Alerting ────────────────────────────────────────────────────────────────

variable "alert_email_addresses" {
  type        = list(string)
  description = "Email addresses for critical alert notifications"
  default     = []
}

variable "alert_webhook_url" {
  type        = string
  description = "Slack/PagerDuty incoming webhook URL for critical alerts"
  default     = ""
  sensitive   = true
}
