# Ridge

Codename for the Juno Logic client platform. See [`CLAUDE.md`](./CLAUDE.md) for what this is and the non-negotiables, and [`docs/spec.md`](./docs/spec.md) / [`docs/build-plan.md`](./docs/build-plan.md) for the full spec and milestone plan.

## Local setup

Requires Node 22+, pnpm (`corepack enable`), and a local PostgreSQL 16.

```bash
cp .env.example .env.local   # fill in SECRET_ENCRYPTION_KEY (openssl rand -hex 32)
createdb ridge_dev
createdb ridge_test
pnpm install
pnpm db:migrate               # creates ridge_auth/ridge_app roles, runs migrations, sets up RLS
pnpm db:seed                  # one fictional demo tenant
pnpm dev
```

Open http://localhost:3000 — installable as a PWA, phone-first (390px baseline).

Staging runs on Render; see [`docs/deploy.md`](./docs/deploy.md).

## Commands

| Command | What it does |
|---|---|
| `pnpm dev` | Start the dev server |
| `pnpm build` / `pnpm start` | Production build / run |
| `pnpm test` | Run the vitest suite against `ridge_test` (tenant isolation, audit logging, auth) |
| `pnpm typecheck` | `tsc --noEmit` |
| `pnpm lint` | ESLint |
| `pnpm db:generate` | Generate a Drizzle migration from `src/db/schema` |
| `pnpm db:migrate` | Apply migrations (and ensure `ridge_auth`/`ridge_app` roles exist) |
| `pnpm db:seed` | Seed one fictional demo tenant |
| `pnpm db:bootstrap <email> "<name>"` | Create the first Juno Logic staff login, printing a generated password once |
| `pnpm worker` | Run the background job worker alongside `pnpm dev` |
| `pnpm bundle` | Bundle the worker, migrations and setup scripts into `dist/` for the Docker image |

## Architecture notes

- **Tenant isolation is enforced in Postgres**, not just app code — every tenant-owned table has row-level security, `FORCE`d, keyed on a `SET LOCAL app.tenant_id` set once per request from the verified session. See `src/db/migrations/0001_rls_policies.sql` and `src/db/client.ts`.
- Two DB roles: `ridge_auth` (pre-authentication lookups only, no visibility into tenant data) and `ridge_app` (authenticated requests, RLS-scoped). Never connect as the migration/owner role from request-handling code.
- Every Juno staff access to a tenant is audit-logged in the same DB transaction as the access itself — see `withStaffTenantAccess` in `src/lib/auth/with-tenant-context.ts`.
- Money is integer cents (`src/lib/money.ts`); time is Pacific/Auckland, stored UTC (`src/lib/time.ts`).

See `docs/deploy.md` for staging/production deployment (AWS, Auckland region).
