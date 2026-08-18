ALTER TABLE `game_rooms` MODIFY COLUMN `system` enum('psp','nes','sega','ps1','arcade') NOT NULL;
--> statement-breakpoint
ALTER TABLE `room_members` MODIFY COLUMN `role` enum('host','player','spectator') NOT NULL DEFAULT 'player';
