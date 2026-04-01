###############################################################################
# AgentGuard — PostgreSQL Flexible Server
###############################################################################

resource "azurerm_postgresql_flexible_server" "main" {
  name                         = "${var.project_name}-db-${var.environment}"
  resource_group_name          = azurerm_resource_group.main.name
  location                     = var.location
  version                      = "16"
  administrator_login          = var.database_username
  administrator_password       = var.database_password
  sku_name                     = var.database_sku
  storage_mb                   = var.is_production ? 65536 : 32768
  backup_retention_days        = var.is_production ? 35 : 7
  geo_redundant_backup_enabled = var.is_production
  delegated_subnet_id          = azurerm_subnet.postgresql.id
  private_dns_zone_id          = azurerm_private_dns_zone.postgresql.id
  zone                         = var.is_production ? "1" : null
  tags                         = var.tags

  authentication {
    password_auth_enabled = true
  }

  depends_on = [azurerm_private_dns_zone_virtual_network_link.postgresql]
}

resource "azurerm_postgresql_flexible_server_database" "main" {
  name      = var.project_name
  server_id = azurerm_postgresql_flexible_server.main.id
  charset   = "UTF8"
  collation = "en_US.utf8"
}

# ── PgBouncer configuration ────────────────────────────────────────────────

resource "azurerm_postgresql_flexible_server_configuration" "pgbouncer_enabled" {
  name      = "pgbouncer.enabled"
  server_id = azurerm_postgresql_flexible_server.main.id
  value     = "true"
}

resource "azurerm_postgresql_flexible_server_configuration" "pgbouncer_default_pool_size" {
  name      = "pgbouncer.default_pool_size"
  server_id = azurerm_postgresql_flexible_server.main.id
  value     = var.is_production ? "50" : "20"
}

# ── SSL enforcement ────────────────────────────────────────────────────────

resource "azurerm_postgresql_flexible_server_configuration" "require_ssl" {
  name      = "require_secure_transport"
  server_id = azurerm_postgresql_flexible_server.main.id
  value     = "on"
}
