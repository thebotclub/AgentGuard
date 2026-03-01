###############################################################################
# AgentGuard — Monitoring (Log Analytics)
###############################################################################

resource "azurerm_log_analytics_workspace" "main" {
  name                = "${var.project_name}-logs-${var.environment}"
  resource_group_name = azurerm_resource_group.main.name
  location            = var.location
  sku                 = "PerGB2018"
  retention_in_days   = var.is_production ? 90 : 30
  tags                = var.tags
}
