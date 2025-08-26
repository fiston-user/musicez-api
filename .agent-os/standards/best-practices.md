# Development Best Practices

## Context

Global development guidelines for Agent OS projects.

<conditional-block context-check="core-principles">
IF this Core Principles section already read in current context:
  SKIP: Re-reading this section
  NOTE: "Using Core Principles already in context"
ELSE:
  READ: The following principles

## Core Principles

### Keep It Simple
- Implement code in the fewest lines possible
- Avoid over-engineering solutions
- Choose straightforward approaches over clever ones

### Optimize for Readability
- Prioritize code clarity over micro-optimizations
- Write self-documenting code with clear variable names
- Add comments for "why" not "what"

### DRY (Don't Repeat Yourself)
- Extract repeated business logic to private methods
- Extract repeated UI markup to reusable components
- Create utility functions for common operations

### File Structure
- Keep files focused on a single responsibility
- Group related functionality together
- Use consistent naming conventions
</conditional-block>

<conditional-block context-check="dependencies" task-condition="choosing-external-library">
IF current task involves choosing an external library:
  IF Dependencies section already read in current context:
    SKIP: Re-reading this section
    NOTE: "Using Dependencies guidelines already in context"
  ELSE:
    READ: The following guidelines
ELSE:
  SKIP: Dependencies section not relevant to current task

## Dependencies

### Choose Libraries Wisely
When adding third-party dependencies:
- Select the most popular and actively maintained option
- Check the library's GitHub repository for:
  - Recent commits (within last 6 months)
  - Active issue resolution
  - Number of stars/downloads
  - Clear documentation
</conditional-block>

## MusicEZ-Specific Best Practices

### Security Implementation
- **Always hash sensitive data** before storage using established utilities (`api-key-security.ts`)
- **Never log sensitive values** - log metadata only (lengths, IDs, timestamps)
- **Use custom error classes** for domain-specific security operations
- **Implement comprehensive audit logging** for all sensitive operations with full context

### Response Consistency
- **Use standardized formatters** for all API responses (`*-formatters.ts` utilities)
- **Include request IDs** in all responses for traceability
- **Follow consistent error codes** and HTTP status mappings
- **Provide structured error details** with field-level validation feedback

### Database Operations
- **Always use centralized Prisma client** from `src/database/prisma.ts`
- **Never create new database clients** in controllers or services
- **Implement proper connection lifecycle** management
- **Use database health checks** for monitoring

### Controller Architecture
- **Keep controllers focused** on HTTP request/response handling
- **Extract business logic** to service utilities
- **Use consistent method signatures** with proper Express types
- **Implement performance timing** for all operations

### Testing Strategy
- **Mock modules, not constructor parameters** for singleton services
- **Use flexible expectations** (`expect.objectContaining()`) for evolving code
- **Test both success and error paths** comprehensively
- **Include integration tests** for full middleware chains

### Validation Patterns
- **Use Zod schemas** for all request/response validation
- **Create reusable validation middleware** for common patterns
- **Implement proper error transformation** from validation failures
- **Export TypeScript types** from schema definitions

### Import Organization
Follow the 5-tier import structure:
1. Node.js built-ins
2. External dependencies
3. Internal absolute imports (database, config)
4. Relative imports (utilities, helpers)
5. Type-only imports

### Logging Standards
- **Use structured logging** with consistent field names
- **Include request context** (IP, user agent, request ID)
- **Track performance metrics** (processing time, operation counts)
- **Implement audit trails** for sensitive operations
