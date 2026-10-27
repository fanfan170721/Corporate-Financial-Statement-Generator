CREATE TABLE `ai_config` (
	`id` text PRIMARY KEY NOT NULL,
	`payload` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `ai_credentials` (
	`scope` text PRIMARY KEY NOT NULL,
	`ciphertext` text NOT NULL,
	`suffix` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `ai_grants` (
	`id` text PRIMARY KEY NOT NULL,
	`pass_id` text NOT NULL,
	`user_id` text NOT NULL,
	`expires_at` integer NOT NULL,
	`token_limit` integer NOT NULL,
	`request_limit` integer NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`pass_id`) REFERENCES `ai_passes`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`user_id`) REFERENCES `profiles`(`user_id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `ai_grant_once` ON `ai_grants` (`pass_id`,`user_id`);--> statement-breakpoint
CREATE INDEX `ai_grants_user` ON `ai_grants` (`user_id`,`expires_at`);--> statement-breakpoint
CREATE TABLE `ai_passes` (
	`id` text PRIMARY KEY NOT NULL,
	`code_hash` text NOT NULL,
	`label` text NOT NULL,
	`max_claims` integer NOT NULL,
	`claims` integer DEFAULT 0 NOT NULL,
	`token_limit` integer NOT NULL,
	`request_limit` integer NOT NULL,
	`redeem_before` integer NOT NULL,
	`revoked` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `ai_passes_code_hash_unique` ON `ai_passes` (`code_hash`);--> statement-breakpoint
CREATE TABLE `ai_redemption_attempts` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `ai_redemption_user` ON `ai_redemption_attempts` (`user_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `ai_usage` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`budget_scope` text NOT NULL,
	`quota_day` text NOT NULL,
	`sponsored` integer NOT NULL,
	`charged_tokens` integer NOT NULL,
	`input_tokens` integer NOT NULL,
	`output_tokens` integer NOT NULL,
	`state` text NOT NULL,
	`expires_at` integer NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `profiles`(`user_id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `ai_usage_scope` ON `ai_usage` (`budget_scope`);--> statement-breakpoint
CREATE INDEX `ai_usage_global` ON `ai_usage` (`sponsored`,`quota_day`);--> statement-breakpoint
CREATE INDEX `ai_usage_active` ON `ai_usage` (`user_id`,`state`,`expires_at`);
--> statement-breakpoint
CREATE TRIGGER ai_grant_claim AFTER INSERT ON ai_grants BEGIN UPDATE ai_passes SET claims=claims+1 WHERE id=NEW.pass_id; END;
