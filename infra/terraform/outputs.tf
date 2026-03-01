output "api_fqdn" {
  value       = module.azure.api_fqdn
  description = "API container app FQDN"
}

output "dashboard_fqdn" {
  value       = module.azure.dashboard_fqdn
  description = "Dashboard container app FQDN"
}

output "postgresql_fqdn" {
  value       = module.azure.postgresql_fqdn
  description = "PostgreSQL server FQDN"
}

output "redis_hostname" {
  value       = module.azure.redis_hostname
  description = "Redis cache hostname"
}

output "key_vault_name" {
  value       = module.azure.key_vault_name
  description = "Key Vault name"
}

output "acr_login_server" {
  value       = module.azure.acr_login_server
  description = "ACR login server"
}

output "resource_group_name" {
  value       = module.azure.resource_group_name
  description = "Resource group name"
}
