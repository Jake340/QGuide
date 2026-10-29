-- DEMONSTRATION DATA ONLY.
-- The proposal mentions FAMED / Family Medicine and gives 2nd Floor, Room 204 as an example.
-- This is not verified EVMC location data. Confirm all clinic names/rooms with EVMC before real use.

USE qguide_db;

INSERT INTO clinics (clinic_code, clinic_name, token_prefix, description, is_active)
SELECT
  'FAMED',
  'Family Medicine (DEMO ONLY)',
  'F',
  'Local demo record based on the proposal example. Verify the official clinic details before deployment.',
  1
WHERE NOT EXISTS (
  SELECT 1 FROM clinics WHERE clinic_code = 'FAMED'
);

INSERT INTO clinic_rooms (
  clinic_id, building_name, floor_label, room_number, directions_text, is_primary, is_active
)
SELECT
  c.id,
  'DEMO BUILDING - VERIFY',
  '2nd Floor',
  '204',
  'DEMO ONLY: the proposal example says 2nd Floor, Room 204. Verify with EVMC before any real use.',
  1,
  1
FROM clinics c
WHERE c.clinic_code = 'FAMED'
  AND NOT EXISTS (
    SELECT 1 FROM clinic_rooms r
    WHERE r.clinic_id = c.id
      AND r.floor_label = '2nd Floor'
      AND r.room_number = '204'
  );
