# Technical Specification

This is the technical specification for the spec detailed in @.agent-os/specs/2025-08-26-jwt-auth-system/spec.md

## Technical Requirements

### Authentication Endpoints
- **POST /auth/register** - User registration with email/password validation, bcrypt password hashing (12 salt rounds)
- **POST /auth/login** - User authentication returning JWT access token (15min expiry) and refresh token (7 days expiry)
- **POST /auth/refresh** - Token refresh endpoint that validates refresh token and returns new access/refresh token pair
- **POST /auth/logout** - Single device logout that revokes specific refresh token from Redis
- **POST /auth/logout-all** - Multi-device logout that revokes all user's refresh tokens from Redis

### JWT Token System
- **Access Tokens**: 15-minute expiry, contains userId, email, iat, exp claims, signed with HS256 algorithm
- **Refresh Tokens**: 7-day expiry, UUID format, stored in Redis with user association and device metadata
- **Token Validation**: Middleware to verify JWT signature, expiration, and token format
- **Token Rotation**: New refresh token issued on each refresh request, old token immediately revoked

### Authentication Middleware
- **Dual Auth Middleware**: Express middleware supporting both JWT Bearer tokens and API key authentication
- **Route Protection**: Flexible decorator/middleware to protect routes with either auth method
- **Request Context**: Attach authenticated user/apiKey information to request object for use in controllers

### Redis Session Management
- **Session Storage**: Store refresh tokens with pattern `refresh_token:{userId}:{tokenId}`
- **Token Metadata**: Store issuedAt, expiresAt, deviceInfo (user-agent hash) with each refresh token
- **Cleanup Service**: Background job to remove expired refresh tokens from Redis
- **Revocation**: Immediate token invalidation capability for security incidents

### Password Security
- **Validation**: Minimum 8 characters, must contain uppercase, lowercase, number, and special character
- **Hashing**: bcrypt with 12 salt rounds for secure password storage
- **Comparison**: Secure password comparison using bcrypt.compare() for login validation
- **Reset Flow**: Secure password reset with time-limited tokens (implementation in future phase)

### Input Validation & Error Handling
- **Zod Schemas**: Request/response validation schemas for all authentication endpoints
- **Error Responses**: Consistent error format with proper HTTP status codes (400, 401, 403, 500)
- **Rate Limiting**: Enhanced rate limiting for auth endpoints (stricter than general API limits)
- **Security Headers**: Proper authentication-related headers (WWW-Authenticate, etc.)

## External Dependencies

- **bcrypt** (^5.1.0) - Secure password hashing and comparison
  - **Justification:** Industry standard for password hashing, provides built-in salt generation and timing attack protection

- **jsonwebtoken** (^9.0.0) - JWT token generation and verification
  - **Justification:** Most widely used JWT library for Node.js, supports all standard algorithms and claims

- **uuid** (already installed ^11.1.0) - Refresh token ID generation
  - **Justification:** Generate cryptographically secure unique identifiers for refresh tokens