-- Zwartwerk database (MySQL 5.7+ / MariaDB 10.3+)
-- Wordt automatisch uitgevoerd door install.php.

CREATE TABLE IF NOT EXISTS users (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  email VARCHAR(190) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  first_name VARCHAR(100) NOT NULL,
  last_name VARCHAR(100) NOT NULL,
  phone VARCHAR(40) NOT NULL DEFAULT '',
  street VARCHAR(150) NOT NULL,
  house_number VARCHAR(20) NOT NULL,
  postcode VARCHAR(10) NOT NULL,
  city VARCHAR(100) NOT NULL,
  newsletter TINYINT(1) NOT NULL DEFAULT 0,
  referral_code VARCHAR(20) NOT NULL UNIQUE,
  referred_by INT UNSIGNED NULL,
  credit_cents INT NOT NULL DEFAULT 0,
  mollie_customer_id VARCHAR(40) NULL,
  admin_note TEXT NULL,
  reset_token_hash CHAR(64) NULL,
  reset_expires DATETIME NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS subscriptions (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id INT UNSIGNED NOT NULL,
  size VARCHAR(4) NOT NULL,             -- '250' of '500'
  freq VARCHAR(2) NOT NULL,             -- '1m' of '2m'
  roast VARCHAR(20) NOT NULL DEFAULT 'verras',
  note TEXT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'nieuw', -- nieuw, actief, gepauzeerd, opgezegd
  anchor DATE NOT NULL,                 -- startdatum; bepaalt de maandperiodes
  next_delivery DATE NOT NULL,
  paused_until DATE NULL,
  last_delivery DATE NULL,              -- bij opzeggen binnen 7 dagen: laatste levering
  skipped TEXT NULL,                    -- JSON-lijst met overgeslagen datums
  mandate_id VARCHAR(40) NULL,
  mandate_account VARCHAR(40) NULL,     -- gemaskeerd rekeningnummer, bijv. NL•• •••• 1234
  first_discount_pct TINYINT NOT NULL DEFAULT 25,
  cancel_reason VARCHAR(190) NULL,
  cancelled_at DATETIME NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY idx_user (user_id),
  KEY idx_status (status),
  CONSTRAINT fk_sub_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS batches (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  code VARCHAR(30) NOT NULL UNIQUE,     -- bijv. ZW-2610-01
  month CHAR(7) NOT NULL,               -- 'YYYY-MM' smaak van de maand
  country VARCHAR(80) NOT NULL,
  region VARCHAR(120) NOT NULL DEFAULT '',
  farm VARCHAR(150) NOT NULL DEFAULT '',
  process VARCHAR(60) NOT NULL DEFAULT '',
  notes VARCHAR(255) NOT NULL DEFAULT '',  -- komma-gescheiden smaaknotities
  roast TINYINT NOT NULL DEFAULT 3,        -- 1 (light) t/m 5 (dark)
  roast_date DATE NULL,
  story TEXT NULL,
  active TINYINT(1) NOT NULL DEFAULT 1,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_month (month)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS payments (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id INT UNSIGNED NOT NULL,
  subscription_id INT UNSIGNED NULL,
  mollie_id VARCHAR(40) NULL UNIQUE,
  kind VARCHAR(12) NOT NULL,            -- first, recurring, verify
  amount_cents INT NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'open', -- open, pending, paid, failed, canceled, expired, charged_back
  description VARCHAR(190) NOT NULL DEFAULT '',
  checkout_url VARCHAR(500) NULL,
  paid_at DATETIME NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY idx_user (user_id),
  KEY idx_status (status),
  CONSTRAINT fk_pay_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS deliveries (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  subscription_id INT UNSIGNED NOT NULL,
  user_id INT UNSIGNED NOT NULL,
  delivery_date DATE NOT NULL,
  flavour_month CHAR(7) NOT NULL,       -- 'YYYY-MM' van de maandperiode
  new_flavour TINYINT(1) NOT NULL DEFAULT 1,
  batch_id INT UNSIGNED NULL,
  size VARCHAR(4) NOT NULL,
  bags TINYINT NOT NULL,
  price_cents INT NOT NULL,
  discount_cents INT NOT NULL DEFAULT 0,
  payment_id INT UNSIGNED NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'wacht_op_betaling', -- wacht_op_betaling, betaald, betaling_mislukt, verzonden, geannuleerd
  sendcloud_parcels TEXT NULL,          -- JSON: [{id, tracking_number, tracking_url, status}]
  shipped_at DATETIME NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uniq_sub_date (subscription_id, delivery_date),
  KEY idx_date (delivery_date),
  CONSTRAINT fk_del_sub FOREIGN KEY (subscription_id) REFERENCES subscriptions(id) ON DELETE CASCADE,
  CONSTRAINT fk_del_batch FOREIGN KEY (batch_id) REFERENCES batches(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS ratings (
  user_id INT UNSIGNED NOT NULL,
  batch_id INT UNSIGNED NOT NULL,
  rating TINYINT NOT NULL,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (user_id, batch_id),
  CONSTRAINT fk_rat_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_rat_batch FOREIGN KEY (batch_id) REFERENCES batches(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS admins (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  email VARCHAR(190) NOT NULL UNIQUE,
  name VARCHAR(100) NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  last_login DATETIME NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS login_attempts (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  ip VARCHAR(45) NOT NULL,
  kind VARCHAR(10) NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_ip (ip, kind, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS newsletter (
  email VARCHAR(190) NOT NULL PRIMARY KEY,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS mail_log (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  recipient VARCHAR(190) NOT NULL,
  subject VARCHAR(190) NOT NULL,
  body MEDIUMTEXT NOT NULL,
  sent TINYINT(1) NOT NULL DEFAULT 0,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS app_log (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  level VARCHAR(10) NOT NULL,
  message VARCHAR(500) NOT NULL,
  context TEXT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS settings (
  name VARCHAR(60) NOT NULL PRIMARY KEY,
  value TEXT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
