import { integer, primaryKey, sqliteTable, text, index } from "drizzle-orm/sqlite-core";

// IDs come from the verified Sites sign-in gateway, never request bodies.
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
