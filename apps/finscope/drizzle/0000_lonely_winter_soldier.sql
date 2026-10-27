CREATE TABLE `activity` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`action` text NOT NULL,
	`symbols` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `profiles`(`user_id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `activity_user_created` ON `activity` (`user_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `favorites` (
	`user_id` text NOT NULL,
	`symbol` text NOT NULL,
	`created_at` text NOT NULL,
	PRIMARY KEY(`user_id`, `symbol`),
	FOREIGN KEY (`user_id`) REFERENCES `profiles`(`user_id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `memos` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`title` text NOT NULL,
	`symbol` text,
	`thesis` text NOT NULL,
	`catalysts` text NOT NULL,
	`valuation` text NOT NULL,
	`risks` text NOT NULL,
	`disconfirming` text NOT NULL,
	`evidence` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `profiles`(`user_id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `memos_user_updated` ON `memos` (`user_id`,`updated_at`);--> statement-breakpoint
CREATE TABLE `profiles` (
	`user_id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`email` text NOT NULL,
	`preferences` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `report_jobs` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`units` integer NOT NULL,
	`cost` integer NOT NULL,
	`kind` text NOT NULL,
	`quota_day` text NOT NULL,
	`state` text NOT NULL,
	`expires_at` integer NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `profiles`(`user_id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `jobs_user_quota` ON `report_jobs` (`user_id`,`quota_day`);--> statement-breakpoint
CREATE INDEX `jobs_user_state` ON `report_jobs` (`user_id`,`state`,`expires_at`);--> statement-breakpoint
CREATE TABLE `reports` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`symbol` text NOT NULL,
	`mode` text NOT NULL,
	`payload` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `profiles`(`user_id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `reports_user_created` ON `reports` (`user_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `schedule_runs` (
	`user_id` text NOT NULL,
	`local_date` text NOT NULL,
	`state` text NOT NULL,
	`created_at` text NOT NULL,
	`finished_at` text,
	PRIMARY KEY(`user_id`, `local_date`),
	FOREIGN KEY (`user_id`) REFERENCES `profiles`(`user_id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `schedules` (
	`user_id` text PRIMARY KEY NOT NULL,
	`symbols` text NOT NULL,
	`time` text NOT NULL,
	`timezone` text NOT NULL,
	`enabled` integer DEFAULT 0 NOT NULL,
	`last_run` text,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `profiles`(`user_id`) ON UPDATE no action ON DELETE no action
);
