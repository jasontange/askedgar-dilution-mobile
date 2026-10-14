CREATE TABLE `watchlists` (
	`user_id` text PRIMARY KEY NOT NULL,
	`tickers` text DEFAULT '[]' NOT NULL,
	`revision` integer DEFAULT 0 NOT NULL,
	`updated_at` text DEFAULT '' NOT NULL
);
