# API Specification

This is the API specification for the spec detailed in @.agent-os/specs/2025-08-26-jwt-auth-system/spec.md

## Authentication Endpoints

### POST /auth/register

**Purpose:** Register a new user account with email and password
**Parameters:**
- `email` (string, required) - Valid email address, must be unique
- `password` (string, required) - Min 8 chars, must contain uppercase, lowercase, number, special char
- `name` (string, optional) - User's display name

**Request Example:**
```json
{
  "email": "user@example.com",
  "password": "SecurePass123!",
  "name": "John Doe"
}
```

**Response (201 Created):**
```json
{
  "success": true,
  "data": {
    "user": {
      "id": "uuid",
      "email": "user@example.com",
      "name": "John Doe",
      "emailVerified": false,
      "createdAt": "2025-08-26T10:30:00.000Z"
    },
    "tokens": {
      "accessToken": "jwt_token_string",
      "refreshToken": "uuid_refresh_token",
      "expiresIn": 900
    }
  },
  "requestId": "req_uuid"
}
```

**Errors:**
- 400: Invalid email format, password requirements not met, email already exists
- 429: Rate limit exceeded
- 500: Server error

### POST /auth/login

**Purpose:** Authenticate existing user and return JWT tokens
**Parameters:**
- `email` (string, required) - User's registered email
- `password` (string, required) - User's password

**Request Example:**
```json
{
  "email": "user@example.com",
  "password": "SecurePass123!"
}
```

**Response (200 OK):**
```json
{
  "success": true,
  "data": {
    "user": {
      "id": "uuid",
      "email": "user@example.com",
      "name": "John Doe",
      "lastLoginAt": "2025-08-26T10:30:00.000Z"
    },
    "tokens": {
      "accessToken": "jwt_token_string",
      "refreshToken": "uuid_refresh_token",
      "expiresIn": 900
    }
  },
  "requestId": "req_uuid"
}
```

**Errors:**
- 400: Missing email or password
- 401: Invalid credentials
- 429: Rate limit exceeded (stricter for auth endpoints)
- 500: Server error

### POST /auth/refresh

**Purpose:** Refresh expired access token using valid refresh token
**Parameters:**
- `refreshToken` (string, required) - Valid refresh token from login/register

**Request Example:**
```json
{
  "refreshToken": "uuid_refresh_token"
}
```

**Response (200 OK):**
```json
{
  "success": true,
  "data": {
    "tokens": {
      "accessToken": "new_jwt_token_string",
      "refreshToken": "new_uuid_refresh_token",
      "expiresIn": 900
    }
  },
  "requestId": "req_uuid"
}
```

**Errors:**
- 400: Missing refresh token
- 401: Invalid or expired refresh token
- 500: Server error

### POST /auth/logout

**Purpose:** Logout from current device, invalidate specific refresh token
**Parameters:**
- `refreshToken` (string, required) - Refresh token to invalidate

**Request Example:**
```json
{
  "refreshToken": "uuid_refresh_token"
}
```

**Response (200 OK):**
```json
{
  "success": true,
  "message": "Logged out successfully",
  "requestId": "req_uuid"
}
```

**Errors:**
- 400: Missing refresh token
- 401: Invalid refresh token
- 500: Server error

### POST /auth/logout-all

**Purpose:** Logout from all devices, invalidate all user's refresh tokens
**Headers:**
- `Authorization: Bearer {access_token}` (required)

**Response (200 OK):**
```json
{
  "success": true,
  "message": "Logged out from all devices",
  "requestId": "req_uuid"
}
```

**Errors:**
- 401: Invalid or missing access token
- 500: Server error

## Authentication Middleware Integration

### Protected Route Pattern

**Purpose:** Middleware that accepts either JWT token or API key for authentication
**Implementation:** Applied to routes requiring authentication

**JWT Token Usage:**
```
Headers: Authorization: Bearer {jwt_access_token}
```

**API Key Usage:**
```
Headers: X-API-Key: {api_key_string}
```

**Middleware Response (Unauthorized):**
```json
{
  "success": false,
  "error": {
    "code": "AUTHENTICATION_REQUIRED",
    "message": "Valid JWT token or API key required"
  },
  "requestId": "req_uuid"
}
```

### Request Context Enhancement

**Purpose:** Authenticated requests receive additional context
**Implementation:** Middleware attaches user/apiKey data to request object

**For JWT Authentication:**
```typescript
req.user = {
  id: "user_uuid",
  email: "user@example.com",
  name: "John Doe"
}
req.authType = "jwt"
```

**For API Key Authentication:**
```typescript
req.apiKey = {
  id: "api_key_uuid",
  key: "api_key_string", 
  name: "API Key Name"
}
req.authType = "apikey"
```