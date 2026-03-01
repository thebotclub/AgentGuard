output "api_fqdn" {
  value = azurerm_container_app.api.ingress[0].fqdn
}

output "dashboard_fqdn" {
  value = azurerm_container_app.dashboard.ingress[0].fqdn
}

output "postgresql_fqdn" {
  value = azurerm_postgresql_flexible_server.main.fqdn
}

output "redis_hostname" {
  value = azurerm_redis_cache.main.hostname
}

output "key_vault_name" {
  value = azurerm_key_vault.main.name
}

output "acr_login_server" {
  value = azurerm_container_registry.main.login_server
}

output "resource_group_name" {
  value = azurerm_resource_group.main.name
}
