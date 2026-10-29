-- Q-Guide database schema
-- For local development with XAMPP's MariaDB/MySQL-compatible service.
-- This script creates the database and tables. It does not delete existing data.

CREATE DATABASE IF NOT EXISTS qguide_db
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

USE qguide_db;
SET NAMES utf8mb4;

-- Staff, administrators, and optional patient app accounts.
-- Store only a secure password hash; never store plaintext passwords.
CREATE TABLE IF NOT EXISTS users (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  full_name VARCHAR(150) NOT NULL,
  email VARCHAR(190) NULL,
  username VARCHAR(80) NULL,
  password_hash VARCHAR(255) NOT NULL,
  role ENUM('PATIENT', 'STAFF', 'ADMIN') NOT NULL,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  last_login_at DATETIME NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_users_email (email),
  UNIQUE KEY uq_users_username (username),
  KEY idx_users_role_active (role, is_active)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Patient demographic profile. Do not store diagnoses or medical records here.
CREATE TABLE IF NOT EXISTS patients (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id BIGINT UNSIGNED NULL,
  patient_code VARCHAR(40) NOT NULL,
  full_name VARCHAR(150) NOT NULL,
  date_of_birth DATE NULL,
  contact_number VARCHAR(30) NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_patients_user_id (user_id),
  UNIQUE KEY uq_patients_patient_code (patient_code),
  KEY idx_patients_name_dob (full_name, date_of_birth),
  CONSTRAINT fk_patients_user
    FOREIGN KEY (user_id) REFERENCES users (id)
    ON UPDATE CASCADE ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- OPD clinic directory and queue-token prefix configuration.
CREATE TABLE IF NOT EXISTS clinics (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  clinic_code VARCHAR(20) NOT NULL,
  clinic_name VARCHAR(150) NOT NULL,
  token_prefix VARCHAR(8) NOT NULL,
  description VARCHAR(500) NULL,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_clinics_code (clinic_code),
  UNIQUE KEY uq_clinics_token_prefix (token_prefix),
  KEY idx_clinics_active_name (is_active, clinic_name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Clinic location instructions. Room details must be verified by EVMC before real use.
CREATE TABLE IF NOT EXISTS clinic_rooms (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  clinic_id BIGINT UNSIGNED NOT NULL,
  building_name VARCHAR(100) NULL,
  floor_label VARCHAR(50) NOT NULL,
  room_number VARCHAR(30) NOT NULL,
  directions_text VARCHAR(500) NULL,
  is_primary TINYINT(1) NOT NULL DEFAULT 0,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_clinic_rooms_location (clinic_id, floor_label, room_number),
  KEY idx_clinic_rooms_active (clinic_id, is_active, is_primary),
  CONSTRAINT fk_clinic_rooms_clinic
    FOREIGN KEY (clinic_id) REFERENCES clinics (id)
    ON UPDATE CASCADE ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- One row for each patient check-in / OPD visit.
CREATE TABLE IF NOT EXISTS patient_visits (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  visit_code VARCHAR(40) NOT NULL,
  patient_id BIGINT UNSIGNED NOT NULL,
  clinic_id BIGINT UNSIGNED NOT NULL,
  clinic_room_id BIGINT UNSIGNED NULL,
  arrival_method ENUM('GEOFENCE_PROMPT', 'MANUAL', 'STAFF') NOT NULL DEFAULT 'MANUAL',
  checked_in_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  created_by_user_id BIGINT UNSIGNED NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_patient_visits_visit_code (visit_code),
  KEY idx_patient_visits_patient_time (patient_id, checked_in_at),
  KEY idx_patient_visits_clinic_time (clinic_id, checked_in_at),
  CONSTRAINT fk_patient_visits_patient
    FOREIGN KEY (patient_id) REFERENCES patients (id)
    ON UPDATE CASCADE ON DELETE RESTRICT,
  CONSTRAINT fk_patient_visits_clinic
    FOREIGN KEY (clinic_id) REFERENCES clinics (id)
    ON UPDATE CASCADE ON DELETE RESTRICT,
  CONSTRAINT fk_patient_visits_room
    FOREIGN KEY (clinic_room_id) REFERENCES clinic_rooms (id)
    ON UPDATE CASCADE ON DELETE SET NULL,
  CONSTRAINT fk_patient_visits_creator
    FOREIGN KEY (created_by_user_id) REFERENCES users (id)
    ON UPDATE CASCADE ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Daily counter per clinic. Backend logic will update this transactionally when issuing tickets.
CREATE TABLE IF NOT EXISTS queue_sequences (
  clinic_id BIGINT UNSIGNED NOT NULL,
  queue_date DATE NOT NULL,
  last_number INT UNSIGNED NOT NULL DEFAULT 0,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (clinic_id, queue_date),
  CONSTRAINT fk_queue_sequences_clinic
    FOREIGN KEY (clinic_id) REFERENCES clinics (id)
    ON UPDATE CASCADE ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- One queue ticket per visit; ticket numbers are unique within a clinic and date.
CREATE TABLE IF NOT EXISTS queue_tickets (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  visit_id BIGINT UNSIGNED NOT NULL,
  clinic_id BIGINT UNSIGNED NOT NULL,
  queue_date DATE NOT NULL,
  sequence_number INT UNSIGNED NOT NULL,
  token_number VARCHAR(30) NOT NULL,
  status ENUM('WAITING', 'CALLED', 'IN_SERVICE', 'COMPLETED', 'CANCELLED', 'NO_SHOW') NOT NULL DEFAULT 'WAITING',
  called_at DATETIME NULL,
  in_service_at DATETIME NULL,
  completed_at DATETIME NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_queue_ticket_visit (visit_id),
  UNIQUE KEY uq_queue_ticket_sequence (clinic_id, queue_date, sequence_number),
  UNIQUE KEY uq_queue_ticket_token (clinic_id, queue_date, token_number),
  KEY idx_queue_tickets_live (clinic_id, queue_date, status, sequence_number),
  CONSTRAINT fk_queue_tickets_visit
    FOREIGN KEY (visit_id) REFERENCES patient_visits (id)
    ON UPDATE CASCADE ON DELETE RESTRICT,
  CONSTRAINT fk_queue_tickets_clinic
    FOREIGN KEY (clinic_id) REFERENCES clinics (id)
    ON UPDATE CASCADE ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Records each queue-status change for traceability.
CREATE TABLE IF NOT EXISTS queue_status_history (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  queue_ticket_id BIGINT UNSIGNED NOT NULL,
  previous_status ENUM('WAITING', 'CALLED', 'IN_SERVICE', 'COMPLETED', 'CANCELLED', 'NO_SHOW') NULL,
  new_status ENUM('WAITING', 'CALLED', 'IN_SERVICE', 'COMPLETED', 'CANCELLED', 'NO_SHOW') NOT NULL,
  changed_by_user_id BIGINT UNSIGNED NULL,
  reason VARCHAR(255) NULL,
  changed_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_queue_history_ticket_time (queue_ticket_id, changed_at),
  KEY idx_queue_history_actor_time (changed_by_user_id, changed_at),
  CONSTRAINT fk_queue_history_ticket
    FOREIGN KEY (queue_ticket_id) REFERENCES queue_tickets (id)
    ON UPDATE CASCADE ON DELETE RESTRICT,
  CONSTRAINT fk_queue_history_user
    FOREIGN KEY (changed_by_user_id) REFERENCES users (id)
    ON UPDATE CASCADE ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Configure only after EVMC authorizes and verifies the geofence center and radius.
-- Coordinates are nullable and geofencing is disabled by default.
CREATE TABLE IF NOT EXISTS geofence_settings (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  name VARCHAR(100) NOT NULL,
  latitude DECIMAL(10,7) NULL,
  longitude DECIMAL(10,7) NULL,
  radius_meters INT UNSIGNED NOT NULL DEFAULT 150,
  is_enabled TINYINT(1) NOT NULL DEFAULT 0,
  created_by_user_id BIGINT UNSIGNED NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_geofence_settings_name (name),
  KEY idx_geofence_settings_enabled (is_enabled),
  CONSTRAINT fk_geofence_settings_user
    FOREIGN KEY (created_by_user_id) REFERENCES users (id)
    ON UPDATE CASCADE ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Audit metadata only. Do not write passwords, access tokens, or unnecessary patient details here.
CREATE TABLE IF NOT EXISTS audit_logs (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  actor_user_id BIGINT UNSIGNED NULL,
  action VARCHAR(100) NOT NULL,
  entity_type VARCHAR(80) NOT NULL,
  entity_id BIGINT UNSIGNED NULL,
  details_json JSON NULL,
  ip_address VARCHAR(45) NULL,
  user_agent VARCHAR(255) NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_audit_logs_actor_time (actor_user_id, created_at),
  KEY idx_audit_logs_entity (entity_type, entity_id),
  KEY idx_audit_logs_created (created_at),
  CONSTRAINT fk_audit_logs_user
    FOREIGN KEY (actor_user_id) REFERENCES users (id)
    ON UPDATE CASCADE ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- End of schema. Staff/admin accounts will be created later by the backend
-- with securely hashed passwords; do not insert plaintext passwords here.
