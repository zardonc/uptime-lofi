# API Routes

## Auth Endpoints
- POST /api/auth/login - Login with password
- POST /api/auth/refresh - Refresh access token
- POST /api/auth/logout - Revoke session (NEW)
- GET /api/auth/status - Check auth status

## Node Endpoints
- GET /api/nodes - List all nodes
- GET /api/nodes/:id/metrics - Get node metrics
- POST /api/nodes - Create node (501 Not Implemented)
- PUT /api/nodes/:id - Update node (501 Not Implemented)
- DELETE /api/nodes/:id - Delete node (501 Not Implemented)

## Health Endpoints
- GET /health - Health check with DB ping (NEW)
- GET /ready - Readiness probe (NEW)

## Probe Endpoints
- POST /api/push - Push metrics (HMAC auth)

## Stats Endpoints
- GET /api/stats/overview - Get overview statistics

## Settings Endpoints
- POST /api/settings/security - Update security settings
