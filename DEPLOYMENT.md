# Energy Monitoring System - Documentacion Completa de Despliegue y Arquitectura

---

## 1. Vision General del Sistema

Sistema de monitoreo en tiempo real de racks y PDUs (Power Distribution Units) en centros de datos. Permite visualizar metricas de energia (amperaje, voltaje, temperatura, humedad), gestionar alertas criticas, enviar notificaciones a SONAR, y administrar mantenimientos.

### 1.1 Stack Tecnologico

| Capa | Tecnologia | Version Minima |
|------|-----------|----------------|
| Frontend | React + TypeScript + Tailwind CSS | React 18 |
| Bundler | Vite | 7.x |
| Backend | Node.js + Express | Node 16+ |
| Base de datos | SQL Server (MSSQL) | 2017+ |
| Reverse Proxy | Nginx (Windows) | 1.24+ |
| Process Manager | PM2 (opcional) | 5.x |

### 1.2 Diagrama de Arquitectura

```
                    Puerto 80 (HTTP)
                         |
                    +----v-----+
                    |  NGINX   |  (Reverse Proxy + Static Files)
                    |  Windows |
                    +----+-----+
                         |
           +-------------+-------------+
           |                           |
    Archivos estaticos           /api/*
    (dist/ - React SPA)              |
                              +------v------+
                              |   Express   |  Puerto 3001
                              |   Node.js   |
                              +------+------+
                                     |
                    +----------------+----------------+
                    |                |                |
             +------v------+  +-----v-----+  +------v------+
             |  SQL Server |  |  API NENG  |  |  API SONAR  |
             |  Puerto 1433|  |  (Externa) |  |  (Externa)  |
             +-------------+  +-----------+  +-------------+
```

### 1.3 Flujo de Datos

1. **NENG API** proporciona datos en tiempo real de racks (amperaje, voltaje, temperatura)
2. **NENG Sensors API** proporciona datos de sensores ambientales (temperatura, humedad)
3. El backend fusiona ambos origenes y aplica umbrales para clasificar alertas
4. Las alertas criticas se envian automaticamente a **SONAR** (si esta configurado y habilitado)
5. **SQL Server** almacena umbrales, alertas activas, historial, mantenimientos y usuarios

---

## 2. Estructura del Proyecto

```
energy-monitoring-system/
|-- server.cjs                     # Backend Express (API + logica de negocio)
|-- ecosystem.config.cjs           # Configuracion PM2 (gestion de procesos)
|-- nginx.conf                     # Configuracion Nginx (reverse proxy)
|-- monitor-nginx.ps1              # Script PowerShell de monitorizacion de Nginx
|-- .env                           # Variables de entorno (NO subir a git)
|-- .env.example                   # Plantilla de variables de entorno
|-- package.json                   # Dependencias y scripts npm
|-- vite.config.ts                 # Configuracion Vite (bundler)
|-- sql/
|   `-- CompleteDataBase.sql       # Script SQL completo (tablas + datos iniciales)
|-- src/                           # Codigo fuente frontend
|   |-- main.tsx                   # Entry point (React + Router + Auth)
|   |-- App.tsx                    # Componente principal (dashboard)
|   |-- index.css                  # Estilos globales (Tailwind)
|   |-- types/index.ts             # Tipos TypeScript
|   |-- contexts/
|   |   `-- AuthContext.tsx         # Contexto de autenticacion
|   |-- hooks/
|   |   |-- useRackData.ts         # Hook principal de datos de racks
|   |   `-- useThresholds.ts       # Hook de umbrales
|   |-- pages/
|   |   |-- LoginPage.tsx          # Pagina de login
|   |   `-- MaintenancePage.tsx    # Pagina de mantenimiento
|   |-- components/
|   |   |-- CountryGroup.tsx       # Agrupacion por pais
|   |   |-- SiteGroup.tsx          # Agrupacion por sitio
|   |   |-- DcGroup.tsx            # Agrupacion por datacenter/sala
|   |   |-- GatewayGroup.tsx       # Agrupacion por gateway
|   |   |-- RackCard.tsx           # Tarjeta de rack individual
|   |   |-- CombinedRackCard.tsx   # Tarjeta de rack combinada
|   |   |-- ThresholdManager.tsx   # Gestion de umbrales globales
|   |   |-- RackThresholdManager.tsx # Umbrales por rack
|   |   |-- UserManagement.tsx     # Gestion de usuarios
|   |   `-- ImportMaintenanceModal.tsx # Importar mantenimiento Excel
|   `-- utils/
|       |-- apiClient.ts           # Cliente API
|       |-- dataProcessing.ts      # Procesamiento y agrupacion de datos
|       |-- thresholdUtils.ts      # Utilidades de umbrales
|       `-- uiUtils.ts             # Utilidades de UI (colores, estados)
`-- dist/                          # Build de produccion (generado)
```

---

## 3. Base de Datos (SQL Server)

### 3.1 Tablas del Sistema

| Tabla | Descripcion |
|-------|-------------|
| `threshold_configs` | Umbrales globales (temperatura, humedad, amperaje, voltaje) |
| `rack_threshold_overrides` | Umbrales personalizados por rack individual |
| `active_critical_alerts` | Alertas criticas activas en tiempo real |
| `maintenance_entries` | Registros de mantenimiento (racks individuales o chains completas) |
| `maintenance_rack_details` | Detalle de cada rack dentro de un mantenimiento |
| `usersAlertado` | Usuarios del sistema (autenticacion, roles, sitios asignados) |
| `alerts_history` | Historico permanente de alertas |
| `maintenance_history` | Historico permanente de mantenimientos |

### 3.2 Sistema de Roles

| Rol | Permisos |
|-----|----------|
| Administrador | Control total: usuarios, umbrales, mantenimiento, alertas, SONAR |
| Operador | Todo excepto gestion de usuarios |
| Tecnico | Ver alertas, gestionar mantenimiento (solo lectura de umbrales) |
| Observador | Solo lectura |

### 3.3 Credenciales por Defecto

- **Usuario**: `admin`
- **Password**: `Admin123!`

### 3.4 Instalacion de la Base de Datos

```bash
sqlcmd -S localhost -U sa -P <tu_password> -i sql/CompleteDataBase.sql
```

El script es idempotente: usa `IF NOT EXISTS` para todas las tablas y `MERGE` para los datos iniciales.

---

## 4. API Backend - Endpoints

### 4.1 Autenticacion

| Metodo | Ruta | Descripcion | Auth |
|--------|------|-------------|------|
| POST | `/api/auth/login` | Iniciar sesion | No |
| POST | `/api/auth/logout` | Cerrar sesion | Si |
| GET | `/api/auth/session` | Verificar sesion activa | No |

### 4.2 Datos de Racks

| Metodo | Ruta | Descripcion | Auth |
|--------|------|-------------|------|
| GET | `/api/racks/energy` | Datos de energia de todos los racks (fusiona NENG + sensores + alertas) | Si |

### 4.3 Umbrales

| Metodo | Ruta | Descripcion | Auth/Rol |
|--------|------|-------------|----------|
| GET | `/api/thresholds` | Obtener umbrales globales | Si |
| PUT | `/api/thresholds` | Actualizar umbrales globales | Admin/Operador |
| GET | `/api/racks/:rackId/thresholds` | Obtener umbrales de un rack | Si |
| PUT | `/api/racks/:rackId/thresholds` | Actualizar umbrales de un rack | Admin/Operador |
| DELETE | `/api/racks/:rackId/thresholds` | Eliminar umbrales de un rack (vuelve a globales) | Admin/Operador |

### 4.4 Mantenimiento

| Metodo | Ruta | Descripcion | Auth |
|--------|------|-------------|------|
| GET | `/api/maintenance` | Listar mantenimientos activos | Si |
| POST | `/api/maintenance/rack` | Enviar rack a mantenimiento | Si |
| POST | `/api/maintenance/chain` | Enviar chain completa a mantenimiento | Si |
| DELETE | `/api/maintenance/rack/:rackId` | Sacar rack de mantenimiento | Si |
| DELETE | `/api/maintenance/entry/:entryId` | Eliminar entrada de mantenimiento completa | Si |
| DELETE | `/api/maintenance/all` | Eliminar todos los mantenimientos | Si |
| GET | `/api/maintenance/template` | Descargar plantilla Excel de mantenimiento | No |
| POST | `/api/maintenance/import-excel` | Importar mantenimiento desde Excel | Si |

### 4.5 Usuarios

| Metodo | Ruta | Descripcion | Auth/Rol |
|--------|------|-------------|----------|
| GET | `/api/users` | Listar usuarios | Admin |
| POST | `/api/users` | Crear usuario | Admin |
| PUT | `/api/users/:id` | Actualizar usuario | Admin |
| DELETE | `/api/users/:id` | Eliminar usuario | Admin |
| GET | `/api/sites` | Listar sitios disponibles | Si |

### 4.6 SONAR y Alertas

| Metodo | Ruta | Descripcion | Auth/Rol |
|--------|------|-------------|----------|
| GET | `/api/sonar/errors` | Ver errores de envio a SONAR | Si |
| GET | `/api/sonar/status` | Estado de la integracion SONAR | Si |
| POST | `/api/sonar/send-individual` | Enviar alerta individual a SONAR | Admin/Operador |
| GET | `/api/alert-sending` | Estado del envio automatico de alertas | Si |
| POST | `/api/alert-sending` | Activar/desactivar envio automatico | Admin/Operador |

### 4.7 Exportacion

| Metodo | Ruta | Descripcion | Auth |
|--------|------|-------------|------|
| POST | `/api/export/alerts` | Exportar alertas a Excel | Si |

### 4.8 Sistema

| Metodo | Ruta | Descripcion | Auth |
|--------|------|-------------|------|
| GET | `/api/health` | Health check del backend | No |

---

## 5. Variables de Entorno

Copiar `.env.example` a `.env` y configurar:

### 5.1 Obligatorias

```env
# Servidor
NODE_ENV=production
PORT=3001
FRONTEND_URL=http://localhost

# SQL Server
SQL_SERVER_HOST=localhost
SQL_SERVER_DATABASE=energy_monitor_db
SQL_SERVER_USER=sa
SQL_SERVER_PASSWORD=<password_sql>
SQL_SERVER_PORT=1433
SQL_SERVER_ENCRYPT=false

# API NENG (fuente de datos de racks)
NENG_API_URL=https://<tu-api-neng>/v1/energy/racks
NENG_SENSORS_API_URL=https://<tu-api-neng>/v1/energy/sensors
NENG_API_KEY=<tu_api_key>

# Sesion (cambiar en produccion)
SESSION_SECRET=<secreto_aleatorio_largo>
```

### 5.2 Opcionales (SONAR)

```env
# SONAR - Integracion de alertas
SONAR_API_URL=https://<tu-sonar-api>/alerts
SONAR_BEARER_TOKEN=<tu_token>
SONAR_SKIP_SSL_VERIFY=false

# Intervalo de procesamiento automatico de alertas (ms, default: 120000 = 2 min)
ALERT_PROCESSING_INTERVAL_MS=120000
```

### 5.3 Opcionales (Generales)

```env
LOG_LEVEL=info                    # Nivel de log: debug, info, warn, error
API_TIMEOUT=10000                 # Timeout de APIs externas (ms)
BACKEND_POLLING_INTERVAL=30000    # Intervalo de polling del backend (ms)
```

---

## 6. Configuracion de Nginx (Produccion en Windows)

### 6.1 Funcion de Nginx en el Sistema

Nginx actua como:
- **Servidor de archivos estaticos**: Sirve el build de React (`dist/`) directamente
- **Reverse proxy**: Redirige las peticiones `/api/*` al backend Node.js (puerto 3001)
- **Load balancer**: Soporta un servidor backup en puerto 3002 (si se usa PM2 cluster)
- **Compresion**: gzip para reducir ancho de banda
- **Cache**: Cache de assets estaticos (JS, CSS, imagenes) con expiracion de 1 anio
- **Seguridad**: Headers de seguridad (X-Frame-Options, X-Content-Type-Options, etc.)

### 6.2 Problemas Identificados y Soluciones Aplicadas

Se identificaron 6 problemas en la configuracion original de Nginx que podian causar paradas silenciosas. Todos han sido corregidos en el `nginx.conf` actual:

#### Problema 1: Nivel de log insuficiente

- **Antes**: `error_log logs/error.log warn` (descartaba eventos `notice` e `info`)
- **Ahora**: `error_log D:/nginx/logs/error.log info` (captura TODO el ciclo de vida: arranque, parada, senales, workers)
- **Impacto**: Nginx logueaba la parada como evento `notice` o `info`, que el nivel `warn` descartaba. Por eso `error.log` estaba vacio tras cada parada.

#### Problema 2: Upstream sin control de fallos

- **Antes**: `server 127.0.0.1:3001;` (sin `max_fails` ni `fail_timeout`)
- **Ahora**: `server 127.0.0.1:3001 max_fails=3 fail_timeout=30s;`
- **Impacto**: Sin estas directivas, Nginx nunca marcaba el backend como caido y acumulaba sockets rotos en Windows.

#### Problema 3: Sin `proxy_next_upstream`

- **Antes**: No existia la directiva
- **Ahora**: `proxy_next_upstream error timeout http_502 http_503;`
- **Impacto**: Ahora Nginx salta automaticamente al backup (3002) cuando el primario falla.

#### Problema 4: Directorios temporales con rutas relativas

- **Antes**: `client_body_temp_path temp/client_body_temp;`
- **Ahora**: `client_body_temp_path D:/nginx/temp/client_body_temp;`
- **Impacto**: Si Nginx se arrancaba desde un directorio diferente, las rutas relativas apuntaban a otro sitio y Nginx se cerraba sin dejar log.

#### Problema 5: Sin `worker_shutdown_timeout`

- **Antes**: No existia la directiva
- **Ahora**: `worker_shutdown_timeout 10s;`
- **Impacto**: Al hacer reload, un worker con una conexion colgada (proxy_read_timeout de 300s) podia quedarse bloqueado indefinidamente, causando conflictos.

#### Problema 6: `error_page 404` apuntando a fichero inexistente

- **Antes**: `error_page 404 /404.html;` (el fichero no existia)
- **Ahora**: Eliminado. La SPA ya maneja el 404 con `try_files $uri $uri/ /index.html`.

### 6.3 Sistema de Logs de Nginx

El `nginx.conf` actual genera **5 ficheros de log** independientes, cada uno con un proposito especifico:

| Fichero | Contenido | Uso |
|---------|-----------|-----|
| `error.log` | Ciclo de vida de Nginx: arranque, parada, senales, errores de workers, problemas de configuracion. **Nivel `info`** para maxima captura. | **Diagnosticar paradas.** Buscar las ultimas lineas antes de que el proceso desaparezca. |
| `energy-monitor-error.log` | Errores del server block de la aplicacion: errores de proxy, ficheros no encontrados, timeouts. **Nivel `info`.** | Diagnosticar errores HTTP y problemas de routing. |
| `access.log` | Todas las peticiones HTTP generales. | Monitoreo de trafico general. |
| `energy-monitor-access.log` | Peticiones HTTP al virtual host de la aplicacion. | Monitoreo de trafico de la app. |
| `upstream-debug.log` | **Solo peticiones a `/api/*`** con formato extendido que incluye: estado del upstream, IP del upstream que respondio, tiempo de respuesta del upstream, tiempo de conexion, y tiempo total de la peticion. | **Diagnosticar problemas del backend.** Ver si el backend deja de responder antes de que Nginx se pare. |

#### Ejemplo de linea en `upstream-debug.log`

```
192.168.1.50 [10/Mar/2026:14:32:01 +0100] "GET /api/racks/energy?t=1741614721000 HTTP/1.1"
status=200 upstream_status=200 upstream_addr=127.0.0.1:3001
upstream_response_time=0.345 request_time=0.346 upstream_connect_time=0.001
body_bytes=52840
```

Si ves una linea como esta justo antes de la parada, sabes que el backend respondia correctamente:
```
status=502 upstream_status=502 upstream_addr=127.0.0.1:3001
upstream_response_time=- request_time=10.001 upstream_connect_time=-
```
Esto indicaria que el backend estaba caido (502, tiempos en `-`).

#### Como diagnosticar una parada

1. Abrir `D:\nginx\logs\error.log` y buscar las ultimas lineas. Con el nivel `info`, Nginx registra:
   - `signal process started` (al arrancar)
   - `worker process <PID> exited` (si un worker muere)
   - `signal <N> received` (si recibe SIGTERM, SIGINT, etc.)
   - `getpid() is not <PID>` (conflicto de PIDs, otro Nginx intenta arrancar)
   - `CreateDirectory() ... failed` (fallo de directorio temporal)

2. Abrir `D:\nginx\logs\upstream-debug.log` y buscar las ultimas peticiones `/api/`. Si hay muchos `status=502` consecutivos con `upstream_response_time=-`, el backend estaba caido.

3. Abrir `D:\nginx\logs\nginx-monitor.log` (generado por el script PowerShell). Si hay entradas de "Nginx NO esta activo. Iniciando...", confirma que el proceso se detuvo y el monitor lo reinicio.

### 6.4 Monitorizacion Automatica (Sin Software Externo)

El script `monitor-nginx.ps1` usa unicamente herramientas nativas de Windows (PowerShell + Tarea Programada) para garantizar que Nginx se mantiene activo:

#### Que hace el script

1. Comprueba si existe algun proceso `nginx.exe` activo
2. Si existe, verifica que realmente este escuchando en el puerto 80
3. Si no hay proceso o no escucha, reinicia Nginx automaticamente
4. Antes de reiniciar, verifica la configuracion con `nginx -t`
5. Antes de reiniciar, crea los directorios temporales si faltan
6. Registra todos los eventos en `D:\nginx\logs\nginx-monitor.log`
7. Rota automaticamente el log cuando supera 50MB

#### Instalacion como Tarea Programada

```powershell
# Copiar el script al directorio de Nginx
Copy-Item .\monitor-nginx.ps1 D:\nginx\monitor-nginx.ps1

# Instalar la tarea programada (requiere Administrador)
powershell -ExecutionPolicy Bypass -File D:\nginx\monitor-nginx.ps1 -Install
```

Esto crea una tarea llamada `NginxMonitor` que:
- Se ejecuta al iniciar el sistema operativo
- Se repite cada 1 minuto
- Se ejecuta como SYSTEM con maximos privilegios
- Se reinicia automaticamente si falla (hasta 3 reintentos)
- Tiene un tiempo limite de ejecucion de 5 minutos

#### Desinstalacion

```powershell
powershell -ExecutionPolicy Bypass -File D:\nginx\monitor-nginx.ps1 -Uninstall
```

#### Ejecucion manual (para pruebas)

```powershell
powershell -ExecutionPolicy Bypass -File D:\nginx\monitor-nginx.ps1
```

#### Verificar que la tarea esta activa

```powershell
Get-ScheduledTask -TaskName "NginxMonitor" | Format-List TaskName, State, LastRunTime, NextRunTime
```

### 6.5 Preparacion del Entorno Nginx

Antes de iniciar Nginx, estos directorios **deben existir**:

```powershell
New-Item -ItemType Directory -Force -Path @(
    "D:\nginx\temp\client_body_temp",
    "D:\nginx\temp\proxy_temp",
    "D:\nginx\temp\fastcgi_temp",
    "D:\nginx\temp\uwsgi_temp",
    "D:\nginx\temp\scgi_temp",
    "D:\nginx\pdus\dist",
    "D:\nginx\logs",
    "D:\nginx\html"
)
```

### 6.6 Estructura de Directorios de Nginx

```
D:\nginx\
|-- nginx.exe
|-- monitor-nginx.ps1              <-- Script de monitorizacion
|-- conf\
|   `-- nginx.conf
|-- logs\
|   |-- error.log                  <-- Ciclo de vida (nivel info)
|   |-- access.log                 <-- Trafico general
|   |-- energy-monitor-access.log  <-- Trafico de la app
|   |-- energy-monitor-error.log   <-- Errores del server block (nivel info)
|   |-- upstream-debug.log         <-- Diagnostico del backend (tiempos, estados)
|   `-- nginx-monitor.log          <-- Log del script de monitorizacion
|-- temp\
|   |-- client_body_temp\
|   |-- proxy_temp\
|   |-- fastcgi_temp\
|   |-- uwsgi_temp\
|   `-- scgi_temp\
|-- pdus\
|   `-- dist\                      <-- Build de React
|       |-- index.html
|       `-- assets\
|           |-- index-[hash].js
|           |-- index-[hash].css
|           `-- vendor-[hash].js
`-- html\
    `-- 50x.html                   <-- Pagina de error por defecto
```

---

## 7. Guia de Despliegue Paso a Paso

### 7.1 Requisitos Previos

- Windows Server 2016+ o Windows 10+
- Node.js >= 16.0.0 y npm >= 8.0.0
- SQL Server 2017+ (con autenticacion SQL activada)
- Nginx para Windows (descargar de https://nginx.org/en/download.html - version estable)
- Privilegios de administrador local en el servidor

### 7.2 Paso 1: Instalar la Base de Datos

```bash
sqlcmd -S localhost -U sa -P <tu_password> -i sql/CompleteDataBase.sql
```

Verificar la instalacion:
```bash
sqlcmd -S localhost -U sa -P <tu_password> -Q "USE energy_monitor_db; SELECT name FROM sys.tables;"
```

Resultado esperado: 8 tablas listadas.

### 7.3 Paso 2: Configurar Variables de Entorno

```bash
copy .env.example .env
```

Editar `.env` con los valores reales (ver seccion 5).

### 7.4 Paso 3: Instalar Dependencias y Compilar

```bash
npm install
npm run build
```

Esto genera la carpeta `dist/` con los archivos estaticos del frontend.

### 7.5 Paso 4: Configurar Nginx

```powershell
# 1. Crear directorios
New-Item -ItemType Directory -Force -Path @(
    "D:\nginx\temp\client_body_temp",
    "D:\nginx\temp\proxy_temp",
    "D:\nginx\temp\fastcgi_temp",
    "D:\nginx\temp\uwsgi_temp",
    "D:\nginx\temp\scgi_temp",
    "D:\nginx\pdus\dist",
    "D:\nginx\logs",
    "D:\nginx\html"
)

# 2. Copiar configuracion de Nginx
Copy-Item .\nginx.conf D:\nginx\conf\nginx.conf -Force

# 3. Copiar build del frontend
Copy-Item -Recurse -Force .\dist\* D:\nginx\pdus\dist\

# 4. Copiar script de monitorizacion
Copy-Item .\monitor-nginx.ps1 D:\nginx\monitor-nginx.ps1 -Force

# 5. Verificar configuracion
cd D:\nginx
.\nginx.exe -t
# Resultado esperado: "syntax is ok" y "test is successful"
```

### 7.6 Paso 5: Instalar Monitor de Nginx (Tarea Programada)

```powershell
# Instalar la tarea programada (requiere PowerShell como Administrador)
powershell -ExecutionPolicy Bypass -File D:\nginx\monitor-nginx.ps1 -Install
```

Esto registra una tarea nativa de Windows que arranca Nginx al inicio del sistema y lo reinicia automaticamente si se detiene. No requiere ningun software externo.

### 7.7 Paso 6: Iniciar el Backend

#### Opcion A: Con PM2 (Recomendado para produccion)

```bash
npm install -g pm2
pm2 start ecosystem.config.cjs --env production
pm2 save
pm2-startup install
```

**Configuracion PM2 (`ecosystem.config.cjs`):**
- 2 instancias en modo cluster (puertos 3001 y 3002)
- Reinicio automatico ante fallos (max 10 reintentos)
- Limite de memoria: 500MB por instancia
- Logs en `./logs/pm2-*.log`

#### Opcion B: Ejecucion directa (desarrollo/pruebas)

```bash
npm run server
```

### 7.8 Paso 7: Verificar el Despliegue

```powershell
# 1. Verificar SQL Server
sqlcmd -S localhost -U sa -Q "SELECT @@VERSION"

# 2. Verificar backend
Invoke-WebRequest -Uri http://localhost:3001/api/health -UseBasicParsing

# 3. Verificar Nginx
Invoke-WebRequest -Uri http://localhost/health -UseBasicParsing

# 4. Verificar tarea programada del monitor
Get-ScheduledTask -TaskName "NginxMonitor" | Format-List TaskName, State

# 5. Verificar procesos PM2
pm2 status
```

### 7.9 Acceso a la Aplicacion

- **URL**: `http://localhost` (a traves de Nginx)
- **Usuario**: `admin`
- **Password**: `Admin123!`

---

## 8. Operaciones Comunes

### 8.1 Actualizar el Frontend (Nuevo Despliegue)

```powershell
npm run build
Copy-Item -Recurse -Force .\dist\* D:\nginx\pdus\dist\
cd D:\nginx
.\nginx.exe -s reload
```

### 8.2 Reiniciar el Backend

```bash
# Con PM2
pm2 restart energy-monitoring-api

# Sin PM2
npm run server
```

### 8.3 Ver Logs

```powershell
# -- NGINX --
# Diagnosticar paradas (lo mas importante)
Get-Content D:\nginx\logs\error.log -Tail 50

# Errores del server block
Get-Content D:\nginx\logs\energy-monitor-error.log -Tail 30

# Estado del backend visto desde Nginx
Get-Content D:\nginx\logs\upstream-debug.log -Tail 30

# Log del monitor de auto-reinicio
Get-Content D:\nginx\logs\nginx-monitor.log -Tail 20

# -- BACKEND --
# Con PM2
pm2 logs energy-monitoring-api

# Ficheros directos
type .\logs\combined.log
type .\logs\error.log
```

### 8.4 Gestionar Nginx

```powershell
# Arrancar manualmente
cd D:\nginx && Start-Process .\nginx.exe -WindowStyle Hidden

# Parar
cd D:\nginx && .\nginx.exe -s quit

# Recargar configuracion (sin downtime)
cd D:\nginx && .\nginx.exe -s reload

# Verificar configuracion
cd D:\nginx && .\nginx.exe -t

# Verificar tarea de monitorizacion
Get-ScheduledTask -TaskName "NginxMonitor" | Format-List TaskName, State, LastRunTime
```

---

## 9. Solucion de Problemas

### 9.1 Nginx se apaga solo periodicamente

**Diagnostico con los nuevos logs:**

1. Revisar `D:\nginx\logs\error.log` -- las ultimas lineas antes de la parada indicaran la causa (`worker process exited`, `signal received`, `CreateDirectory failed`, etc.)
2. Revisar `D:\nginx\logs\upstream-debug.log` -- buscar rafagas de `status=502` con `upstream_response_time=-` que indicarian que el backend murio antes que Nginx
3. Revisar `D:\nginx\logs\nginx-monitor.log` -- confirmara si el monitor detecto la parada y cuando reinicio

**Solucion**: La tarea programada `NginxMonitor` reinicia Nginx automaticamente cada vez que detecta que el proceso no esta activo (comprobacion cada minuto).

### 9.2 Nginx no arranca: "CreateDirectory failed"

```
nginx: [emerg] CreateDirectory() "D:\nginx/temp/client_body_temp" failed
```

**Solucion**: Ejecutar el comando de creacion de directorios de la seccion 6.5. El script `monitor-nginx.ps1` tambien crea estos directorios automaticamente antes de cada reinicio.

### 9.3 Puerto 80 ocupado

```
nginx: [emerg] bind() to 0.0.0.0:80 failed (10013)
```

**Solucion**:
```powershell
netstat -anob | findstr :80
```
Identificar el proceso y detenerlo, o cambiar el puerto en `nginx.conf`.

### 9.4 Error de conexion a SQL Server

- Verificar que el servicio esta activo: `sc query MSSQLSERVER`
- Verificar que el puerto esta abierto: `netstat -an | findstr 1433`
- Verificar credenciales en `.env`
- Verificar que SQL Server Authentication esta habilitado

### 9.5 Backend no responde en /api/

- Verificar proceso: `pm2 status` o `tasklist | findstr node`
- Verificar puerto: `netstat -an | findstr 3001`
- Revisar logs: `pm2 logs` o `type .\logs\error.log`
- Revisar `D:\nginx\logs\upstream-debug.log` para ver los errores desde la perspectiva de Nginx

### 9.6 Frontend no carga datos

- Verificar que el backend esta corriendo en el puerto configurado
- Verificar `FRONTEND_URL` en `.env`
- Verificar credenciales de la API NENG en `.env`
- Abrir DevTools > Network en el navegador

### 9.7 Error de sesion/autenticacion

- Verificar `SESSION_SECRET` en `.env`
- Verificar que la tabla `usersAlertado` existe en la BD
- Limpiar cookies del navegador

### 9.8 upstream-debug.log muestra muchos 502

Si el log de upstream muestra `upstream_status=502` repetidamente con `upstream_response_time=-`:

1. El backend Node.js probablemente se reinicio (PM2 `max_memory_restart`) o murio por una excepcion no capturada
2. Revisar `./logs/pm2-error.log` para ver la causa
3. Con la configuracion actual, Nginx marcara el backend como caido tras 3 fallos consecutivos durante 30 segundos, y saltara al backup (3002) automaticamente

---

## 10. Desarrollo Local

### 10.1 Configuracion

```bash
npm install
copy .env.example .env
```

### 10.2 Ejecucion

Requiere dos terminales:

```bash
# Terminal 1 - Frontend (Vite dev server con hot reload)
npm run dev
# Disponible en http://localhost:5173

# Terminal 2 - Backend (Express con auto-reinicio)
npm run server:dev
# Disponible en http://localhost:3001
```

Vite esta configurado con un proxy que redirige `/api/*` a `http://localhost:3001`, por lo que en desarrollo no se necesita Nginx.

### 10.3 Scripts Disponibles

| Script | Descripcion |
|--------|-------------|
| `npm run dev` | Frontend en modo desarrollo (Vite) |
| `npm run build` | Compilar frontend para produccion |
| `npm run preview` | Previsualizar build de produccion |
| `npm run server` | Iniciar backend Express |
| `npm run server:dev` | Backend con nodemon (auto-reinicio) |
| `npm run lint` | Ejecutar ESLint |

---

## 11. Notas de Seguridad

- **Cambiar `SESSION_SECRET`** en produccion a un valor aleatorio largo
- **Cambiar la password del usuario admin** tras el primer login
- Las sesiones duran 1 anio (`maxAge` en la configuracion de sesion)
- Las cookies usan `httpOnly: true` y `sameSite: lax`
- Helmet.js esta configurado para headers de seguridad HTTP
- CORS esta restringido a `FRONTEND_URL` en produccion
- Las passwords se almacenan hasheadas con SHA-256 + salt en SQL Server
