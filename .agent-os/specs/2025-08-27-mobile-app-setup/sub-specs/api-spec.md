# API Specification

This is the API specification for the spec detailed in @.agent-os/specs/2025-08-27-mobile-app-setup/spec.md

## API Integration Overview

The mobile app will integrate with the existing musicez backend API to provide authentication services. During the setup phase, only authentication endpoints will be implemented, with other endpoints (search, recommendations, Spotify) to be added in subsequent feature specifications.

## Endpoints

### POST /api/v1/auth/register

**Purpose:** Register a new user account
**Parameters:** 
- Body: `{ email: string, password: string, name?: string }`
**Response:** 
```json
{
  "success": true,
  "data": {
    "user": { "id": string, "email": string, "name": string },
    "accessToken": string,
    "refreshToken": string
  },
  "timestamp": string
}
```
**Errors:** 400 (validation), 409 (user exists), 500 (server error)

### POST /api/v1/auth/login

**Purpose:** Authenticate existing user
**Parameters:** 
- Body: `{ email: string, password: string }`
**Response:** 
```json
{
  "success": true,
  "data": {
    "user": { "id": string, "email": string, "name": string },
    "accessToken": string,
    "refreshToken": string
  },
  "timestamp": string
}
```
**Errors:** 400 (validation), 401 (invalid credentials), 500 (server error)

### POST /api/v1/auth/refresh

**Purpose:** Refresh expired access token using refresh token
**Parameters:** 
- Body: `{ refreshToken: string }`
**Response:** 
```json
{
  "success": true,
  "data": {
    "accessToken": string,
    "refreshToken": string
  },
  "timestamp": string
}
```
**Errors:** 400 (validation), 401 (invalid refresh token), 500 (server error)

### POST /api/v1/auth/logout

**Purpose:** Invalidate user session and refresh token
**Parameters:** 
- Headers: `Authorization: Bearer <accessToken>`
- Body: `{ refreshToken: string }`
**Response:** 
```json
{
  "success": true,
  "data": { "message": "Logged out successfully" },
  "timestamp": string
}
```
**Errors:** 401 (unauthorized), 500 (server error)

## API Client Implementation

### Base Configuration
- Base URL: Environment-specific (development: http://localhost:3000, production: TBD)
- Default headers: `Content-Type: application/json`
- Timeout: 10 seconds
- Retry policy: 3 retries for network errors

### Request Interceptor
- Automatically attach Bearer token to requests requiring authentication
- Add request ID for debugging and logging
- Handle request timing for performance monitoring

### Response Interceptor
- Handle token refresh automatically when receiving 401 responses
- Parse error responses consistently across the app
- Log API errors for debugging purposes

### Error Handling Strategy
- Network errors: Show retry mechanism
- 401 Unauthorized: Trigger automatic token refresh or logout
- 400 Bad Request: Display validation errors to user
- 500 Server Error: Show generic error message
- Timeout: Show network connectivity message

## TypeScript Interfaces

```typescript
interface User {
  id: string;
  email: string;
  name: string;
}

interface AuthResponse {
  success: true;
  data: {
    user: User;
    accessToken: string;
    refreshToken: string;
  };
  timestamp: string;
}

interface ApiError {
  success: false;
  error: {
    code: string;
    message: string;
    field?: string;
  };
  timestamp: string;
}
```