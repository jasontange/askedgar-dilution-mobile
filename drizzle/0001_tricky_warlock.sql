CREATE TABLE `api_response_cache` (
	`key` text PRIMARY KEY NOT NULL,
	`body` text,
	`fetched_at` integer DEFAULT 0 NOT NULL,
	`expires_at` integer DEFAULT 0 NOT NULL,
	`lease_token` text,
	`lease_until` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE INDEX `api_response_cache_expiry` ON `api_response_cache` (`expires_at`);