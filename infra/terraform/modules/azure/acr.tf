###############################################################################
# AgentGuard — Azure Container Registry
###############################################################################

resource "azurerm_container_registry" "main" {
  name                = "${var.project_name}acr"
  resource_group_name = azurerm_resource_group.main.name
  location            = var.location
  sku                 = var.is_production ? "Standard" : "Basic"
  admin_enabled       = false
  tags                = var.tags
}

# Grant the managed identity AcrPull so Container Apps can pull images
resource "azurerm_role_assignment" "acr_pull" {
  scope                = azurerm_container_registry.main.id
  role_definition_name = "AcrPull"
  principal_id         = azurerm_user_assigned_identity.container_app.principal_id
}
