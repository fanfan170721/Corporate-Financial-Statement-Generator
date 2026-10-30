import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

// Builds against the production D1 database in cloudflare.production.json,
// applies pending migrations remotely, then deploys the Worker.
const projectRoot = fileURLToPath(new URL("../", import.meta.url));
const wrangler = fileURLToPath(new URL("../node_modules/wrangler/bin/wrangler.js", import.meta.url));
const { d1DatabaseName, d1DatabaseId, customDomains = [] } = JSON.parse(
  readFileSync(new URL("../cloudflare.production.json", import.meta.url), "utf8"),
);
if (!d1DatabaseId) {
  throw new Error(`Set d1DatabaseId in cloudflare.production.json (npx wrangler d1 create ${d1DatabaseName}).`);
}

const env = { ...process.env, FINSCOPE_D1_DATABASE_NAME: d1DatabaseName, FINSCOPE_D1_DATABASE_ID: d1DatabaseId };
function run(label, args) {
  console.log(`\n=== ${label} ===`);
  const result = spawnSync(process.execPath, args, { cwd: projectRoot, env, stdio: "inherit" });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}

const config = ["--config", "dist/server/wrangler.json"];
const skipMigrations = process.argv.includes("--skip-migrations");
run("build", ["scripts/run-framework.mjs", "build"]);
// Never edit an applied migration; Wrangler records applied files in d1_migrations.
if (!skipMigrations) run("D1 migrations", [wrangler, "d1", "migrations", "apply", "DB", "--remote", ...config]);
// Every deploy restates the custom domains so they stay attached to this Worker.
run("deploy", [wrangler, "deploy", "--keep-vars", ...config, ...customDomains.flatMap((domain) => ["--domain", domain])]);
