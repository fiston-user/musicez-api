# Database Schema

This is the database schema implementation for the spec detailed in @.agent-os/specs/2025-08-26-jwt-auth-system/spec.md

## Database Changes Required

### User Model Modifications

**New Required Fields:**
- `password` - String field to store bcrypt hashed password
- `emailVerified` - Boolean field (default: false) for future email verification
- `lastLoginAt` - DateTime field to track user activity

**Migration Required:**
```sql
ALTER TABLE "users" 
ADD COLUMN "password" TEXT NOT NULL DEFAULT '',
ADD COLUMN "emailVerified" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "lastLoginAt" TIMESTAMP;
```

**Updated Prisma Schema:**
```prisma
model User {
  id              String           @id @default(uuid())
  email           String?          @unique
  password        String           // New required field
  name            String?
  emailVerified   Boolean          @default(false) // New field
  lastLoginAt     DateTime?        // New field
  apiKeyId        String?
  createdAt       DateTime         @default(now())
  updatedAt       DateTime         @updatedAt
  favoriteGenres  String[]
  recommendations Recommendation[]
  preferences     UserPreference[]

  @@index([email])
  @@map("users")
}
```

### Redis Schema (No Database Migration Required)

**Refresh Token Storage Pattern:**
```
Key: refresh_token:{userId}:{tokenId}
Value: JSON {
  "issuedAt": "2025-08-26T10:30:00.000Z",
  "expiresAt": "2025-09-02T10:30:00.000Z", 
  "deviceInfo": "hashed_user_agent_string",
  "userId": "uuid_string"
}
TTL: 7 days (604800 seconds)
```

**User Session Tracking Pattern:**
```
Key: user_sessions:{userId}
Value: Set of active tokenIds
TTL: 7 days
```

## Implementation Rationale

### Password Field
- **Required Field**: Users must have passwords for JWT authentication
- **String Type**: Accommodates bcrypt hashed passwords (60 character output)
- **Default Empty**: Allows for migration of existing users without passwords

### Email Verification
- **Future-Proofing**: Added now but implementation deferred to future phase
- **Boolean Default**: Conservative default (false) for security

### Last Login Tracking
- **Security Monitoring**: Helps detect unusual account activity
- **Optional Field**: Nullable to handle users who haven't logged in yet

### Redis Integration
- **Session Management**: Redis provides fast lookup and automatic expiration
- **Key Patterns**: Structured patterns for efficient querying and cleanup
- **TTL Strategy**: Automatic cleanup of expired tokens reduces memory usage

### Indexes and Constraints
- **Email Index**: Already exists, supports login queries
- **Unique Email**: Prevents duplicate registrations
- **UUID Primary Keys**: Maintains existing system consistency

## Migration Strategy

1. **Add New Columns**: Run migration to add password, emailVerified, lastLoginAt fields
2. **Existing Users**: Set password to empty string (will require password reset)
3. **Email Required**: Make email field required in application logic (was optional)
4. **Redis Setup**: No migration needed, Redis keys created on first token generation