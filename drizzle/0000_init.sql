CREATE TABLE `Account` (
	`id` text PRIMARY KEY NOT NULL,
	`accountId` text NOT NULL,
	`providerId` text NOT NULL,
	`userId` text NOT NULL,
	`accessToken` text,
	`refreshToken` text,
	`idToken` text,
	`accessTokenExpiresAt` integer,
	`refreshTokenExpiresAt` integer,
	`scope` text,
	`password` text,
	`createdAt` integer NOT NULL,
	`updatedAt` integer NOT NULL,
	FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `Account_userId_idx` ON `Account` (`userId`);--> statement-breakpoint
CREATE UNIQUE INDEX `Account_provider_account_idx` ON `Account` (`providerId`,`accountId`);--> statement-breakpoint
CREATE TABLE `Investigation` (
	`id` text PRIMARY KEY NOT NULL,
	`userId` text NOT NULL,
	`question` text NOT NULL,
	`locale` text NOT NULL,
	`status` text NOT NULL,
	`plan` text,
	`excluded` text,
	`result` text,
	`explanation` text,
	`error` text,
	`createdAt` integer NOT NULL,
	`finishedAt` integer,
	FOREIGN KEY (`userId`) REFERENCES `Shop`(`userId`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `Investigation_user_created_idx` ON `Investigation` (`userId`,`createdAt`);--> statement-breakpoint
CREATE TABLE `Series` (
	`userId` text NOT NULL,
	`metric` text NOT NULL,
	`sourceId` text NOT NULL,
	`startDate` text NOT NULL,
	`values` text NOT NULL,
	`updatedAt` integer NOT NULL,
	PRIMARY KEY(`userId`, `metric`),
	FOREIGN KEY (`userId`) REFERENCES `Shop`(`userId`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `Session` (
	`id` text PRIMARY KEY NOT NULL,
	`expiresAt` integer NOT NULL,
	`token` text NOT NULL,
	`createdAt` integer NOT NULL,
	`updatedAt` integer NOT NULL,
	`ipAddress` text,
	`userAgent` text,
	`userId` text NOT NULL,
	FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `Session_token_unique` ON `Session` (`token`);--> statement-breakpoint
CREATE INDEX `Session_userId_idx` ON `Session` (`userId`);--> statement-breakpoint
CREATE TABLE `Shop` (
	`userId` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`city` text NOT NULL,
	`timezone` text NOT NULL,
	`dataStart` text NOT NULL,
	`syncedAt` integer,
	`createdAt` integer NOT NULL,
	FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `ShopSource` (
	`userId` text NOT NULL,
	`sourceId` text NOT NULL,
	`config` text NOT NULL,
	`createdAt` integer NOT NULL,
	PRIMARY KEY(`userId`, `sourceId`),
	FOREIGN KEY (`userId`) REFERENCES `Shop`(`userId`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `SourceUpload` (
	`userId` text NOT NULL,
	`sourceId` text NOT NULL,
	`upload` text NOT NULL,
	`createdAt` integer NOT NULL,
	PRIMARY KEY(`userId`, `sourceId`),
	FOREIGN KEY (`userId`) REFERENCES `Shop`(`userId`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `Usage` (
	`key` text PRIMARY KEY NOT NULL,
	`count` integer NOT NULL,
	`expiresAt` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `User` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`email` text NOT NULL,
	`emailVerified` integer DEFAULT false NOT NULL,
	`image` text,
	`createdAt` integer NOT NULL,
	`updatedAt` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `User_email_unique` ON `User` (`email`);--> statement-breakpoint
CREATE TABLE `Verification` (
	`id` text PRIMARY KEY NOT NULL,
	`identifier` text NOT NULL,
	`value` text NOT NULL,
	`expiresAt` integer NOT NULL,
	`createdAt` integer NOT NULL,
	`updatedAt` integer NOT NULL
);
