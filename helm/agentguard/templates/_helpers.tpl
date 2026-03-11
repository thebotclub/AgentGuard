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
Create chart name and version as used by the chart label.
*/}}
{{- define "agentguard.chart" -}}
{{- printf "%s-%s" .Chart.Name .Chart.Version | replace "+" "_" | trunc 63 | trimSuffix "-" }}
{{- end }}

{{/*
Common labels.
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
Selector labels.
*/}}
{{- define "agentguard.selectorLabels" -}}
app.kubernetes.io/name: {{ include "agentguard.name" . }}
app.kubernetes.io/instance: {{ .Release.Name }}
{{- end }}

{{/*
Create the name of the service account to use.
*/}}
{{- define "agentguard.serviceAccountName" -}}
{{- if .Values.serviceAccount.create }}
{{- default (include "agentguard.fullname" .) .Values.serviceAccount.name }}
{{- else }}
{{- default "default" .Values.serviceAccount.name }}
{{- end }}
{{- end }}

{{/*
Secret name — use existing or generated.
*/}}
{{- define "agentguard.secretName" -}}
{{- if .Values.secrets.existingSecret }}
{{- .Values.secrets.existingSecret }}
{{- else }}
{{- include "agentguard.fullname" . }}
{{- end }}
{{- end }}

{{/*
ConfigMap name.
*/}}
{{- define "agentguard.configMapName" -}}
{{- include "agentguard.fullname" . }}-config
{{- end }}

{{/*
Build the DATABASE_URL.
If postgresql subchart is enabled, construct from subchart values.
Otherwise, use the user-provided secrets.databaseUrl.
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
Build the REDIS_URL.
If redis subchart is enabled, construct from subchart values.
Otherwise, use the user-provided secrets.redisUrl.
*/}}
{{- define "agentguard.redisUrl" -}}
{{- if .Values.redis.enabled }}
{{- printf "redis://%s-redis-master:6379" .Release.Name }}
{{- else }}
{{- .Values.secrets.redisUrl }}
{{- end }}
{{- end }}

{{/*
Image string.
*/}}
{{- define "agentguard.image" -}}
{{- $tag := default .Chart.AppVersion .Values.image.tag }}
{{- printf "%s:%s" .Values.image.repository $tag }}
{{- end }}
