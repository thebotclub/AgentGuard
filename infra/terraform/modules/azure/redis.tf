###############################################################################
# AgentGuard — Azure Cache for Redis
###############################################################################

resource "azurerm_redis_cache" "main" {
  name                 = "${var.project_name}-redis-${var.environment}"
  resource_group_name  = azurerm_resource_group.main.name
  location             = var.location
  capacity             = var.is_production ? 1 : 0
  family               = "C"
  sku_name             = var.is_production ? "Standard" : "Basic"
  non_ssl_port_enabled = false
  minimum_tls_version  = "1.2"
  tags                 = var.tags

  redis_configuration {
    maxmemory_policy = "allkeys-lru"
  }
}
