CREATE TABLE `lift_request_budgets` (
	`scope` text PRIMARY KEY NOT NULL,
	`window` integer NOT NULL,
	`count` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `lift_journeys` (
	`scope` text PRIMARY KEY NOT NULL,
	`revision` integer NOT NULL,
	`journeys` text NOT NULL,
	`touched_at` integer NOT NULL
);
