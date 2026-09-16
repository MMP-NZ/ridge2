// Bundles the processes that run outside Next.js — the worker, migrations and
// the setup scripts — into dist/, so the production image can run them with
// plain `node` instead of shipping tsx and the TypeScript source.
//
// Run by the Dockerfile after `next build`, and by `pnpm bundle` locally.
import { build } from "esbuild";
import { cp, rm } from "node:fs/promises";

const entryPoints = {
  worker: "src/worker.ts",
  migrate: "src/db/migrate.ts",
  bootstrap: "src/db/bootstrap.ts",
  seed: "src/db/seed.ts",
};

await rm("dist", { recursive: true, force: true });

await build({
  entryPoints,
  outdir: "dist",
  outExtension: { ".js": ".mjs" },
  bundle: true,
  platform: "node",
  target: "node22",
  format: "esm",
  // Everything is inlined, because Next's standalone output only traces the
  // packages the web server needs, not the worker's.
  packages: "bundle",
  // `server-only` throws unless resolved under this condition, which is how
  // Next itself imports it on the server.
  conditions: ["react-server"],
  // Some bundled CommonJS dependencies call require() at runtime, which an
  // ES module has no access to without this.
  banner: {
    js: "import { createRequire as __ridgeCreateRequire } from 'node:module'; const require = __ridgeCreateRequire(import.meta.url);",
  },
  sourcemap: true,
  logLevel: "info",
});

// migrate.mjs reads these relative to its own location, the same way
// src/db/migrate.ts does when run from source.
await cp("src/db/migrations", "dist/migrations", { recursive: true });
await cp("src/db/roles.sql", "dist/roles.sql");
