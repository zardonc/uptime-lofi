# API Routes

## Auth Endpoints
- POST /api/auth/login - Login with password
- POST /api/auth/refresh - Refresh access token
- POST /api/auth/logout - Revoke session (NEW)
- GET /api/auth/status - Check auth status

## Monitor Endpoints
- GET /api/v1/monitors - List all monitors
- GET /api/v1/monitors/:id - Get monitor details
- POST /api/v1/monitors - Create monitor
- PUT /api/v1/monitors/:id - Update monitor
- POST /api/v1/monitors/:id/pause - Pause monitor
- POST /api/v1/monitors/:id/resume - Resume monitor
- DELETE /api/v1/monitors/:id - Archive monitor
- POST /api/v1/monitors/probe-config - Generate agent probe install config

## Health Endpoints
- GET /health - Health check with DB ping (NEW)
- GET /ready - Readiness probe (NEW)

## Probe Endpoints
- POST /api/push - Push metrics (HMAC auth)

## Stats Endpoints
- GET /api/stats/overview - Get overview statistics

## Settings Endpoints
- POST /api/settings/security - Update security settings
