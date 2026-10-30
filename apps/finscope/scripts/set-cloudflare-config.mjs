import { spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { fileURLToPath } from "node:url";

// Stores production runtime settings as Worker secrets. AUTH_SECRET and
// CREDENTIAL_ENCRYPTION_KEY are generated only when missing: replacing them
// breaks every password and the encrypted provider vault. No value is printed.
const projectRoot = fileURLToPath(new URL("../", import.meta.url));
const wrangler = fileURLToPath(new URL("../node_modules/wrangler/bin/wrangler.js", import.meta.url));

const emailFlag = process.argv.indexOf("--admin-email");
const adminEmail = emailFlag > 0 ? process.argv[emailFlag + 1]?.trim() : "";
if (!adminEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(adminEmail)) {
  throw new Error("Usage: npm run deploy:config -- --admin-email you@example.com");
}

function wranglerRun(args, input) {
  const result = spawnSync(process.execPath, [wrangler, ...args, "--config", "dist/server/wrangler.json"], {
    cwd: projectRoot, input, encoding: "utf8", stdio: [input === undefined ? "inherit" : "pipe", "pipe", "inherit"],
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    process.stdout.write(result.stdout ?? "");
    process.exit(result.status ?? 1);
  }
  return result.stdout;
}

const listed = wranglerRun(["secret", "list", "--format", "json"]);
const existing = new Set(JSON.parse(listed.slice(listed.indexOf("["))).map((secret) => secret.name));

const settings = {
  ADMIN_EMAIL: adminEmail,
  SEC_USER_AGENT: `Finscope financial analysis ${adminEmail}`,
  AUTH_ALLOW_LOCAL_HTTP: "false",
  AUTH_EMAIL_TEST_MODE: "false",
  AUTH_TRUST_SITES_IDENTITY: "false",
  OWNER_SETUP_ENABLED: "false",
  SCHEDULER_ENABLED: "false",
};
if (!existing.has("AUTH_SECRET")) settings.AUTH_SECRET = randomBytes(48).toString("base64url");
if (!existing.has("CREDENTIAL_ENCRYPTION_KEY")) settings.CREDENTIAL_ENCRYPTION_KEY = randomBytes(32).toString("hex");

wranglerRun(["secret", "bulk"], JSON.stringify(settings));
console.log(`Updated: ${Object.keys(settings).join(", ")}`);
console.log(`Kept existing: ${["AUTH_SECRET", "CREDENTIAL_ENCRYPTION_KEY"].filter((name) => existing.has(name)).join(", ") || "none"}`);
