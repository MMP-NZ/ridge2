# Deploying Ridge (staging/production)

Hosting decision (Milestone 0, confirmed with Phil): **AWS, `ap-southeast-6` (Auckland)**. Customer data must stay in NZ (`CLAUDE.md` non-negotiable) — don't deploy to any other region.

## Status

`.github/workflows/deploy-staging.yml` builds the Docker image on every push to `main` but stops there — it isn't wired to a real AWS environment yet. Turning it on needs:

1. An AWS account (or account within an existing AWS Organization) with access to `ap-southeast-6`
2. A GitHub Actions OIDC role (`AWS_ROLE_TO_ASSUME` secret) scoped to: push to one ECR repository, update one ECS service (or equivalent) — least privilege, not admin
3. An ECR repository for the `ridge` image
4. A running Postgres instance in `ap-southeast-6` (RDS is the simplest start) for staging
5. A place to run the container (ECS Fargate is the simplest start — ECS Fargate is not listed as unavailable in `ap-southeast-6` on AWS's regional service pages as of Sep 2026, but **recheck before provisioning**, since new regions sometimes launch with a reduced service set)
6. Secrets for staging: `DATABASE_AUTH_URL`, `DATABASE_URL`, `DATABASE_MIGRATE_URL`, `SESSION_SECRET`, `TOTP_ENCRYPTION_KEY` (all as GitHub Actions secrets, never committed)

None of the above gets created without explicit sign-off — this file documents the shape of the work, not permission to provision AWS resources.

## Database roles in a non-superuser environment

Locally, `ridge_auth`/`ridge_app` are created by `src/db/roles.sql` (invoked from `pnpm db:migrate`) using trust authentication, and the migration role is the Homebrew Postgres superuser — which always bypasses RLS regardless of `FORCE ROW LEVEL SECURITY`.

**In staging/production the migration role will not be a full superuser** (least privilege). Because every tenant-owned table uses `FORCE ROW LEVEL SECURITY`, a non-superuser owner IS subject to RLS unless it's been granted `BYPASSRLS`. So the staging/production migration role needs:

```sql
ALTER ROLE <migration_role> WITH BYPASSRLS;
```

`BYPASSRLS` is still far short of superuser — it doesn't grant schema-level admin beyond what's explicitly granted. Set passwords for `ridge_auth` and `ridge_app` explicitly (not trust auth) once outside local dev — CI already does this (see `.github/workflows/ci.yml`).

## pg-boss

The background job queue (`src/lib/queue.ts`) creates its own `pgboss` schema and needs `CREATE` on the target database. It runs against the migration connection, not `ridge_app` — factor that into the migration role's grants.

## Health check / next steps once AWS access exists

1. Provision RDS Postgres 16 in `ap-southeast-6`, private subnet, encrypted at rest
2. Create the least-privilege GitHub OIDC role and ECR repo
3. Fill in the TODOs in `deploy-staging.yml`
4. Confirm `pnpm db:migrate` runs cleanly against the staging DB before any app traffic
5. Re-run the M0 done-when checklist (`docs/build-plan.md`) against staging, not just local
