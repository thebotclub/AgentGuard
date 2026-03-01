environment    = "production"
azure_location = "uksouth"
database_sku   = "GP_Standard_D2ds_v4"

api_container_image       = "agentguardacr.azurecr.io/agentguard-api:latest"
worker_container_image    = "agentguardacr.azurecr.io/agentguard-workers:latest"
dashboard_container_image = "agentguardacr.azurecr.io/agentguard-dashboard:latest"
