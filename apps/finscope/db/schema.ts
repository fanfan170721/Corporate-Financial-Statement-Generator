import { integer, primaryKey, sqliteTable, text, index, uniqueIndex } from "drizzle-orm/sqlite-core";

// IDs come from verified application sessions; existing legacy IDs remain valid.
export const profiles = sqliteTable("profiles", {
  userId: text("user_id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull(),
  preferences: text("preferences").notNull(),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const favorites = sqliteTable("favorites", {
  userId: text("user_id").notNull().references(() => profiles.userId),
  symbol: text("symbol").notNull(),
  createdAt: text("created_at").notNull(),
}, (table) => [primaryKey({ columns: [table.userId, table.symbol] })]);

export const reports = sqliteTable("reports", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().references(() => profiles.userId),
  symbol: text("symbol").notNull(),
  mode: text("mode").notNull(),
  payload: text("payload").notNull(),
  createdAt: text("created_at").notNull(),
}, (table) => [index("reports_user_created").on(table.userId, table.createdAt)]);

export const schedules = sqliteTable("schedules", {
  userId: text("user_id").primaryKey().references(() => profiles.userId),
  symbols: text("symbols").notNull(),
  time: text("time").notNull(),
  timezone: text("timezone").notNull(),
  enabled: integer("enabled").notNull().default(0),
  lastRun: text("last_run"),
  updatedAt: text("updated_at").notNull(),
});

// A single INSERT ... SELECT atomically checks concurrency and daily quota.
// Released/expired leases remain as a quota ledger, so crashes cannot erase usage.
export const reportJobs = sqliteTable("report_jobs", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().references(() => profiles.userId),
  units: integer("units").notNull(),
  cost: integer("cost").notNull(),
  kind: text("kind").notNull(),
  quotaDay: text("quota_day").notNull(),
  state: text("state").notNull(),
  expiresAt: integer("expires_at").notNull(),
  createdAt: text("created_at").notNull(),
}, (table) => [index("jobs_user_quota").on(table.userId, table.quotaDay), index("jobs_user_state").on(table.userId, table.state, table.expiresAt)]);

export const scheduleRuns = sqliteTable("schedule_runs", {
  userId: text("user_id").notNull().references(() => profiles.userId),
  localDate: text("local_date").notNull(),
  state: text("state").notNull(),
  createdAt: text("created_at").notNull(),
  finishedAt: text("finished_at"),
}, (table) => [primaryKey({ columns: [table.userId, table.localDate] })]);

export const activity = sqliteTable("activity", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().references(() => profiles.userId),
  action: text("action").notNull(),
  symbols: text("symbols").notNull(),
  createdAt: text("created_at").notNull(),
}, (table) => [index("activity_user_created").on(table.userId, table.createdAt)]);

export const memos = sqliteTable("memos", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().references(() => profiles.userId),
  title: text("title").notNull(),
  symbol: text("symbol"),
  thesis: text("thesis").notNull(),
  catalysts: text("catalysts").notNull(),
  valuation: text("valuation").notNull(),
  risks: text("risks").notNull(),
  disconfirming: text("disconfirming").notNull(),
  evidence: text("evidence").notNull(),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
}, (table) => [index("memos_user_updated").on(table.userId, table.updatedAt)]);

export const scenarios = sqliteTable("scenarios", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().references(() => profiles.userId),
  kind: text("kind").notNull(),
  name: text("name").notNull(),
  config: text("config").notNull(),
  revision: integer("revision").notNull().default(1),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
}, (table) => [index("scenarios_user_updated").on(table.userId, table.updatedAt)]);

export const authAccounts = sqliteTable("auth_accounts", {
  userId: text("user_id").primaryKey().references(() => profiles.userId),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  verifiedAt: integer("verified_at").notNull(),
  passwordVersion: integer("password_version").notNull().default(1),
  createdAt: integer("created_at").notNull(),
  updatedAt: integer("updated_at").notNull(),
});

export const authChallenges = sqliteTable("auth_challenges", {
  id: text("id").primaryKey(),
  email: text("email").notNull(),
  purpose: text("purpose").notNull(),
  codeHash: text("code_hash").notNull(),
  payload: text("payload").notNull(),
  attempts: integer("attempts").notNull().default(0),
  expiresAt: integer("expires_at").notNull(),
  consumedAt: integer("consumed_at"),
  delivery: text("delivery").notNull(),
  createdAt: integer("created_at").notNull(),
}, (table) => [index("auth_challenge_email").on(table.email, table.purpose, table.createdAt)]);

export const authSessions = sqliteTable("auth_sessions", {
  id: text("id").primaryKey(),
  tokenHash: text("token_hash").notNull().unique(),
  userId: text("user_id").notNull().references(() => authAccounts.userId),
  passwordVersion: integer("password_version").notNull(),
  expiresAt: integer("expires_at").notNull(),
  createdAt: integer("created_at").notNull(),
}, (table) => [index("auth_sessions_user").on(table.userId, table.expiresAt)]);

export const authRateLimits = sqliteTable("auth_rate_limits", {
  key: text("key").primaryKey(),
  count: integer("count").notNull(),
  expiresAt: integer("expires_at").notNull(),
}, (table) => [index("auth_rate_expiry").on(table.expiresAt)]);

export const aiCredentials = sqliteTable('ai_credentials', {
  scope: text('scope').primaryKey(), ciphertext: text('ciphertext').notNull(), suffix: text('suffix').notNull(), updatedAt: text('updated_at').notNull(),
});
export const aiConfig = sqliteTable('ai_config', { id: text('id').primaryKey(), payload: text('payload').notNull() });
export const aiPasses = sqliteTable('ai_passes', {
  id: text('id').primaryKey(), codeHash: text('code_hash').notNull().unique(), label: text('label').notNull(), maxClaims: integer('max_claims').notNull(),
  claims: integer('claims').notNull().default(0), tokenLimit: integer('token_limit').notNull(), requestLimit: integer('request_limit').notNull(),
  redeemBefore: integer('redeem_before').notNull(), revoked: integer('revoked').notNull().default(0), createdAt: integer('created_at').notNull(),
});
export const aiGrants = sqliteTable('ai_grants', {
  id: text('id').primaryKey(), passId: text('pass_id').notNull().references(() => aiPasses.id), userId: text('user_id').notNull().references(() => profiles.userId),
  expiresAt: integer('expires_at').notNull(), tokenLimit: integer('token_limit').notNull(), requestLimit: integer('request_limit').notNull(), createdAt: integer('created_at').notNull(),
}, table => [uniqueIndex('ai_grant_once').on(table.passId, table.userId), index('ai_grants_user').on(table.userId, table.expiresAt)]);
export const aiUsage = sqliteTable('ai_usage', {
  id: text('id').primaryKey(), userId: text('user_id').notNull().references(() => profiles.userId), budgetScope: text('budget_scope').notNull(), quotaDay: text('quota_day').notNull(),
  sponsored: integer('sponsored').notNull(), chargedTokens: integer('charged_tokens').notNull(), inputTokens: integer('input_tokens').notNull(), outputTokens: integer('output_tokens').notNull(),
  state: text('state').notNull(), expiresAt: integer('expires_at').notNull(), createdAt: integer('created_at').notNull(),
}, table => [index('ai_usage_scope').on(table.budgetScope), index('ai_usage_global').on(table.sponsored, table.quotaDay), index('ai_usage_active').on(table.userId, table.state, table.expiresAt)]);
export const aiRedemptionAttempts = sqliteTable('ai_redemption_attempts', {
  id: text('id').primaryKey(), userId: text('user_id').notNull(), createdAt: integer('created_at').notNull(),
}, table => [index('ai_redemption_user').on(table.userId, table.createdAt)]);
