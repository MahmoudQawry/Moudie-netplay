ALTER TABLE `game_rooms` ADD COLUMN `visibility` enum('public','private') NOT NULL DEFAULT 'private';
--> statement-breakpoint
CREATE INDEX `game_rooms_visibility_status_idx` ON `game_rooms` (`visibility`,`status`);
