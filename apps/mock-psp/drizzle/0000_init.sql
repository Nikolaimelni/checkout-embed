CREATE TABLE `idempotency_keys` (
	`merchant_key` text NOT NULL,
	`key` text NOT NULL,
	`request_hash` text NOT NULL,
	`intent_id` text NOT NULL,
	`created_at` integer NOT NULL,
	PRIMARY KEY(`merchant_key`, `key`)
);
--> statement-breakpoint
CREATE TABLE `payment_intents` (
	`id` text PRIMARY KEY NOT NULL,
	`merchant_key` text NOT NULL,
	`amount_minor` integer NOT NULL,
	`currency` text NOT NULL,
	`method_id` text,
	`status` text NOT NULL,
	`action_url` text,
	`settle_at` integer,
	`outcome` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `webhook_deliveries` (
	`id` text PRIMARY KEY NOT NULL,
	`intent_id` text NOT NULL,
	`event` text NOT NULL,
	`payload` text NOT NULL,
	`attempts` integer DEFAULT 0 NOT NULL,
	`next_attempt_at` integer NOT NULL,
	`delivered_at` integer,
	`last_error` text,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `webhook_deliveries_next_attempt_at` ON `webhook_deliveries` (`next_attempt_at`);