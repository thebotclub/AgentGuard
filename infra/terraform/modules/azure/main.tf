###############################################################################
# AgentGuard — Azure Module: Resource Group + Identity
###############################################################################

data "azurerm_client_config" "current" {}

resource "azurerm_resource_group" "main" {
  name     = "rg-${var.project_name}-${var.environment}"
  location = var.location
  tags     = var.tags
}

resource "azurerm_user_assigned_identity" "container_app" {
  name                = "${var.project_name}-identity-${var.environment}"
  resource_group_name = azurerm_resource_group.main.name
  location            = var.location
  tags                = var.tags
}
