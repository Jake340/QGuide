-- OPTIONAL FICTIONAL TEST DATA ONLY. Do not use real patient data.
-- Run schema.sql and seed_clinics.sql first.

USE qguide_db;

INSERT INTO patients (patient_code, full_name, date_of_birth, contact_number)
SELECT
  'DEMO-0001',
  'Sample Patient (FICTIONAL)',
  '1990-01-01',
  '0000000000'
WHERE NOT EXISTS (
  SELECT 1 FROM patients WHERE patient_code = 'DEMO-0001'
);
