-- =====================================================================
-- Admin Performance Functions
-- Run this in Supabase SQL Editor to enable fast distinct-domain lookups
-- and single-query stats for the admin dashboard.
-- =====================================================================

-- 1. Fast distinct domains (avoids full table scan in Python loop)
CREATE OR REPLACE FUNCTION get_distinct_domains()
RETURNS TABLE(domain TEXT)
LANGUAGE sql
STABLE
AS $$
  SELECT DISTINCT domain
  FROM audit_captures
  WHERE domain IS NOT NULL AND domain <> ''
  ORDER BY domain;
$$;

-- 2. Single-call stats (returns all 3 counts at once, very fast)
CREATE OR REPLACE FUNCTION get_admin_stats()
RETURNS JSON
LANGUAGE sql
STABLE
AS $$
  SELECT json_build_object(
    'total_captures',    (SELECT COUNT(*) FROM audit_captures),
    'total_credentials', (SELECT COUNT(*) FROM extracted_credentials),
    'total_accounts',    (
      SELECT COUNT(DISTINCT LOWER(domain) || '|' || LOWER(COALESCE(
        (SELECT field_value FROM extracted_credentials ec2
          WHERE ec2.audit_capture_id = ec.audit_capture_id
            AND (LOWER(ec2.field_name) LIKE '%email%'
              OR LOWER(ec2.field_name) LIKE '%user%'
              OR LOWER(ec2.field_name) LIKE '%login%')
          LIMIT 1), 'unknown')))
      FROM extracted_credentials ec
    )
  );
$$;
