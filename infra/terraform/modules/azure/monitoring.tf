###############################################################################
# AgentGuard — Monitoring (Log Analytics + Application Insights + Alerts)
###############################################################################

# ── Log Analytics Workspace ────────────────────────────────────────────────

resource "azurerm_log_analytics_workspace" "main" {
  name                = "${var.project_name}-logs-${var.environment}"
  resource_group_name = azurerm_resource_group.main.name
  location            = var.location
  sku                 = "PerGB2018"
  retention_in_days   = var.is_production ? 90 : 30
  tags                = var.tags
}

# ── Application Insights ──────────────────────────────────────────────────

resource "azurerm_application_insights" "main" {
  name                = "${var.project_name}-appinsights-${var.environment}"
  resource_group_name = azurerm_resource_group.main.name
  location            = var.location
  workspace_id        = azurerm_log_analytics_workspace.main.id
  application_type    = "web"
  retention_in_days   = var.is_production ? 90 : 30
  tags                = var.tags
}

# ── Action Group — alerts go here ─────────────────────────────────────────

resource "azurerm_monitor_action_group" "critical" {
  name                = "${var.project_name}-alerts-critical-${var.environment}"
  resource_group_name = azurerm_resource_group.main.name
  short_name          = "ag-crit"
  tags                = var.tags

  dynamic "email_receiver" {
    for_each = var.alert_email_addresses
    content {
      name                    = "email-${email_receiver.key}"
      email_address           = email_receiver.value
      use_common_alert_schema = true
    }
  }

  dynamic "webhook_receiver" {
    for_each = var.alert_webhook_url != "" ? [1] : []
    content {
      name                    = "slack-webhook"
      service_uri             = var.alert_webhook_url
      use_common_alert_schema = true
    }
  }
}

###############################################################################
# Alert Rules
###############################################################################

# ── 1. Availability: health check fails 2+ consecutive checks ─────────────

resource "azurerm_monitor_metric_alert" "api_health_check" {
  name                = "${var.project_name}-alert-healthcheck-${var.environment}"
  resource_group_name = azurerm_resource_group.main.name
  scopes              = [azurerm_container_app.api.id]
  description         = "API health check failing — 2+ consecutive failures"
  severity            = 0
  frequency           = "PT1M"
  window_size         = "PT5M"
  auto_mitigate       = true
  enabled             = var.is_production
  tags                = var.tags

  criteria {
    metric_namespace = "Microsoft.App/containerApps"
    metric_name      = "RestartCount"
    aggregation      = "Total"
    operator         = "GreaterThan"
    threshold        = 2
  }

  action {
    action_group_id = azurerm_monitor_action_group.critical.id
  }
}

# ── 2. Error rate: 5xx > 5% over 5 minutes ───────────────────────────────

resource "azurerm_monitor_metric_alert" "api_error_rate" {
  name                = "${var.project_name}-alert-5xx-rate-${var.environment}"
  resource_group_name = azurerm_resource_group.main.name
  scopes              = [azurerm_container_app.api.id]
  description         = "API 5xx error rate exceeds 5% over 5 minutes"
  severity            = 1
  frequency           = "PT1M"
  window_size         = "PT5M"
  auto_mitigate       = true
  enabled             = var.is_production
  tags                = var.tags

  dynamic_criteria {
    metric_namespace  = "Microsoft.App/containerApps"
    metric_name       = "Requests"
    aggregation       = "Total"
    operator          = "GreaterThan"
    alert_sensitivity = "Medium"

    dimension {
      name     = "statusCodeCategory"
      operator = "Include"
      values   = ["5xx"]
    }
  }

  action {
    action_group_id = azurerm_monitor_action_group.critical.id
  }
}

# ── 3. Latency: P95 > 500ms for 5 minutes ────────────────────────────────

resource "azurerm_monitor_scheduled_query_rules_alert_v2" "api_latency" {
  name                = "${var.project_name}-alert-latency-${var.environment}"
  resource_group_name = azurerm_resource_group.main.name
  location            = var.location
  scopes              = [azurerm_application_insights.main.id]
  description         = "API P95 latency exceeds 500ms for 5 minutes"
  severity            = 2
  enabled             = var.is_production
  tags                = var.tags

  evaluation_frequency = "PT5M"
  window_duration      = "PT5M"

  criteria {
    query = <<-KQL
      requests
      | where timestamp > ago(5m)
      | summarize p95_duration = percentile(duration, 95)
      | where p95_duration > 500
    KQL

    time_aggregation_method = "Count"
    operator                = "GreaterThan"
    threshold               = 0
    failing_periods {
      minimum_failing_periods_to_trigger_alert = 1
      number_of_evaluation_periods             = 1
    }
  }

  action {
    action_groups = [azurerm_monitor_action_group.critical.id]
  }
}

# ── 4. CPU: > 80% for 10 minutes ─────────────────────────────────────────

resource "azurerm_monitor_metric_alert" "api_cpu" {
  name                = "${var.project_name}-alert-cpu-${var.environment}"
  resource_group_name = azurerm_resource_group.main.name
  scopes              = [azurerm_container_app.api.id]
  description         = "API CPU usage exceeds 80% for 10 minutes"
  severity            = 2
  frequency           = "PT5M"
  window_size         = "PT10M"
  auto_mitigate       = true
  enabled             = var.is_production
  tags                = var.tags

  criteria {
    metric_namespace = "Microsoft.App/containerApps"
    metric_name      = "UsageNanoCores"
    aggregation      = "Average"
    operator         = "GreaterThan"
    threshold        = 800000000 # 80% of 1 vCPU = 0.8 * 1e9 nanocores
  }

  action {
    action_group_id = azurerm_monitor_action_group.critical.id
  }
}

# ── 5. Redis: memory > 80% ───────────────────────────────────────────────

resource "azurerm_monitor_metric_alert" "redis_memory" {
  name                = "${var.project_name}-alert-redis-mem-${var.environment}"
  resource_group_name = azurerm_resource_group.main.name
  scopes              = [azurerm_redis_cache.main.id]
  description         = "Redis memory usage exceeds 80%"
  severity            = 2
  frequency           = "PT5M"
  window_size         = "PT5M"
  auto_mitigate       = true
  enabled             = var.is_production
  tags                = var.tags

  criteria {
    metric_namespace = "Microsoft.Cache/redis"
    metric_name      = "usedmemorypercentage"
    aggregation      = "Average"
    operator         = "GreaterThan"
    threshold        = 80
  }

  action {
    action_group_id = azurerm_monitor_action_group.critical.id
  }
}

# ── 6. Redis: connected clients > 80% of max ─────────────────────────────

resource "azurerm_monitor_metric_alert" "redis_connections" {
  name                = "${var.project_name}-alert-redis-conn-${var.environment}"
  resource_group_name = azurerm_resource_group.main.name
  scopes              = [azurerm_redis_cache.main.id]
  description         = "Redis connected clients exceeding threshold"
  severity            = 2
  frequency           = "PT5M"
  window_size         = "PT5M"
  auto_mitigate       = true
  enabled             = var.is_production
  tags                = var.tags

  criteria {
    metric_namespace = "Microsoft.Cache/redis"
    metric_name      = "connectedclients"
    aggregation      = "Maximum"
    operator         = "GreaterThan"
    threshold        = 200
  }

  action {
    action_group_id = azurerm_monitor_action_group.critical.id
  }
}

# ── 7. Webhook failures: > 10 dead-lettered in 1 hour ────────────────────

resource "azurerm_monitor_scheduled_query_rules_alert_v2" "webhook_failures" {
  name                = "${var.project_name}-alert-webhook-fail-${var.environment}"
  resource_group_name = azurerm_resource_group.main.name
  location            = var.location
  scopes              = [azurerm_application_insights.main.id]
  description         = "More than 10 webhook deliveries dead-lettered in the last hour"
  severity            = 2
  enabled             = var.is_production
  tags                = var.tags

  evaluation_frequency = "PT15M"
  window_duration      = "PT1H"

  criteria {
    query = <<-KQL
      traces
      | where timestamp > ago(1h)
      | where message has "webhook" and message has "dead-letter"
      | summarize dead_lettered = count()
      | where dead_lettered > 10
    KQL

    time_aggregation_method = "Count"
    operator                = "GreaterThan"
    threshold               = 0
    failing_periods {
      minimum_failing_periods_to_trigger_alert = 1
      number_of_evaluation_periods             = 1
    }
  }

  action {
    action_groups = [azurerm_monitor_action_group.critical.id]
  }
}

# ── 8. Kill switch propagation: custom metric baseline ────────────────────

resource "azurerm_monitor_scheduled_query_rules_alert_v2" "kill_switch_propagation" {
  name                = "${var.project_name}-alert-killswitch-${var.environment}"
  resource_group_name = azurerm_resource_group.main.name
  location            = var.location
  scopes              = [azurerm_application_insights.main.id]
  description         = "Kill switch propagation delay exceeds 200ms (DB write to Redis availability)"
  severity            = 3
  enabled             = var.is_production
  tags                = var.tags

  evaluation_frequency = "PT5M"
  window_duration      = "PT5M"

  criteria {
    query = <<-KQL
      traces
      | where timestamp > ago(5m)
      | where message has "kill-switch-propagation"
      | extend propagation_ms = toint(customDimensions.propagation_ms)
      | where propagation_ms > 200
      | summarize slow_count = count()
      | where slow_count > 0
    KQL

    time_aggregation_method = "Count"
    operator                = "GreaterThan"
    threshold               = 0
    failing_periods {
      minimum_failing_periods_to_trigger_alert = 1
      number_of_evaluation_periods             = 1
    }
  }

  action {
    action_groups = [azurerm_monitor_action_group.critical.id]
  }
}

# ── 9. Database: CPU > 80% for 10 minutes ────────────────────────────────

resource "azurerm_monitor_metric_alert" "database_cpu" {
  name                = "${var.project_name}-alert-db-cpu-${var.environment}"
  resource_group_name = azurerm_resource_group.main.name
  scopes              = [azurerm_postgresql_flexible_server.main.id]
  description         = "PostgreSQL CPU exceeds 80% for 10 minutes"
  severity            = 2
  frequency           = "PT5M"
  window_size         = "PT10M"
  auto_mitigate       = true
  enabled             = var.is_production
  tags                = var.tags

  criteria {
    metric_namespace = "Microsoft.DBforPostgreSQL/flexibleServers"
    metric_name      = "cpu_percent"
    aggregation      = "Average"
    operator         = "GreaterThan"
    threshold        = 80
  }

  action {
    action_group_id = azurerm_monitor_action_group.critical.id
  }
}

# ── 10. Database: storage > 85% ──────────────────────────────────────────

resource "azurerm_monitor_metric_alert" "database_storage" {
  name                = "${var.project_name}-alert-db-storage-${var.environment}"
  resource_group_name = azurerm_resource_group.main.name
  scopes              = [azurerm_postgresql_flexible_server.main.id]
  description         = "PostgreSQL storage usage exceeds 85%"
  severity            = 1
  frequency           = "PT15M"
  window_size         = "PT15M"
  auto_mitigate       = true
  enabled             = var.is_production
  tags                = var.tags

  criteria {
    metric_namespace = "Microsoft.DBforPostgreSQL/flexibleServers"
    metric_name      = "storage_percent"
    aggregation      = "Average"
    operator         = "GreaterThan"
    threshold        = 85
  }

  action {
    action_group_id = azurerm_monitor_action_group.critical.id
  }
}
