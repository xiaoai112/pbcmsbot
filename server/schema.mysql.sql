-- 版权所有：1330600100。二次开发与定制合作请联系 QQ。
CREATE DATABASE IF NOT EXISTS aigou_admin
  DEFAULT CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

USE aigou_admin;

CREATE TABLE IF NOT EXISTS users (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  username VARCHAR(80) NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  email VARCHAR(160) NOT NULL DEFAULT '',
  llm_api_url VARCHAR(600) NOT NULL DEFAULT '',
  llm_api_key TEXT NOT NULL,
  llm_model VARCHAR(160) NOT NULL DEFAULT 'gpt-4.1-mini',
  mail_notify_enabled TINYINT(1) NOT NULL DEFAULT 0,
  smtp_host VARCHAR(255) NOT NULL DEFAULT '',
  smtp_port INT UNSIGNED NOT NULL DEFAULT 465,
  smtp_secure TINYINT(1) NOT NULL DEFAULT 1,
  smtp_user VARCHAR(255) NOT NULL DEFAULT '',
  smtp_pass TEXT NOT NULL,
  smtp_from VARCHAR(255) NOT NULL DEFAULT '',
  role VARCHAR(30) NOT NULL DEFAULT 'member',
  status VARCHAR(30) NOT NULL DEFAULT 'active',
  membership_expires_at VARCHAR(60) NOT NULL DEFAULT '',
  last_login_at VARCHAR(60) NOT NULL DEFAULT '',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uniq_username (username)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS sites (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id INT UNSIGNED NOT NULL,
  name VARCHAR(120) NOT NULL,
  domain VARCHAR(255) NOT NULL,
  cms VARCHAR(80) NOT NULL DEFAULT 'PbootCMS v2.1',
  status VARCHAR(30) NOT NULL DEFAULT 'pending',
  last_sync VARCHAR(60) NOT NULL DEFAULT '',
  pboot_api_url VARCHAR(500) NOT NULL DEFAULT '',
  pboot_token VARCHAR(255) NOT NULL DEFAULT '',
  pboot_category_id VARCHAR(60) NOT NULL DEFAULT '',
  pboot_category_name VARCHAR(120) NOT NULL DEFAULT '',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uniq_user_domain (user_id, domain)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS articles (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id INT UNSIGNED NOT NULL,
  title VARCHAR(255) NOT NULL,
  tag VARCHAR(80) NOT NULL DEFAULT 'SEO软文',
  status VARCHAR(30) NOT NULL DEFAULT 'draft',
  site_id INT UNSIGNED NOT NULL,
  topic VARCHAR(255) NOT NULL DEFAULT '',
  content MEDIUMTEXT NOT NULL,
  publish_message TEXT NULL,
  created_at VARCHAR(60) NOT NULL,
  published_at VARCHAR(60) NULL,
  PRIMARY KEY (id),
  KEY idx_articles_user_id (user_id),
  KEY idx_articles_site_id (site_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS anchors (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id INT UNSIGNED NOT NULL,
  site_id INT UNSIGNED NOT NULL,
  keyword VARCHAR(120) NOT NULL,
  url VARCHAR(500) NOT NULL,
  enabled TINYINT(1) NOT NULL DEFAULT 1,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_anchors_user_id (user_id),
  KEY idx_anchors_site_id (site_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS logs (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id INT UNSIGNED NOT NULL,
  log_time VARCHAR(20) NOT NULL,
  title VARCHAR(255) NOT NULL,
  site VARCHAR(120) NOT NULL,
  result VARCHAR(30) NOT NULL DEFAULT 'success',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_logs_user_id (user_id),
  KEY idx_logs_created_at (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS schedules (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id INT UNSIGNED NOT NULL,
  name VARCHAR(120) NOT NULL,
  site_id INT UNSIGNED NOT NULL,
  tag VARCHAR(80) NOT NULL DEFAULT 'SEO软文',
  keywords_text MEDIUMTEXT NOT NULL,
  target_count INT UNSIGNED NOT NULL DEFAULT 1,
  generated_count INT UNSIGNED NOT NULL DEFAULT 0,
  next_keyword_index INT UNSIGNED NOT NULL DEFAULT 0,
  interval_minutes INT UNSIGNED NOT NULL DEFAULT 60,
  run_time VARCHAR(5) NOT NULL DEFAULT '09:00',
  auto_publish TINYINT(1) NOT NULL DEFAULT 1,
  active TINYINT(1) NOT NULL DEFAULT 0,
  status VARCHAR(30) NOT NULL DEFAULT 'paused',
  next_run_at VARCHAR(60) NOT NULL DEFAULT '',
  last_run_at VARCHAR(60) NOT NULL DEFAULT '',
  last_error TEXT NOT NULL,
  created_at VARCHAR(60) NOT NULL,
  updated_at VARCHAR(60) NOT NULL,
  PRIMARY KEY (id),
  KEY idx_schedules_user_id (user_id),
  KEY idx_schedules_active (active, next_run_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS forbidden_words (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id INT UNSIGNED NOT NULL,
  name VARCHAR(120) NOT NULL,
  words_text MEDIUMTEXT NOT NULL,
  enabled TINYINT(1) NOT NULL DEFAULT 1,
  created_at VARCHAR(60) NOT NULL,
  updated_at VARCHAR(60) NOT NULL,
  PRIMARY KEY (id),
  KEY idx_forbidden_words_user_id (user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS payment_orders (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id INT UNSIGNED NOT NULL,
  username VARCHAR(80) NOT NULL DEFAULT '',
  trade_no VARCHAR(120) NOT NULL DEFAULT '',
  out_trade_no VARCHAR(120) NOT NULL,
  plan_id VARCHAR(80) NOT NULL,
  plan_name VARCHAR(120) NOT NULL,
  days INT UNSIGNED NOT NULL DEFAULT 1,
  amount DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  pay_type VARCHAR(30) NOT NULL DEFAULT 'alipay',
  status VARCHAR(30) NOT NULL DEFAULT 'pending',
  pay_url TEXT NULL,
  raw_notify JSON NULL,
  created_at VARCHAR(60) NOT NULL,
  paid_at VARCHAR(60) NOT NULL DEFAULT '',
  PRIMARY KEY (id),
  UNIQUE KEY uniq_out_trade_no (out_trade_no),
  KEY idx_payment_user_id (user_id),
  KEY idx_payment_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 用户表不在这里写死初始化账号，首次启动时应用会根据 .env 中的 ADMIN_USER / ADMIN_PASSWORD 自动创建管理员。
