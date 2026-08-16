CREATE TABLE `game_rooms` (
	`id` int AUTO_INCREMENT NOT NULL,
	`joinCode` varchar(8) NOT NULL,
	`name` varchar(64) NOT NULL,
	`system` enum('psp','nes','sega','ps1') NOT NULL,
	`hostTokenHash` varchar(64) NOT NULL,
	`maxPlayers` int NOT NULL,
	`status` enum('waiting','active','closed') NOT NULL DEFAULT 'waiting',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `game_rooms_id` PRIMARY KEY(`id`),
	CONSTRAINT `game_rooms_join_code_unique` UNIQUE(`joinCode`)
);
--> statement-breakpoint
CREATE TABLE `room_members` (
	`id` int AUTO_INCREMENT NOT NULL,
	`roomId` int NOT NULL,
	`displayName` varchar(32) NOT NULL,
	`role` enum('host','player') NOT NULL DEFAULT 'player',
	`accessTokenHash` varchar(64) NOT NULL,
	`isReady` boolean NOT NULL DEFAULT false,
	`gameFingerprint` varchar(128),
	`coreVersion` varchar(64),
	`joinedAt` timestamp NOT NULL DEFAULT (now()),
	`lastSeenAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `room_members_id` PRIMARY KEY(`id`),
	CONSTRAINT `room_members_access_token_unique` UNIQUE(`accessTokenHash`)
);
--> statement-breakpoint
CREATE INDEX `game_rooms_status_idx` ON `game_rooms` (`status`);--> statement-breakpoint
CREATE INDEX `room_members_room_idx` ON `room_members` (`roomId`);