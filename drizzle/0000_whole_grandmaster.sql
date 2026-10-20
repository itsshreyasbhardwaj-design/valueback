CREATE TABLE `access_grants` (
	`id` text PRIMARY KEY NOT NULL,
	`household_id` text NOT NULL,
	`resource_type` text NOT NULL,
	`resource_id` text NOT NULL,
	`owner_user_id` text NOT NULL,
	`permission` text DEFAULT 'view' NOT NULL,
	`granted_by_user_id` text NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	`revoked_at` text,
	FOREIGN KEY (`household_id`) REFERENCES `households`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`owner_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`granted_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `access_grants_uq` ON `access_grants` (`household_id`,`resource_type`,`resource_id`);--> statement-breakpoint
CREATE INDEX `access_grants_lookup_idx` ON `access_grants` (`resource_type`,`resource_id`,`revoked_at`);--> statement-breakpoint
CREATE TABLE `audit_log` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text,
	`action` text NOT NULL,
	`entity_type` text DEFAULT '' NOT NULL,
	`entity_id` text DEFAULT '' NOT NULL,
	`meta` text DEFAULT '{}' NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `audit_user_idx` ON `audit_log` (`user_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `balance_events` (
	`id` text PRIMARY KEY NOT NULL,
	`benefit_id` text NOT NULL,
	`actor_user_id` text NOT NULL,
	`type` text NOT NULL,
	`delta_minor` integer,
	`delta_units` integer,
	`resulting_value_minor` integer,
	`resulting_units` integer,
	`reason` text DEFAULT '' NOT NULL,
	`document_id` text,
	`occurred_at` text NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	FOREIGN KEY (`benefit_id`) REFERENCES `benefits`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`actor_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `balance_events_benefit_idx` ON `balance_events` (`benefit_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `benefits` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`title` text NOT NULL,
	`category` text NOT NULL,
	`merchant` text DEFAULT '' NOT NULL,
	`currency` text DEFAULT 'INR' NOT NULL,
	`original_value_minor` integer,
	`current_value_minor` integer,
	`unit_label` text,
	`original_units` integer,
	`current_units` integer,
	`status` text DEFAULT 'unverified' NOT NULL,
	`evidence` text DEFAULT 'user_entered' NOT NULL,
	`issued_at` text,
	`received_at` text,
	`expires_at` text,
	`verified_at` text,
	`conditions` text DEFAULT '' NOT NULL,
	`notes` text DEFAULT '' NOT NULL,
	`tags` text DEFAULT '[]' NOT NULL,
	`code_cipher` text,
	`code_hint` text,
	`recurrence` text DEFAULT 'none' NOT NULL,
	`recurrence_units` integer,
	`recurrence_anchor` text,
	`recurrence_last_applied_period` text,
	`archived_at` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `benefits_user_idx` ON `benefits` (`user_id`,`status`);--> statement-breakpoint
CREATE INDEX `benefits_expiry_idx` ON `benefits` (`user_id`,`expires_at`);--> statement-breakpoint
CREATE INDEX `benefits_merchant_idx` ON `benefits` (`user_id`,`merchant`);--> statement-breakpoint
CREATE INDEX `benefits_updated_idx` ON `benefits` (`user_id`,`updated_at`);--> statement-breakpoint
CREATE TABLE `claim_actions` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`refund_case_id` text,
	`benefit_id` text,
	`kind` text NOT NULL,
	`summary` text DEFAULT '' NOT NULL,
	`assignee_user_id` text,
	`due_at` text,
	`completed_at` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`refund_case_id`) REFERENCES `refund_cases`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`benefit_id`) REFERENCES `benefits`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`assignee_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `claim_actions_case_idx` ON `claim_actions` (`refund_case_id`);--> statement-breakpoint
CREATE INDEX `claim_actions_assignee_idx` ON `claim_actions` (`assignee_user_id`,`completed_at`);--> statement-breakpoint
CREATE TABLE `documents` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`benefit_id` text,
	`refund_case_id` text,
	`filename` text NOT NULL,
	`mime` text NOT NULL,
	`size_bytes` integer NOT NULL,
	`sha256` text NOT NULL,
	`storage_path` text NOT NULL,
	`extraction_status` text DEFAULT 'pending' NOT NULL,
	`extraction_engine` text DEFAULT 'none' NOT NULL,
	`extracted_text` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`benefit_id`) REFERENCES `benefits`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `documents_user_idx` ON `documents` (`user_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `documents_hash_idx` ON `documents` (`user_id`,`sha256`);--> statement-breakpoint
CREATE INDEX `documents_benefit_idx` ON `documents` (`benefit_id`);--> statement-breakpoint
CREATE TABLE `entitlements` (
	`user_id` text PRIMARY KEY NOT NULL,
	`plan` text DEFAULT 'free' NOT NULL,
	`source` text DEFAULT 'default' NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `extractions` (
	`id` text PRIMARY KEY NOT NULL,
	`document_id` text NOT NULL,
	`classification` text,
	`classification_score` integer DEFAULT 0 NOT NULL,
	`proposed_json` text DEFAULT '{}' NOT NULL,
	`accepted_json` text,
	`reviewed_at` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	FOREIGN KEY (`document_id`) REFERENCES `documents`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `extractions_document_idx` ON `extractions` (`document_id`);--> statement-breakpoint
CREATE TABLE `household_invites` (
	`id` text PRIMARY KEY NOT NULL,
	`household_id` text NOT NULL,
	`token_hash` text NOT NULL,
	`role` text DEFAULT 'member' NOT NULL,
	`created_by_user_id` text NOT NULL,
	`expires_at` text NOT NULL,
	`accepted_by_user_id` text,
	`accepted_at` text,
	`revoked_at` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	FOREIGN KEY (`household_id`) REFERENCES `households`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`created_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`accepted_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `household_invites_token_uq` ON `household_invites` (`token_hash`);--> statement-breakpoint
CREATE INDEX `household_invites_household_idx` ON `household_invites` (`household_id`);--> statement-breakpoint
CREATE TABLE `household_members` (
	`id` text PRIMARY KEY NOT NULL,
	`household_id` text NOT NULL,
	`user_id` text NOT NULL,
	`role` text DEFAULT 'member' NOT NULL,
	`joined_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	FOREIGN KEY (`household_id`) REFERENCES `households`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `household_members_uq` ON `household_members` (`household_id`,`user_id`);--> statement-breakpoint
CREATE INDEX `household_members_user_idx` ON `household_members` (`user_id`);--> statement-breakpoint
CREATE TABLE `households` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`owner_user_id` text NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	FOREIGN KEY (`owner_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `notifications` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`reminder_id` text,
	`benefit_id` text,
	`refund_case_id` text,
	`title` text NOT NULL,
	`body` text DEFAULT '' NOT NULL,
	`severity` text DEFAULT 'info' NOT NULL,
	`dedupe_key` text NOT NULL,
	`read_at` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`reminder_id`) REFERENCES `reminders`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`benefit_id`) REFERENCES `benefits`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`refund_case_id`) REFERENCES `refund_cases`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `notifications_dedupe_uq` ON `notifications` (`user_id`,`dedupe_key`);--> statement-breakpoint
CREATE INDEX `notifications_unread_idx` ON `notifications` (`user_id`,`read_at`);--> statement-breakpoint
CREATE TABLE `recovery_codes` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`code_hash` text NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	`used_at` text,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `recovery_codes_user_idx` ON `recovery_codes` (`user_id`);--> statement-breakpoint
CREATE TABLE `recovery_events` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`kind` text NOT NULL,
	`benefit_id` text,
	`refund_case_id` text,
	`currency` text DEFAULT 'INR' NOT NULL,
	`amount_minor` integer,
	`units` integer,
	`note` text DEFAULT '' NOT NULL,
	`occurred_at` text NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`benefit_id`) REFERENCES `benefits`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`refund_case_id`) REFERENCES `refund_cases`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `recovery_events_user_idx` ON `recovery_events` (`user_id`,`occurred_at`);--> statement-breakpoint
CREATE INDEX `recovery_events_kind_idx` ON `recovery_events` (`user_id`,`kind`);--> statement-breakpoint
CREATE TABLE `refund_cases` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`merchant` text NOT NULL,
	`order_ref` text DEFAULT '' NOT NULL,
	`reference_number` text DEFAULT '' NOT NULL,
	`currency` text DEFAULT 'INR' NOT NULL,
	`amount_minor` integer NOT NULL,
	`received_amount_minor` integer DEFAULT 0 NOT NULL,
	`purchase_date` text,
	`initiated_at` text,
	`expected_by_date` text,
	`method` text DEFAULT '' NOT NULL,
	`status` text DEFAULT 'requested' NOT NULL,
	`notes` text DEFAULT '' NOT NULL,
	`confirmed_at` text,
	`closed_reason` text DEFAULT '' NOT NULL,
	`archived_at` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `refund_cases_user_idx` ON `refund_cases` (`user_id`,`status`);--> statement-breakpoint
CREATE INDEX `refund_cases_expected_idx` ON `refund_cases` (`user_id`,`expected_by_date`);--> statement-breakpoint
CREATE TABLE `refund_events` (
	`id` text PRIMARY KEY NOT NULL,
	`refund_case_id` text NOT NULL,
	`actor_user_id` text NOT NULL,
	`from_status` text,
	`to_status` text NOT NULL,
	`amount_minor` integer,
	`note` text DEFAULT '' NOT NULL,
	`document_id` text,
	`occurred_at` text NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	FOREIGN KEY (`refund_case_id`) REFERENCES `refund_cases`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`actor_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `refund_events_case_idx` ON `refund_events` (`refund_case_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `reminders` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`benefit_id` text,
	`refund_case_id` text,
	`kind` text NOT NULL,
	`label` text DEFAULT '' NOT NULL,
	`due_at` text NOT NULL,
	`offset_days` integer,
	`status` text DEFAULT 'scheduled' NOT NULL,
	`snoozed_until` text,
	`last_fired_at` text,
	`dedupe_key` text NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`benefit_id`) REFERENCES `benefits`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`refund_case_id`) REFERENCES `refund_cases`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `reminders_dedupe_uq` ON `reminders` (`user_id`,`dedupe_key`);--> statement-breakpoint
CREATE INDEX `reminders_due_idx` ON `reminders` (`user_id`,`status`,`due_at`);--> statement-breakpoint
CREATE TABLE `sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	`expires_at` text NOT NULL,
	`last_seen_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	`user_agent` text DEFAULT '' NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `sessions_user_idx` ON `sessions` (`user_id`);--> statement-breakpoint
CREATE INDEX `sessions_expiry_idx` ON `sessions` (`expires_at`);--> statement-breakpoint
CREATE TABLE `user_settings` (
	`user_id` text PRIMARY KEY NOT NULL,
	`currency` text DEFAULT 'INR' NOT NULL,
	`date_format` text DEFAULT 'dd/MM/yyyy' NOT NULL,
	`time_zone` text DEFAULT 'Asia/Kolkata' NOT NULL,
	`theme` text DEFAULT 'system' NOT NULL,
	`reminder_offsets` text DEFAULT '[30,14,7,3,1]' NOT NULL,
	`refund_check_in_days` integer DEFAULT 7 NOT NULL,
	`notify_in_app` integer DEFAULT true NOT NULL,
	`notify_browser` integer DEFAULT false NOT NULL,
	`search_document_text` integer DEFAULT true NOT NULL,
	`onboarding_step` integer DEFAULT 0 NOT NULL,
	`onboarding_completed_at` text,
	`onboarding_interests` text DEFAULT '[]' NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `users` (
	`id` text PRIMARY KEY NOT NULL,
	`email` text NOT NULL,
	`password_hash` text NOT NULL,
	`name` text DEFAULT '' NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	`deletion_requested_at` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `users_email_uq` ON `users` (`email`);