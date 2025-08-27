# Mobile Authentication API Integration Spec

> Created: 2025-08-27  
> Priority: High  
> Effort: L (2 weeks)  
> Status: Ready to Start

## Overview

Implement the authentication API service layer in the mobile app to connect the existing Zustand auth store with the production-ready backend JWT authentication endpoints. This will enable users to register, login, and manage their sessions securely through the mobile app.

## Context

### Current State
- **Backend API**: Complete JWT authentication system with access/refresh tokens, Redis sessions, and comprehensive security
- **Mobile App**: Foundation setup with Zustand auth store, navigation flow switching, and placeholder screens
- **API Endpoints**: Production-ready auth endpoints at `/api/v1/auth/*`
- **Authentication Flow**: Backend supports register, login, refresh, logout, and logout-all operations

### Target State
- Mobile app can authenticate users against the backend API
- Automatic token management with refresh token rotation
- Persistent login sessions with secure storage
- Proper error handling and user feedback
- Seamless navigation between auth and main app flows

## Technical Requirements

### API Integration Layer

**Create Authentication Service (`/mobile/src/services/AuthService.ts`)**
- Implement HTTP client with axios for API communication
- Handle JWT access token and refresh token management
- Implement automatic token refresh with interceptors
- Provide methods for register, login, logout, and token refresh
- Handle API rate limiting and error responses
- Support offline mode with cached authentication state

**API Endpoint Integration**
- `POST /api/v1/auth/register` - User registration with email/password validation
- `POST /api/v1/auth/login` - User authentication with JWT token response
- `POST /api/v1/auth/refresh` - Automatic token refresh using refresh token
- `POST /api/v1/auth/logout` - Single session logout
- `POST /api/v1/auth/logout-all` - Logout from all sessions

### State Management Integration

**Update Auth Store (`/mobile/src/store/authStore.ts`)**
- Connect store actions to AuthService methods
- Implement persistent state with AsyncStorage for tokens
- Add loading states for all authentication operations
- Handle authentication errors with proper user messaging
- Support automatic login on app startup if valid tokens exist
- Implement secure token storage using Expo SecureStore

**Store Actions**
```typescript
interface AuthStore {
  // State
  user: User | null
  accessToken: string | null
  isAuthenticated: boolean
  isLoading: boolean
  error: string | null
  
  // Actions
  register: (email: string, password: string, name: string) => Promise<void>
  login: (email: string, password: string) => Promise<void>
  logout: () => Promise<void>
  logoutAll: () => Promise<void>
  refreshToken: () => Promise<void>
  clearError: () => void
  initializeAuth: () => Promise<void>
}
```

### Screen Implementation

**Login Screen (`/mobile/src/screens/auth/LoginScreen.tsx`)**
- Form with email and password fields using react-hook-form
- Input validation matching backend requirements
- Error display for authentication failures
- Loading states during API calls
- Navigation to register screen
- "Remember me" functionality for persistent sessions

**Register Screen (`/mobile/src/screens/auth/RegisterScreen.tsx`)**
- Form with name, email, password, and confirm password fields
- Client-side validation for password requirements:
  - Minimum 8 characters
  - At least one uppercase letter
  - At least one lowercase letter  
  - At least one number
  - At least one special character
- Email format validation
- Error display for registration failures
- Navigation to login screen after successful registration

### Security Implementation

**Token Management**
- Store refresh tokens securely using Expo SecureStore
- Store access tokens in memory only (not persistent storage)
- Implement automatic token refresh 5 minutes before expiration
- Clear all tokens on logout operations
- Handle token expiration gracefully with user re-authentication

**API Security**
- Include JWT tokens in Authorization headers (Bearer format)
- Implement CSRF protection for authentication requests  
- Handle rate limiting responses from backend (429 status)
- Validate SSL certificates in production builds
- Implement request timeouts and retry logic

### Error Handling

**Authentication Errors**
- Invalid credentials (401) - Clear error message to user
- Account already exists (409) - Redirect to login with message
- Rate limiting (429) - Display retry timer to user
- Network errors - Offline mode with cached state
- Server errors (500) - Generic error message with retry option

**User Experience**
- Loading spinners during API operations
- Form validation with real-time feedback  
- Success messages for registration and login
- Automatic navigation after successful authentication
- Proper keyboard handling and form accessibility

## API Specifications

### Authentication Endpoints

All endpoints expect `Content-Type: application/json` and return JSON responses.

**POST /api/v1/auth/register**
```typescript
// Request
interface RegisterRequest {
  name: string      // 2-100 characters
  email: string     // Valid email format
  password: string  // Password requirements as above
}

// Response (201 Created)
interface AuthResponse {
  user: {
    id: string
    name: string
    email: string
    createdAt: string
  }
  accessToken: string   // JWT, 15 min expiry
  refreshToken: string  // 7 days expiry
}
```

**POST /api/v1/auth/login**
```typescript
// Request
interface LoginRequest {
  email: string
  password: string
}

// Response (200 OK)
interface AuthResponse {
  user: {
    id: string
    name: string
    email: string
    lastLoginAt: string
  }
  accessToken: string
  refreshToken: string
}
```

**POST /api/v1/auth/refresh**
```typescript
// Request
interface RefreshRequest {
  refreshToken: string
}

// Response (200 OK)
interface RefreshResponse {
  accessToken: string   // New access token
  refreshToken: string  // New refresh token (rotation)
}
```

**POST /api/v1/auth/logout**
```typescript
// Headers: Authorization: Bearer <accessToken>
// Request body: empty
// Response: 204 No Content
```

**POST /api/v1/auth/logout-all**
```typescript
// Headers: Authorization: Bearer <accessToken>  
// Request body: empty
// Response: 204 No Content
```

### Error Responses

```typescript
interface ErrorResponse {
  error: string
  message: string
  statusCode: number
  timestamp: string
}
```

Common error status codes:
- `400` - Bad Request (invalid input)
- `401` - Unauthorized (invalid credentials/token)
- `409` - Conflict (email already exists)
- `422` - Validation Error (password requirements not met)
- `429` - Too Many Requests (rate limit exceeded)
- `500` - Internal Server Error

## Development Environment

### Configuration

**Environment Variables (`/mobile/.env`)**
```
API_BASE_URL=http://localhost:3000/api/v1
AUTH_TOKEN_STORAGE_KEY=@musicez:auth_token
REFRESH_TOKEN_STORAGE_KEY=@musicez:refresh_token
USER_DATA_STORAGE_KEY=@musicez:user_data
```

**API Configuration (`/mobile/src/constants/config.ts`)**
```typescript
export const API_CONFIG = {
  BASE_URL: process.env.API_BASE_URL || 'http://localhost:3000/api/v1',
  TIMEOUT: 10000,
  RETRY_ATTEMPTS: 3,
  TOKEN_REFRESH_THRESHOLD: 5 * 60 * 1000, // 5 minutes in ms
} as const
```

### Dependencies

Required packages (already installed):
- `axios` - HTTP client for API calls
- `@react-native-async-storage/async-storage` - General app state persistence
- `expo-secure-store` - Secure token storage
- `react-hook-form` - Form handling and validation
- `zustand` - State management

## Acceptance Criteria

### Core Functionality
- [ ] Users can register new accounts with email/password
- [ ] Users can login with existing credentials  
- [ ] Users remain logged in between app sessions
- [ ] Users can logout from current session
- [ ] Users can logout from all sessions
- [ ] Access tokens refresh automatically before expiration

### User Experience
- [ ] Form validation provides real-time feedback
- [ ] Loading states show during API operations
- [ ] Error messages are clear and actionable
- [ ] Navigation flows work seamlessly between auth and main screens
- [ ] App handles network connectivity issues gracefully

### Security
- [ ] Refresh tokens stored securely (Expo SecureStore)
- [ ] Access tokens stored in memory only
- [ ] All tokens cleared on logout operations  
- [ ] API requests include proper authentication headers
- [ ] Rate limiting handled with user-friendly messages

### Technical
- [ ] Integration tests cover all authentication flows
- [ ] API service handles all backend authentication endpoints
- [ ] Auth store maintains proper state synchronization
- [ ] Error handling covers all possible failure scenarios
- [ ] Code follows project TypeScript and React Native best practices

## Testing Strategy

### Unit Tests
- AuthService methods (register, login, logout, refresh)
- Auth store actions and state updates
- Form validation logic
- Token management utilities

### Integration Tests  
- Complete authentication flows (register -> login -> main app)
- Token refresh scenarios
- Error handling for various API responses
- Navigation flow testing

### Manual Testing
- Test with actual backend API running locally
- Verify persistent login sessions work correctly
- Test offline/online mode transitions
- Verify secure storage of sensitive data

## Dependencies

### Technical Dependencies
- Backend API must be running locally at `http://localhost:3000`
- PostgreSQL and Redis containers must be active
- Mobile development environment (Expo CLI, device/simulator)

### Project Dependencies
- Backend authentication endpoints (already complete)
- Mobile app foundation (already complete)
- Navigation and state management setup (already complete)

## Timeline

**Week 1: API Integration Layer**
- Implement AuthService with all backend endpoints
- Set up automatic token refresh with axios interceptors
- Implement secure token storage with Expo SecureStore
- Create comprehensive error handling

**Week 2: UI Implementation & Testing**
- Build login and register screens with forms and validation
- Update auth store with service integration
- Implement loading states and error displays
- Write tests and perform integration testing

## Success Metrics

- Users can complete registration and login flows without errors
- Authentication state persists correctly between app sessions
- Token refresh works automatically without user intervention
- Error handling provides clear feedback for all failure scenarios
- Integration tests achieve >90% code coverage for auth functionality