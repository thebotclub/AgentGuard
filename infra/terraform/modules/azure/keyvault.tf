###############################################################################
# AgentGuard — Azure Key Vault
###############################################################################

resource "azurerm_key_vault" "main" {
  name                       = "${var.project_name}-kv-${var.environment}"
  resource_group_name        = azurerm_resource_group.main.name
  location                   = var.location
  tenant_id                  = data.azurerm_client_config.current.tenant_id
  sku_name                   = "standard"
  soft_delete_retention_days  = 90
  purge_protection_enabled    = var.is_production
  rbac_authorization_enabled  = true
  tags                        = var.tags
}

# Grant the Container App identity access to read secrets
resource "azurerm_role_assignment" "kv_secrets_user" {
  scope                = azurerm_key_vault.main.id
  role_definition_name = "Key Vault Secrets User"
  principal_id         = azurerm_user_assigned_identity.container_app.principal_id
}

# Grant the current deployer access to manage secrets
resource "azurerm_role_assignment" "kv_secrets_officer" {
  scope                = azurerm_key_vault.main.id
  role_definition_name = "Key Vault Secrets Officer"
  principal_id         = data.azurerm_client_config.current.object_id
}

# ── Store secrets ───────────────────────────────────────────────────────────

resource "azurerm_key_vault_secret" "database_url" {
  name         = "DATABASE-URL"
  value        = "postgresql://${var.database_username}:${var.database_password}@${azurerm_postgresql_flexible_server.main.fqdn}:6432/${var.project_name}?sslmode=require&pgbouncer=true"
  key_vault_id = azurerm_key_vault.main.id
  depends_on   = [azurerm_role_assignment.kv_secrets_officer]
}

resource "azurerm_key_vault_secret" "database_direct_url" {
  name         = "DATABASE-DIRECT-URL"
  value        = "postgresql://${var.database_username}:${var.database_password}@${azurerm_postgresql_flexible_server.main.fqdn}:5432/${var.project_name}?sslmode=require"
  key_vault_id = azurerm_key_vault.main.id
  depends_on   = [azurerm_role_assignment.kv_secrets_officer]
}

resource "azurerm_key_vault_secret" "redis_url" {
  name         = "REDIS-URL"
  value        = "rediss://:${azurerm_redis_cache.main.primary_access_key}@${azurerm_redis_cache.main.hostname}:${azurerm_redis_cache.main.ssl_port}/0"
  key_vault_id = azurerm_key_vault.main.id
  depends_on   = [azurerm_role_assignment.kv_secrets_officer]
}

resource "azurerm_key_vault_secret" "jwt_secret" {
  name         = "JWT-SECRET"
  value        = var.jwt_secret
  key_vault_id = azurerm_key_vault.main.id
  depends_on   = [azurerm_role_assignment.kv_secrets_officer]
}

resource "azurerm_key_vault_secret" "api_key_salt" {
  name         = "API-KEY-SALT"
  value        = var.api_key_salt
  key_vault_id = azurerm_key_vault.main.id
  depends_on   = [azurerm_role_assignment.kv_secrets_officer]
}
