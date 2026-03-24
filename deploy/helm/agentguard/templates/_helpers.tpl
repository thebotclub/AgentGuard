{{/*
Expand the name of the chart.
*/}}
{{- define "agentguard.name" -}}
{{- default .Chart.Name .Values.nameOverride | trunc 63 | trimSuffix "-" }}
{{- end }}

{{/*
Create a default fully qualified app name.
*/}}
{{- define "agentguard.fullname" -}}
{{- if .Values.fullnameOverride }}
{{- .Values.fullnameOverride | trunc 63 | trimSuffix "-" }}
{{- else }}
{{- $name := default .Chart.Name .Values.nameOverride }}
{{- if contains $name .Release.Name }}
{{- .Release.Name | trunc 63 | trimSuffix "-" }}
{{- else }}
{{- printf "%s-%s" .Release.Name $name | trunc 63 | trimSuffix "-" }}
{{- end }}
{{- end }}
{{- end }}

{{/*
Chart name + version label.
*/}}
{{- define "agentguard.chart" -}}
{{- printf "%s-%s" .Chart.Name .Chart.Version | replace "+" "_" | trunc 63 | trimSuffix "-" }}
{{- end }}

{{/*
Common labels applied to all resources.
*/}}
{{- define "agentguard.labels" -}}
helm.sh/chart: {{ include "agentguard.chart" . }}
{{ include "agentguard.selectorLabels" . }}
{{- if .Chart.AppVersion }}
app.kubernetes.io/version: {{ .Chart.AppVersion | quote }}
{{- end }}
app.kubernetes.io/managed-by: {{ .Release.Service }}
{{- end }}

{{/*
Selector labels — used in Deployment/Service matchLabels.
*/}}
{{- define "agentguard.selectorLabels" -}}
app.kubernetes.io/name: {{ include "agentguard.name" . }}
app.kubernetes.io/instance: {{ .Release.Name }}
{{- end }}

{{/*
API component selector labels.
*/}}
{{- define "agentguard.api.selectorLabels" -}}
{{ include "agentguard.selectorLabels" . }}
app.kubernetes.io/component: api
{{- end }}

{{/*
Dashboard component selector labels.
*/}}
{{- define "agentguard.dashboard.selectorLabels" -}}
{{ include "agentguard.selectorLabels" . }}
app.kubernetes.io/component: dashboard
{{- end }}

{{/*
Worker component selector labels.
*/}}
{{- define "agentguard.worker.selectorLabels" -}}
{{ include "agentguard.selectorLabels" . }}
app.kubernetes.io/component: worker
{{- end }}

{{/*
Service account name.
*/}}
{{- define "agentguard.serviceAccountName" -}}
{{- if .Values.serviceAccount.create }}
{{- default (include "agentguard.fullname" .) .Values.serviceAccount.name }}
{{- else }}
{{- default "default" .Values.serviceAccount.name }}
{{- end }}
{{- end }}

{{/*
Secret name.
*/}}
{{- define "agentguard.secretName" -}}
{{- if .Values.secrets.existingSecret }}
{{- .Values.secrets.existingSecret }}
{{- else }}
{{- include "agentguard.fullname" . }}-secrets
{{- end }}
{{- end }}

{{/*
ConfigMap name.
*/}}
{{- define "agentguard.configMapName" -}}
{{- include "agentguard.fullname" . }}-config
{{- end }}

{{/*
Build the DATABASE_URL from subchart or external config.
*/}}
{{- define "agentguard.databaseUrl" -}}
{{- if .Values.postgresql.enabled }}
{{- $host := printf "%s-postgresql" .Release.Name }}
{{- $port := "5432" }}
{{- $db := .Values.postgresql.auth.database }}
{{- $user := .Values.postgresql.auth.username }}
{{- printf "postgresql://%s:$(DB_PASSWORD)@%s:%s/%s" $user $host $port $db }}
{{- else }}
{{- .Values.secrets.databaseUrl }}
{{- end }}
{{- end }}

{{/*
Build the REDIS_URL from subchart or external config.
Prefers Sentinel config over standalone URL.
*/}}
{{- define "agentguard.redisUrl" -}}
{{- if .Values.redis.enabled }}
{{- if .Values.redis.auth.enabled }}
{{- printf "redis://:$(REDIS_PASSWORD)@%s-redis-master:6379/0" .Release.Name }}
{{- else }}
{{- printf "redis://%s-redis-master:6379/0" .Release.Name }}
{{- end }}
{{- else }}
{{- .Values.secrets.redisUrl }}
{{- end }}
{{- end }}

{{/*
API image string.
*/}}
{{- define "agentguard.api.image" -}}
{{- $repo := default (printf "%s/%s" .Values.image.registry .Values.image.repository) .Values.api.image.repository }}
{{- $tag := default (default .Chart.AppVersion .Values.image.tag) .Values.api.image.tag }}
{{- printf "%s:%s" $repo $tag }}
{{- end }}

{{/*
Worker image string (falls back to API image).
*/}}
{{- define "agentguard.worker.image" -}}
{{- $repo := default (printf "%s/%s" .Values.image.registry .Values.image.repository) .Values.worker.image.repository }}
{{- $tag := default (default .Chart.AppVersion .Values.image.tag) .Values.worker.image.tag }}
{{- printf "%s:%s" $repo $tag }}
{{- end }}

{{/*
Dashboard image string.
*/}}
{{- define "agentguard.dashboard.image" -}}
{{- $tag := default (default .Chart.AppVersion .Values.image.tag) .Values.dashboard.image.tag }}
{{- printf "%s:%s" .Values.dashboard.image.repository $tag }}
{{- end }}
