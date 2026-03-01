###############################################################################
# AgentGuard — Container Apps Environment + Apps (API, Workers, Dashboard)
###############################################################################

# ── Environment ─────────────────────────────────────────────────────────────

resource "azurerm_container_app_environment" "main" {
  name                       = "${var.project_name}-env-${var.environment}"
  resource_group_name        = azurerm_resource_group.main.name
  location                   = var.location
  log_analytics_workspace_id = azurerm_log_analytics_workspace.main.id
  infrastructure_subnet_id   = azurerm_subnet.container_apps.id
  tags                       = var.tags
}

# ── API Container App ──────────────────────────────────────────────────────

resource "azurerm_container_app" "api" {
  name                         = "${var.project_name}-api-${var.environment}"
  container_app_environment_id = azurerm_container_app_environment.main.id
  resource_group_name          = azurerm_resource_group.main.name
  revision_mode                = "Single"
  tags                         = var.tags

  identity {
    type         = "UserAssigned"
    identity_ids = [azurerm_user_assigned_identity.container_app.id]
  }

  registry {
    server   = azurerm_container_registry.main.login_server
    identity = azurerm_user_assigned_identity.container_app.id
  }

  secret {
    name                = "database-url"
    key_vault_secret_id = azurerm_key_vault_secret.database_url.id
    identity            = azurerm_user_assigned_identity.container_app.id
  }

  secret {
    name                = "database-direct-url"
    key_vault_secret_id = azurerm_key_vault_secret.database_direct_url.id
    identity            = azurerm_user_assigned_identity.container_app.id
  }

  secret {
    name                = "redis-url"
    key_vault_secret_id = azurerm_key_vault_secret.redis_url.id
    identity            = azurerm_user_assigned_identity.container_app.id
  }

  secret {
    name                = "jwt-secret"
    key_vault_secret_id = azurerm_key_vault_secret.jwt_secret.id
    identity            = azurerm_user_assigned_identity.container_app.id
  }

  secret {
    name                = "api-key-salt"
    key_vault_secret_id = azurerm_key_vault_secret.api_key_salt.id
    identity            = azurerm_user_assigned_identity.container_app.id
  }

  template {
    min_replicas = var.api_min_replicas
    max_replicas = var.api_max_replicas

    container {
      name   = "api"
      image  = var.api_container_image
      cpu    = var.is_production ? 1.0 : 0.5
      memory = var.is_production ? "2Gi" : "1Gi"

      env { name = "NODE_ENV";   value = "production" }
      env { name = "PORT";       value = "3000" }
      env { name = "LOG_LEVEL";  value = var.is_production ? "info" : "debug" }
      env { name = "SERVICE_NAME"; value = "agentguard-api" }

      env { name = "DATABASE_URL";        secret_name = "database-url" }
      env { name = "DATABASE_DIRECT_URL"; secret_name = "database-direct-url" }
      env { name = "REDIS_URL";           secret_name = "redis-url" }
      env { name = "JWT_SECRET";          secret_name = "jwt-secret" }
      env { name = "API_KEY_SALT";        secret_name = "api-key-salt" }

      liveness_probe {
        path             = "/v1/live"
        port             = 3000
        transport        = "HTTP"
        initial_delay    = 30
        interval_seconds = 30
        timeout          = 5
        failure_count_threshold = 3
      }

      readiness_probe {
        path             = "/v1/health"
        port             = 3000
        transport        = "HTTP"
        initial_delay    = 15
        interval_seconds = 10
        timeout          = 5
      }

      startup_probe {
        path             = "/v1/live"
        port             = 3000
        transport        = "HTTP"
        initial_delay    = 5
        interval_seconds = 5
        timeout          = 3
        failure_count_threshold = 10
      }
    }

    http_scale_rule {
      name                = "http-scaling"
      concurrent_requests = "50"
    }
  }

  ingress {
    external_enabled = true
    target_port      = 3000
    transport        = "http"

    traffic_weight {
      percentage      = 100
      latest_revision = true
    }
  }
}

# ── Workers Container App ──────────────────────────────────────────────────

resource "azurerm_container_app" "workers" {
  name                         = "${var.project_name}-workers-${var.environment}"
  container_app_environment_id = azurerm_container_app_environment.main.id
  resource_group_name          = azurerm_resource_group.main.name
  revision_mode                = "Single"
  tags                         = var.tags

  identity {
    type         = "UserAssigned"
    identity_ids = [azurerm_user_assigned_identity.container_app.id]
  }

  registry {
    server   = azurerm_container_registry.main.login_server
    identity = azurerm_user_assigned_identity.container_app.id
  }

  secret {
    name                = "database-url"
    key_vault_secret_id = azurerm_key_vault_secret.database_url.id
    identity            = azurerm_user_assigned_identity.container_app.id
  }

  secret {
    name                = "redis-url"
    key_vault_secret_id = azurerm_key_vault_secret.redis_url.id
    identity            = azurerm_user_assigned_identity.container_app.id
  }

  template {
    min_replicas = var.worker_min_replicas
    max_replicas = var.worker_max_replicas

    container {
      name   = "workers"
      image  = var.worker_container_image
      cpu    = var.is_production ? 1.0 : 0.5
      memory = var.is_production ? "2Gi" : "1Gi"

      env { name = "NODE_ENV";      value = "production" }
      env { name = "PORT";          value = "3001" }
      env { name = "SERVICE_NAME";  value = "agentguard-workers" }

      env { name = "DATABASE_URL"; secret_name = "database-url" }
      env { name = "REDIS_URL";    secret_name = "redis-url" }

      liveness_probe {
        path             = "/health"
        port             = 3001
        transport        = "HTTP"
        initial_delay    = 30
        interval_seconds = 30
        timeout          = 5
        failure_count_threshold = 3
      }

      readiness_probe {
        path             = "/health"
        port             = 3001
        transport        = "HTTP"
        initial_delay    = 15
        interval_seconds = 10
        timeout          = 5
      }
    }
  }

  # Workers are internal-only — no external ingress
}

# ── Dashboard Container App ────────────────────────────────────────────────

resource "azurerm_container_app" "dashboard" {
  name                         = "${var.project_name}-dashboard-${var.environment}"
  container_app_environment_id = azurerm_container_app_environment.main.id
  resource_group_name          = azurerm_resource_group.main.name
  revision_mode                = "Single"
  tags                         = var.tags

  identity {
    type         = "UserAssigned"
    identity_ids = [azurerm_user_assigned_identity.container_app.id]
  }

  registry {
    server   = azurerm_container_registry.main.login_server
    identity = azurerm_user_assigned_identity.container_app.id
  }

  secret {
    name                = "jwt-secret"
    key_vault_secret_id = azurerm_key_vault_secret.jwt_secret.id
    identity            = azurerm_user_assigned_identity.container_app.id
  }

  template {
    min_replicas = var.dash_min_replicas
    max_replicas = var.dash_max_replicas

    container {
      name   = "dashboard"
      image  = var.dashboard_container_image
      cpu    = 0.5
      memory = "1Gi"

      env { name = "NODE_ENV";                value = "production" }
      env { name = "PORT";                    value = "3000" }
      env { name = "NEXT_TELEMETRY_DISABLED"; value = "1" }
      env { name = "JWT_SECRET"; secret_name = "jwt-secret" }

      liveness_probe {
        path             = "/api/health"
        port             = 3000
        transport        = "HTTP"
        initial_delay    = 30
        interval_seconds = 30
        timeout          = 5
        failure_count_threshold = 3
      }

      readiness_probe {
        path             = "/api/health"
        port             = 3000
        transport        = "HTTP"
        initial_delay    = 15
        interval_seconds = 10
        timeout          = 5
      }
    }

    http_scale_rule {
      name                = "http-scaling"
      concurrent_requests = "50"
    }
  }

  ingress {
    external_enabled = true
    target_port      = 3000
    transport        = "http"

    traffic_weight {
      percentage      = 100
      latest_revision = true
    }
  }
}
