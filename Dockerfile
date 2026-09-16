FROM node:22-alpine AS base

FROM base AS deps
WORKDIR /app
RUN corepack enable
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

FROM base AS builder
WORKDIR /app
RUN corepack enable
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Next inlines NEXT_PUBLIC_* into the bundle at build time, so they must be
# here, not only on the running container. Without APP_URL every link in a
# text message would point at http://localhost:3000. Render passes a
# service's env vars to the build as build args of the same name.
ARG NEXT_PUBLIC_APP_URL
ARG NEXT_PUBLIC_PRODUCT_NAME
ENV NEXT_PUBLIC_APP_URL=$NEXT_PUBLIC_APP_URL
ENV NEXT_PUBLIC_PRODUCT_NAME=$NEXT_PUBLIC_PRODUCT_NAME

RUN pnpm build
# The worker, migrations and setup scripts, bundled so the runner can start
# them with plain node (see scripts/bundle-scripts.mjs).
RUN node scripts/bundle-scripts.mjs

FROM base AS runner
WORKDIR /app
ENV NODE_ENV=production
RUN addgroup --system --gid 1001 nodejs && adduser --system --uid 1001 nextjs

COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=builder --chown=nextjs:nodejs /app/dist ./dist

USER nextjs
EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

# The web server. The same image runs the other processes:
#   worker          node dist/worker.mjs
#   migrations      node dist/migrate.mjs      (Render's preDeployCommand)
#   first staff     node dist/bootstrap.mjs <email> "<name>"
CMD ["node", "server.js"]
