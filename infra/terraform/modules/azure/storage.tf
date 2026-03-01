###############################################################################
# AgentGuard — Azure Blob Storage (forensic blobs, exports)
###############################################################################

resource "azurerm_storage_account" "main" {
  name                     = "${var.project_name}stor${var.environment}"
  resource_group_name      = azurerm_resource_group.main.name
  location                 = var.location
  account_tier             = "Standard"
  account_replication_type = var.is_production ? "GRS" : "LRS"
  min_tls_version          = "TLS1_2"
  tags                     = var.tags

  blob_properties {
    delete_retention_policy {
      days = 30
    }
    versioning_enabled = var.is_production
  }
}

resource "azurerm_storage_container" "forensic" {
  name                  = "forensic-blobs"
  storage_account_id    = azurerm_storage_account.main.id
  container_access_type = "private"
}

resource "azurerm_storage_container" "exports" {
  name                  = "exports"
  storage_account_id    = azurerm_storage_account.main.id
  container_access_type = "private"
}
