-- CreateTable
CREATE TABLE `user` (
    `user_id` VARCHAR(36) NOT NULL,
    `username` VARCHAR(255) NOT NULL,
    `password` VARCHAR(60) NOT NULL,
    `role` VARCHAR(50) NOT NULL,
    `logo_url` VARCHAR(2183) NULL,
    `display_name` VARCHAR(255) NULL,
    `two_factor_required` BOOLEAN NOT NULL DEFAULT false,
    `created_at` DATETIME(6) NULL DEFAULT CURRENT_TIMESTAMP(6),
    `updated_at` DATETIME(6) NULL,
    `deleted_at` DATETIME(6) NULL,

    UNIQUE INDEX `user_username_key`(`username`),
    PRIMARY KEY (`user_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_as_ci;

-- CreateTable
CREATE TABLE `api_key` (
    `api_key_id` VARCHAR(36) NOT NULL,
    `user_id` VARCHAR(36) NOT NULL,
    `name` VARCHAR(255) NOT NULL,
    `key_hash` VARCHAR(128) NOT NULL,
    `key_prefix` VARCHAR(20) NOT NULL,
    `last_used_at` DATETIME(6) NULL,
    `created_at` DATETIME(6) NULL DEFAULT CURRENT_TIMESTAMP(6),

    UNIQUE INDEX `api_key_key_hash_key`(`key_hash`),
    INDEX `api_key_user_id_idx`(`user_id`),
    PRIMARY KEY (`api_key_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_as_ci;

-- CreateTable
CREATE TABLE `session` (
    `session_id` VARCHAR(36) NOT NULL,
    `website_id` VARCHAR(36) NOT NULL,
    `browser` VARCHAR(20) NULL,
    `os` VARCHAR(20) NULL,
    `device` VARCHAR(20) NULL,
    `screen` VARCHAR(11) NULL,
    `language` VARCHAR(35) NULL,
    `country` CHAR(2) NULL,
    `region` VARCHAR(20) NULL,
    `city` VARCHAR(50) NULL,
    `distinct_id` VARCHAR(50) NULL,
    `created_at` DATETIME(6) NULL DEFAULT CURRENT_TIMESTAMP(6),

    INDEX `session_created_at_idx`(`created_at`),
    INDEX `session_website_id_idx`(`website_id`),
    INDEX `session_website_id_created_at_idx`(`website_id`, `created_at`),
    INDEX `session_website_id_created_at_browser_idx`(`website_id`, `created_at`, `browser`),
    INDEX `session_website_id_created_at_os_idx`(`website_id`, `created_at`, `os`),
    INDEX `session_website_id_created_at_device_idx`(`website_id`, `created_at`, `device`),
    INDEX `session_website_id_created_at_screen_idx`(`website_id`, `created_at`, `screen`),
    INDEX `session_website_id_created_at_language_idx`(`website_id`, `created_at`, `language`),
    INDEX `session_website_id_created_at_country_idx`(`website_id`, `created_at`, `country`),
    INDEX `session_website_id_created_at_region_idx`(`website_id`, `created_at`, `region`),
    INDEX `session_website_id_created_at_city_idx`(`website_id`, `created_at`, `city`),
    PRIMARY KEY (`session_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_as_cs;

-- CreateTable
CREATE TABLE `session_link` (
    `website_id` VARCHAR(36) NOT NULL,
    `session_id` VARCHAR(36) NOT NULL,
    `distinct_id` VARCHAR(50) NOT NULL,
    `created_at` DATETIME(6) NULL DEFAULT CURRENT_TIMESTAMP(6),

    INDEX `session_link_website_id_session_id_idx`(`website_id`, `session_id`),
    PRIMARY KEY (`website_id`, `distinct_id`, `session_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_as_cs;

-- CreateTable
CREATE TABLE `website` (
    `website_id` VARCHAR(36) NOT NULL,
    `name` VARCHAR(100) NOT NULL,
    `domain` VARCHAR(500) NULL,
    `reset_at` DATETIME(6) NULL,
    `user_id` VARCHAR(36) NULL,
    `team_id` VARCHAR(36) NULL,
    `created_by` VARCHAR(36) NULL,
    `created_at` DATETIME(6) NULL DEFAULT CURRENT_TIMESTAMP(6),
    `updated_at` DATETIME(6) NULL,
    `deleted_at` DATETIME(6) NULL,
    `recorder_enabled` BOOLEAN NOT NULL DEFAULT false,
    `replay_config` JSON NULL,

    INDEX `website_user_id_idx`(`user_id`),
    INDEX `website_team_id_idx`(`team_id`),
    INDEX `website_created_at_idx`(`created_at`),
    INDEX `website_created_by_idx`(`created_by`),
    PRIMARY KEY (`website_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_as_ci;

-- CreateTable
CREATE TABLE `website_event` (
    `event_id` VARCHAR(36) NOT NULL,
    `website_id` VARCHAR(36) NOT NULL,
    `session_id` VARCHAR(36) NOT NULL,
    `visit_id` VARCHAR(36) NOT NULL,
    `created_at` DATETIME(6) NULL DEFAULT CURRENT_TIMESTAMP(6),
    `url_path` VARCHAR(500) NOT NULL,
    `url_query` VARCHAR(500) NULL,
    `utm_source` VARCHAR(255) NULL,
    `utm_medium` VARCHAR(255) NULL,
    `utm_campaign` VARCHAR(255) NULL,
    `utm_content` VARCHAR(255) NULL,
    `utm_term` VARCHAR(255) NULL,
    `referrer_path` VARCHAR(500) NULL,
    `referrer_query` VARCHAR(500) NULL,
    `referrer_domain` VARCHAR(500) NULL,
    `page_title` VARCHAR(500) NULL,
    `gclid` VARCHAR(255) NULL,
    `fbclid` VARCHAR(255) NULL,
    `msclkid` VARCHAR(255) NULL,
    `ttclid` VARCHAR(255) NULL,
    `li_fat_id` VARCHAR(255) NULL,
    `twclid` VARCHAR(255) NULL,
    `event_type` INTEGER NOT NULL DEFAULT 1,
    `event_name` VARCHAR(50) NULL,
    `tag` VARCHAR(50) NULL,
    `hostname` VARCHAR(100) NULL,
    `lcp` DECIMAL(10, 1) NULL,
    `inp` DECIMAL(10, 1) NULL,
    `cls` DECIMAL(10, 4) NULL,
    `fcp` DECIMAL(10, 1) NULL,
    `ttfb` DECIMAL(10, 1) NULL,

    INDEX `website_event_created_at_idx`(`created_at`),
    INDEX `website_event_session_id_idx`(`session_id`),
    INDEX `website_event_visit_id_idx`(`visit_id`),
    INDEX `website_event_website_id_idx`(`website_id`),
    INDEX `website_event_website_id_created_at_idx`(`website_id`, `created_at`),
    INDEX `website_event_website_id_created_at_url_path_idx`(`website_id`, `created_at`, `url_path`),
    INDEX `website_event_website_id_created_at_url_query_idx`(`website_id`, `created_at`, `url_query`),
    INDEX `website_event_website_id_created_at_referrer_domain_idx`(`website_id`, `created_at`, `referrer_domain`),
    INDEX `website_event_website_id_created_at_page_title_idx`(`website_id`, `created_at`, `page_title`),
    INDEX `website_event_website_id_created_at_event_name_idx`(`website_id`, `created_at`, `event_name`),
    INDEX `website_event_website_id_created_at_tag_idx`(`website_id`, `created_at`, `tag`),
    INDEX `website_event_website_id_session_id_created_at_idx`(`website_id`, `session_id`, `created_at`),
    INDEX `website_event_website_id_visit_id_created_at_idx`(`website_id`, `visit_id`, `created_at`),
    INDEX `website_event_website_id_created_at_hostname_idx`(`website_id`, `created_at`, `hostname`),
    PRIMARY KEY (`event_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_as_cs;

-- CreateTable
CREATE TABLE `event_data` (
    `event_data_id` VARCHAR(36) NOT NULL,
    `website_id` VARCHAR(36) NOT NULL,
    `website_event_id` VARCHAR(36) NOT NULL,
    `data_key` VARCHAR(500) NOT NULL,
    `string_value` VARCHAR(500) NULL,
    `number_value` DECIMAL(19, 4) NULL,
    `date_value` DATETIME(6) NULL,
    `data_type` INTEGER NOT NULL,
    `created_at` DATETIME(6) NULL DEFAULT CURRENT_TIMESTAMP(6),

    INDEX `event_data_created_at_idx`(`created_at`),
    INDEX `event_data_website_id_idx`(`website_id`),
    INDEX `event_data_website_event_id_idx`(`website_event_id`),
    INDEX `event_data_website_id_created_at_idx`(`website_id`, `created_at`),
    INDEX `event_data_website_id_created_at_data_key_idx`(`website_id`, `created_at`, `data_key`),
    PRIMARY KEY (`event_data_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_as_cs;

-- CreateTable
CREATE TABLE `session_data` (
    `session_data_id` VARCHAR(36) NOT NULL,
    `website_id` VARCHAR(36) NOT NULL,
    `session_id` VARCHAR(36) NOT NULL,
    `data_key` VARCHAR(500) NOT NULL,
    `string_value` VARCHAR(500) NULL,
    `number_value` DECIMAL(19, 4) NULL,
    `date_value` DATETIME(6) NULL,
    `data_type` INTEGER NOT NULL,
    `distinct_id` VARCHAR(50) NULL,
    `created_at` DATETIME(6) NULL DEFAULT CURRENT_TIMESTAMP(6),

    INDEX `session_data_created_at_idx`(`created_at`),
    INDEX `session_data_website_id_idx`(`website_id`),
    INDEX `session_data_session_id_idx`(`session_id`),
    INDEX `session_data_session_id_created_at_idx`(`session_id`, `created_at`),
    INDEX `session_data_website_id_created_at_data_key_idx`(`website_id`, `created_at`, `data_key`),
    UNIQUE INDEX `session_data_session_id_data_key_key`(`session_id`, `data_key`),
    PRIMARY KEY (`session_data_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_as_cs;

-- CreateTable
CREATE TABLE `team` (
    `team_id` VARCHAR(36) NOT NULL,
    `name` VARCHAR(50) NOT NULL,
    `access_code` VARCHAR(50) NULL,
    `logo_url` VARCHAR(2183) NULL,
    `two_factor_required` BOOLEAN NOT NULL DEFAULT false,
    `created_at` DATETIME(6) NULL DEFAULT CURRENT_TIMESTAMP(6),
    `updated_at` DATETIME(6) NULL,
    `deleted_at` DATETIME(6) NULL,

    UNIQUE INDEX `team_access_code_key`(`access_code`),
    INDEX `team_access_code_idx`(`access_code`),
    PRIMARY KEY (`team_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_as_ci;

-- CreateTable
CREATE TABLE `team_user` (
    `team_user_id` VARCHAR(36) NOT NULL,
    `team_id` VARCHAR(36) NOT NULL,
    `user_id` VARCHAR(36) NOT NULL,
    `role` VARCHAR(50) NOT NULL,
    `created_at` DATETIME(6) NULL DEFAULT CURRENT_TIMESTAMP(6),
    `updated_at` DATETIME(6) NULL,

    INDEX `team_user_team_id_idx`(`team_id`),
    INDEX `team_user_user_id_idx`(`user_id`),
    PRIMARY KEY (`team_user_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_as_ci;

-- CreateTable
CREATE TABLE `report` (
    `report_id` VARCHAR(36) NOT NULL,
    `user_id` VARCHAR(36) NOT NULL,
    `website_id` VARCHAR(36) NOT NULL,
    `type` VARCHAR(50) NOT NULL,
    `name` VARCHAR(200) NOT NULL,
    `description` VARCHAR(500) NOT NULL,
    `parameters` JSON NOT NULL,
    `created_at` DATETIME(6) NULL DEFAULT CURRENT_TIMESTAMP(6),
    `updated_at` DATETIME(6) NULL,

    INDEX `report_user_id_idx`(`user_id`),
    INDEX `report_website_id_idx`(`website_id`),
    INDEX `report_type_idx`(`type`),
    INDEX `report_name_idx`(`name`),
    PRIMARY KEY (`report_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_as_ci;

-- CreateTable
CREATE TABLE `annotation` (
    `annotation_id` VARCHAR(36) NOT NULL,
    `website_id` VARCHAR(36) NOT NULL,
    `user_id` VARCHAR(36) NULL,
    `date` DATETIME(6) NOT NULL,
    `all_day` BOOLEAN NOT NULL DEFAULT true,
    `note` VARCHAR(500) NOT NULL,
    `created_at` DATETIME(6) NULL DEFAULT CURRENT_TIMESTAMP(6),
    `updated_at` DATETIME(6) NULL,

    INDEX `annotation_website_id_date_idx`(`website_id`, `date`),
    PRIMARY KEY (`annotation_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_as_ci;

-- CreateTable
CREATE TABLE `segment` (
    `segment_id` VARCHAR(36) NOT NULL,
    `website_id` VARCHAR(36) NOT NULL,
    `type` VARCHAR(50) NOT NULL,
    `name` VARCHAR(200) NOT NULL,
    `parameters` JSON NOT NULL,
    `created_at` DATETIME(6) NULL DEFAULT CURRENT_TIMESTAMP(6),
    `updated_at` DATETIME(6) NULL,

    INDEX `segment_website_id_idx`(`website_id`),
    PRIMARY KEY (`segment_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_as_ci;

-- CreateTable
CREATE TABLE `revenue` (
    `revenue_id` VARCHAR(36) NOT NULL,
    `website_id` VARCHAR(36) NOT NULL,
    `session_id` VARCHAR(36) NOT NULL,
    `event_id` VARCHAR(36) NOT NULL,
    `event_name` VARCHAR(50) NOT NULL,
    `currency` VARCHAR(10) NOT NULL,
    `revenue` DECIMAL(19, 4) NULL,
    `created_at` DATETIME(6) NULL DEFAULT CURRENT_TIMESTAMP(6),

    INDEX `revenue_website_id_idx`(`website_id`),
    INDEX `revenue_session_id_idx`(`session_id`),
    INDEX `revenue_website_id_created_at_idx`(`website_id`, `created_at`),
    INDEX `revenue_website_id_session_id_created_at_idx`(`website_id`, `session_id`, `created_at`),
    PRIMARY KEY (`revenue_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_as_cs;

-- CreateTable
CREATE TABLE `link` (
    `link_id` VARCHAR(36) NOT NULL,
    `name` VARCHAR(100) NOT NULL,
    `url` VARCHAR(500) NOT NULL,
    `slug` VARCHAR(100) NOT NULL,
    `user_id` VARCHAR(36) NULL,
    `team_id` VARCHAR(36) NULL,
    `created_at` DATETIME(6) NULL DEFAULT CURRENT_TIMESTAMP(6),
    `updated_at` DATETIME(6) NULL,
    `deleted_at` DATETIME(6) NULL,

    UNIQUE INDEX `link_slug_key`(`slug`),
    INDEX `link_slug_idx`(`slug`),
    INDEX `link_user_id_idx`(`user_id`),
    INDEX `link_team_id_idx`(`team_id`),
    INDEX `link_created_at_idx`(`created_at`),
    PRIMARY KEY (`link_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_as_ci;

-- CreateTable
CREATE TABLE `pixel` (
    `pixel_id` VARCHAR(36) NOT NULL,
    `name` VARCHAR(100) NOT NULL,
    `slug` VARCHAR(100) NOT NULL,
    `user_id` VARCHAR(36) NULL,
    `team_id` VARCHAR(36) NULL,
    `created_at` DATETIME(6) NULL DEFAULT CURRENT_TIMESTAMP(6),
    `updated_at` DATETIME(6) NULL,
    `deleted_at` DATETIME(6) NULL,

    UNIQUE INDEX `pixel_slug_key`(`slug`),
    INDEX `pixel_slug_idx`(`slug`),
    INDEX `pixel_user_id_idx`(`user_id`),
    INDEX `pixel_team_id_idx`(`team_id`),
    INDEX `pixel_created_at_idx`(`created_at`),
    PRIMARY KEY (`pixel_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_as_ci;

-- CreateTable
CREATE TABLE `board` (
    `board_id` VARCHAR(36) NOT NULL,
    `type` VARCHAR(50) NOT NULL,
    `name` VARCHAR(200) NOT NULL,
    `description` VARCHAR(500) NOT NULL,
    `parameters` JSON NOT NULL,
    `user_id` VARCHAR(36) NULL,
    `team_id` VARCHAR(36) NULL,
    `created_at` DATETIME(6) NULL DEFAULT CURRENT_TIMESTAMP(6),
    `updated_at` DATETIME(6) NULL,

    INDEX `board_user_id_idx`(`user_id`),
    INDEX `board_team_id_idx`(`team_id`),
    INDEX `board_created_at_idx`(`created_at`),
    PRIMARY KEY (`board_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_as_ci;

-- CreateTable
CREATE TABLE `share` (
    `share_id` VARCHAR(36) NOT NULL,
    `entity_id` VARCHAR(36) NOT NULL,
    `name` VARCHAR(200) NOT NULL,
    `share_type` INTEGER NOT NULL,
    `slug` VARCHAR(100) NOT NULL,
    `parameters` JSON NOT NULL,
    `created_at` DATETIME(6) NULL DEFAULT CURRENT_TIMESTAMP(6),
    `updated_at` DATETIME(6) NULL,

    UNIQUE INDEX `share_slug_key`(`slug`),
    INDEX `share_entity_id_idx`(`entity_id`),
    PRIMARY KEY (`share_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_as_ci;

-- CreateTable
CREATE TABLE `session_replay` (
    `replay_id` VARCHAR(36) NOT NULL,
    `website_id` VARCHAR(36) NOT NULL,
    `session_id` VARCHAR(36) NOT NULL,
    `visit_id` VARCHAR(36) NOT NULL,
    `chunk_index` INTEGER NOT NULL,
    `events` LONGBLOB NOT NULL,
    `event_count` INTEGER NOT NULL,
    `started_at` DATETIME(6) NOT NULL,
    `ended_at` DATETIME(6) NOT NULL,
    `created_at` DATETIME(6) NULL DEFAULT CURRENT_TIMESTAMP(6),

    INDEX `session_replay_website_id_idx`(`website_id`),
    INDEX `session_replay_session_id_idx`(`session_id`),
    INDEX `session_replay_visit_id_idx`(`visit_id`),
    INDEX `session_replay_website_id_session_id_idx`(`website_id`, `session_id`),
    INDEX `session_replay_website_id_visit_id_idx`(`website_id`, `visit_id`),
    INDEX `session_replay_website_id_created_at_idx`(`website_id`, `created_at`),
    INDEX `session_replay_session_id_chunk_index_idx`(`session_id`, `chunk_index`),
    PRIMARY KEY (`replay_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_as_cs;

-- CreateTable
CREATE TABLE `session_replay_saved` (
    `saved_replay_id` VARCHAR(36) NOT NULL,
    `name` VARCHAR(100) NOT NULL,
    `website_id` VARCHAR(36) NOT NULL,
    `visit_id` VARCHAR(36) NOT NULL,
    `created_at` DATETIME(6) NULL DEFAULT CURRENT_TIMESTAMP(6),
    `updated_at` DATETIME(6) NULL,

    INDEX `session_replay_saved_website_id_idx`(`website_id`),
    INDEX `session_replay_saved_visit_id_idx`(`visit_id`),
    INDEX `session_replay_saved_website_id_created_at_idx`(`website_id`, `created_at`),
    UNIQUE INDEX `session_replay_saved_website_id_visit_id_key`(`website_id`, `visit_id`),
    PRIMARY KEY (`saved_replay_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_as_ci;

-- CreateTable
CREATE TABLE `heatmap_event` (
    `heatmap_event_id` VARCHAR(36) NOT NULL,
    `website_id` VARCHAR(36) NOT NULL,
    `session_id` VARCHAR(36) NOT NULL,
    `visit_id` VARCHAR(36) NOT NULL,
    `url_path` VARCHAR(500) NOT NULL,
    `event_type` INTEGER NOT NULL,
    `x` INTEGER NULL,
    `y` INTEGER NULL,
    `page_x` INTEGER NULL,
    `page_y` INTEGER NULL,
    `page_w` INTEGER NULL,
    `viewport_w` INTEGER NULL,
    `viewport_h` INTEGER NULL,
    `page_h` INTEGER NULL,
    `scroll_pct` INTEGER NULL,
    `created_at` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),

    INDEX `heatmap_event_website_id_idx`(`website_id`),
    INDEX `heatmap_event_visit_id_idx`(`visit_id`),
    INDEX `heatmap_event_website_id_created_at_idx`(`website_id`, `created_at`),
    INDEX `heatmap_event_website_id_url_path_event_type_created_at_idx`(`website_id`, `url_path`, `event_type`, `created_at`),
    PRIMARY KEY (`heatmap_event_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_as_cs;

-- CreateTable
CREATE TABLE `two_factor_auth` (
    `id` VARCHAR(191) NOT NULL,
    `user_id` VARCHAR(36) NOT NULL,
    `secret` TEXT NOT NULL,
    `is_enabled` BOOLEAN NOT NULL DEFAULT false,
    `created_at` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    `updated_at` DATETIME(6) NOT NULL,

    UNIQUE INDEX `two_factor_auth_user_id_key`(`user_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_as_ci;

-- CreateTable
CREATE TABLE `two_factor_backup_code` (
    `id` VARCHAR(191) NOT NULL,
    `user_id` VARCHAR(36) NOT NULL,
    `code_hash` TEXT NOT NULL,
    `used` BOOLEAN NOT NULL DEFAULT false,
    `created_at` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),

    INDEX `two_factor_backup_code_user_id_idx`(`user_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_as_ci;

-- CreateTable
CREATE TABLE `two_factor_otp_used` (
    `id` VARCHAR(191) NOT NULL,
    `user_id` VARCHAR(36) NOT NULL,
    `otp` VARCHAR(191) NOT NULL,
    `expires_at` DATETIME(6) NOT NULL,

    UNIQUE INDEX `two_factor_otp_used_user_id_otp_key`(`user_id`, `otp`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_as_ci;

-- CreateTable
CREATE TABLE `two_factor_rate_limit` (
    `id` VARCHAR(191) NOT NULL,
    `user_id` VARCHAR(36) NOT NULL,
    `attempts` INTEGER NOT NULL DEFAULT 0,
    `locked_until` DATETIME(6) NULL,
    `updated_at` DATETIME(6) NOT NULL,

    UNIQUE INDEX `two_factor_rate_limit_user_id_key`(`user_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_as_ci;

-- CreateTable
CREATE TABLE `app_setting` (
    `key` VARCHAR(191) NOT NULL,
    `value` TEXT NOT NULL,

    PRIMARY KEY (`key`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_as_ci;


-- AddSystemUser
INSERT INTO `user` (user_id, username, role, password) VALUES ('41e2b680-648e-4b09-bcd7-3e2b10c06264', 'admin', 'admin', '$2b$10$BUli0c.muyCW1ErNJc3jL.vFRFtFJWrT8/GcR4A.sUdCznaXiqFXa');
