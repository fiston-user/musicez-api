# Tech Stack

## Context

Global tech stack defaults for Agent OS projects, overridable in project-specific `.agent-os/product/tech-stack.md`.

- **Backend Framework:** Express 5.x
- **Frontend / Full-stack Framework:** Next.js 15 (App Router)
- **Language:** TypeScript 5.6+ (strict) with JavaScript interop
- **Runtime:** Node.js 22 LTS
- **Primary Database:** PostgreSQL 17+
- **ORM / DB Client:** Prisma (latest stable)
- **Build Tools:** Next.js build/Turbopack (web), tsup (API), tsx for dev
- **Import Strategy:** ES Modules (`"type": "module"`) with TS path aliases
- **Package Manager:** npm
- **CSS Framework:** Tailwind CSS 4.0+
- **UI Components:** shadcn/ui (Radix UI)
- **UI Installation:** shadcn CLI in app workspace
- **Font Provider:** Google Fonts
- **Font Loading:** `next/font` (self-hosted for performance)
- **Icons:** Lucide React components
- **API Style:** REST with OpenAPI 3.1 (Swagger UI for docs)
- **Authentication:** Auth.js (NextAuth) + Prisma adapter
- **Validation:** Zod (end-to-end schema validation)
- **Data Fetching (client):** TanStack Query
- **Caching / Jobs:** Redis (Upstash) + BullMQ
- **Realtime:** Socket.IO (or SSE via Next Route Handlers)
- **Application Hosting:** Vercel (Next.js) + Railway/DigitalOcean Apps (Express API)
- **Hosting Region:** Primary region based on user base
- **Database Hosting:** DigitalOcean Managed PostgreSQL (or Neon serverless)
- **Database Backups:** Daily automated
- **Asset Storage:** Amazon S3
- **CDN:** CloudFront (Vercel Edge for Next assets where applicable)
- **Asset Access:** Private with signed URLs
- **CI/CD Platform:** GitHub Actions
- **CI/CD Trigger:** Push to main/staging branches
- **Tests:** Vitest (unit) · Supertest (API) · Playwright (e2e) — run before deployment
- **Production Environment:** `main` branch
- **Staging Environment:** `staging` branch
