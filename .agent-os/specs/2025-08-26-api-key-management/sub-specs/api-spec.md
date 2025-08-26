# API Specification

This is the API specification for the spec detailed in @.agent-os/specs/2025-08-26-api-key-management/spec.md

## Endpoints

### POST /api/v1/admin/api-keys

**Purpose:** Create a new service API key
**Authentication:** JWT required
**Parameters:**
- `name` (string, required): Descriptive name for the API key
- `key` (string, required): The actual API key value
- `active` (boolean, optional): Whether key is active (default: true)

**Response:**
```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "name": "Spotify Web API",
    "active": true,
    "createdAt": "2025-08-26T10:00:00Z",
    "updatedAt": "2025-08-26T10:00:00Z",
    "lastUsed": null
  }
}
```

**Errors:** 400 (validation), 401 (unauthorized), 409 (duplicate name)

### GET /api/v1/admin/api-keys

**Purpose:** Retrieve all service API keys
**Authentication:** JWT required
**Parameters:** None

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "id": "uuid",
      "name": "Spotify Web API",
      "active": true,
      "createdAt": "2025-08-26T10:00:00Z",
      "updatedAt": "2025-08-26T10:00:00Z",
      "lastUsed": "2025-08-26T14:30:00Z"
    }
  ]
}
```

**Errors:** 401 (unauthorized)

### GET /api/v1/admin/api-keys/:id

**Purpose:** Retrieve a specific API key by ID
**Authentication:** JWT required
**Parameters:**
- `id` (string, required): API key UUID

**Response:**
```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "name": "OpenAI API",
    "active": true,
    "createdAt": "2025-08-26T10:00:00Z",
    "updatedAt": "2025-08-26T10:00:00Z",
    "lastUsed": "2025-08-26T15:45:00Z"
  }
}
```

**Errors:** 401 (unauthorized), 404 (not found)

### PUT /api/v1/admin/api-keys/:id

**Purpose:** Update an existing API key
**Authentication:** JWT required
**Parameters:**
- `id` (string, required): API key UUID
- `name` (string, optional): New descriptive name
- `key` (string, optional): New API key value
- `active` (boolean, optional): New active status

**Response:**
```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "name": "Updated Name",
    "active": false,
    "createdAt": "2025-08-26T10:00:00Z",
    "updatedAt": "2025-08-26T16:00:00Z",
    "lastUsed": "2025-08-26T15:45:00Z"
  }
}
```

**Errors:** 400 (validation), 401 (unauthorized), 404 (not found)

### DELETE /api/v1/admin/api-keys/:id

**Purpose:** Delete an API key
**Authentication:** JWT required
**Parameters:**
- `id` (string, required): API key UUID

**Response:**
```json
{
  "success": true,
  "message": "API key deleted successfully"
}
```

**Errors:** 401 (unauthorized), 404 (not found)

## Controllers

### ApiKeyController Actions
- `createApiKey`: Handle key creation with validation and secure storage
- `getAllApiKeys`: Retrieve all keys with status information (keys masked for security)
- `getApiKeyById`: Retrieve specific key details
- `updateApiKey`: Update key properties with proper validation
- `deleteApiKey`: Remove key with audit logging
- `validateApiKeyAccess`: Middleware for checking key permissions