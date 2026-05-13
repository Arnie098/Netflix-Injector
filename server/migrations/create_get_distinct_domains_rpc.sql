-- Create RPC function to get distinct domains efficiently
-- Run this in the AUDIT Supabase project SQL editor

CREATE OR REPLACE FUNCTION get_distinct_domains()
RETURNS TABLE(domain text) 
LANGUAGE sql
SECURITY DEFINER
AS $$
  SELECT DISTINCT domain FROM audit_captures WHERE domain IS NOT NULL ORDER BY domain;
$$;
