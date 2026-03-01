###############################################################################
# AgentGuard — Root Terraform Module
###############################################################################

terraform {
  backend "azurerm" {
    resource_group_name  = "terraform-state-rg"
    storage_account_name = "tfstateagentguard"
    container_name       = "tfstate"
    key                  = "agentguard.tfstate"
  }
}

provider "azurerm" {
  subscription_id = var.azure_subscription_id != "" ? var.azure_subscription_id : null
  features {
    key_vault {
      purge_soft_delete_on_destroy    = false
      recover_soft_deleted_key_vaults = true
    }
    resource_group {
      prevent_deletion_if_contains_resources = false
    }
  }
  resource_provider_registrations = "none"
}

locals {
  name_prefix   = "agentguard-${var.environment}"
  is_production = var.environment == "production"

  common_tags = {
    Project     = "agentguard"
    Environment = var.environment
    ManagedBy   = "terraform"
  }

  scaling = {
    api_min    = local.is_production ? 2 : 0
    api_max    = local.is_production ? 10 : 2
    worker_min = local.is_production ? 1 : 0
    worker_max = local.is_production ? 5 : 1
    dash_min   = local.is_production ? 1 : 0
    dash_max   = local.is_production ? 5 : 1
  }
}

module "azure" {
  source = "./modules/azure"

  project_name  = "agentguard"
  environment   = var.environment
  location      = var.azure_location
  tags          = local.common_tags
  is_production = local.is_production

  # Container images
  api_container_image       = var.api_container_image
  worker_container_image    = var.worker_container_image
  dashboard_container_image = var.dashboard_container_image

  # Scaling
  api_min_replicas    = local.scaling.api_min
  api_max_replicas    = local.scaling.api_max
  worker_min_replicas = local.scaling.worker_min
  worker_max_replicas = local.scaling.worker_max
  dash_min_replicas   = local.scaling.dash_min
  dash_max_replicas   = local.scaling.dash_max

  # Database
  database_sku      = var.database_sku
  database_username = var.database_username
  database_password = var.database_password

  # Secrets
  jwt_secret    = var.jwt_secret
  api_key_salt  = var.api_key_salt
}
