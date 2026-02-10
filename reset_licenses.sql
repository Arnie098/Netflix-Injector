-- Reset License Keys Script
-- This script deletes all existing license keys and creates 10 new ones

-- 1. Delete all existing license keys
DELETE FROM licenses;

-- 2. Reset the sequence (if using auto-increment)
ALTER SEQUENCE licenses_id_seq RESTART WITH 1;

-- 3. Insert 10 new license keys with the pattern ARNS-KEY-XXXX-XXXX
INSERT INTO licenses (license_key, is_active, expiration_date, hardware_id)
VALUES
  ('ARNS-KEY-2M9A-7Q4L', true, NOW() + INTERVAL '30 days', NULL),
  ('ARNS-KEY-8P3X-5N2K', true, NOW() + INTERVAL '30 days', NULL),
  ('ARNS-KEY-4R7W-9T6H', true, NOW() + INTERVAL '30 days', NULL),
  ('ARNS-KEY-1D5F-3C8V', true, NOW() + INTERVAL '30 days', NULL),
  ('ARNS-KEY-6B9L-2Y4M', true, NOW() + INTERVAL '30 days', NULL),
  ('ARNS-KEY-7G3Q-8J5P', true, NOW() + INTERVAL '30 days', NULL),
  ('ARNS-KEY-9K2S-4Z7X', true, NOW() + INTERVAL '30 days', NULL),
  ('ARNS-KEY-5H8N-1W3R', true, NOW() + INTERVAL '30 days', NULL),
  ('ARNS-KEY-3T6V-7A9E', true, NOW() + INTERVAL '30 days', NULL),
  ('ARNS-KEY-2F4U-6D8B', true, NOW() + INTERVAL '30 days', NULL);

-- 4. Verify the new keys
SELECT * FROM licenses ORDER BY created_at DESC;
