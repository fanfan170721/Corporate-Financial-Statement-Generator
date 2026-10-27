CREATE TABLE `guest_report_jobs` (
	`id` text PRIMARY KEY NOT NULL,
	`session_id` text NOT NULL,
	`ip_hash` text NOT NULL,
	`units` integer NOT NULL,
	`state` text NOT NULL,
	`expires_at` integer NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`session_id`) REFERENCES `guest_sessions`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `guest_jobs_session` ON `guest_report_jobs` (`session_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `guest_jobs_ip` ON `guest_report_jobs` (`ip_hash`,`created_at`);--> statement-breakpoint
CREATE INDEX `guest_jobs_created` ON `guest_report_jobs` (`created_at`);--> statement-breakpoint
CREATE TABLE `guest_reports` (
	`id` text PRIMARY KEY NOT NULL,
	`session_id` text NOT NULL,
	`symbol` text NOT NULL,
	`mode` text NOT NULL,
	`payload` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`session_id`) REFERENCES `guest_sessions`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `guest_reports_session_created` ON `guest_reports` (`session_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `guest_sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`token_hash` text NOT NULL,
	`ip_hash` text NOT NULL,
	`expires_at` integer NOT NULL,
	`revoked_at` integer,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `guest_sessions_token_hash_unique` ON `guest_sessions` (`token_hash`);--> statement-breakpoint
CREATE INDEX `guest_sessions_ip_created` ON `guest_sessions` (`ip_hash`,`created_at`);--> statement-breakpoint
CREATE INDEX `guest_sessions_expiry` ON `guest_sessions` (`expires_at`);