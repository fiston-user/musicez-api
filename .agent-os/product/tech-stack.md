# Technical Stack

## Core Technologies

### Backend Framework
- **Application Framework:** Express.js v5.1.0 with TypeScript
- **Runtime:** Node.js v20+ LTS
- **Language:** TypeScript v5.9.2

### Database & ORM
- **Database System:** PostgreSQL v16-alpine
- **ORM:** Prisma v6.14.0 with Prisma Client
- **Caching:** Redis v7-alpine (containerized, ready for session/caching)

### API Architecture
- **API Style:** RESTful with OpenAPI 3.0 documentation
- **Authentication:** JWT tokens with refresh token rotation
- **Rate Limiting:** Express-rate-limit with Redis store
- **Validation:** Zod for request/response validation

### AI & Music Analysis
- **AI Provider:** OpenAI GPT-4 for recommendation generation
- **Music Data API:** Spotify Web API for song metadata
- **Audio Analysis:** Essentia.js for musical feature extraction

### Development Tools
- **Package Manager:** npm
- **Build Tool:** tsx v4.20.5 for development, tsc for production
- **Testing:** Jest v30.0.5 with ts-jest v29.4.1, Supertest v7.1.4 for API testing
- **Docker:** Docker Compose with multi-container setup (app, postgres, redis)
- **Linting:** ESLint (configured, ready for use)
- **Type Checking:** TypeScript strict mode with comprehensive compiler options

### Infrastructure & Deployment
- **Application Hosting:** Railway or Render (containerized deployment)
- **Database Hosting:** Supabase or Neon (managed PostgreSQL)
- **Asset Hosting:** Cloudflare R2 or AWS S3 (for cached analysis data)
- **Deployment Solution:** Docker with GitHub Actions CI/CD
- **Monitoring:** Sentry for error tracking, Prometheus for metrics

### Security & Compliance
- **API Security:** Helmet.js for security headers
- **CORS:** Configurable CORS with express-cors
- **Environment Management:** dotenv with validation
- **Secrets Management:** Environment variables with validation

### Documentation & Developer Experience
- **API Documentation:** Swagger UI with OpenAPI spec
- **Code Documentation:** TypeDoc for TypeScript documentation
- **SDK Generation:** OpenAPI Generator for client SDKs

### Future Considerations (Frontend)
- **JavaScript Framework:** React or Next.js (to be added later)
- **CSS Framework:** Tailwind CSS
- **UI Component Library:** shadcn/ui or Material-UI
- **State Management:** Zustand or Redux Toolkit

## Repository Information
- **Code Repository URL:** https://github.com/[username]/musicez-api
- **Import Strategy:** node (npm packages)
- **Node Version:** 20.x LTS
- **TypeScript Config:** Strict mode enabled