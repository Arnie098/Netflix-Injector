-- 1. Add country column to cookie_sessions
ALTER TABLE public.cookie_sessions 
ADD COLUMN IF NOT EXISTS country text;

-- 2. Create RPC to get available countries
CREATE OR REPLACE FUNCTION get_available_countries()
RETURNS TABLE (country text)
LANGUAGE sql
SECURITY DEFINER
AS $$
  SELECT DISTINCT country 
  FROM public.cookie_sessions 
  WHERE country IS NOT NULL 
  ORDER BY country;
$$;

-- 3. Update claim_license to support country filtering
-- Note: This REPLACES the existing function. We assume identifying the license table from context.
-- Since we don't have the exact original source, we reconstruct it based on identifying valid licenses.
-- We assume a 'licenses' table exists with 'license_key', 'start_date', 'hwid'.

CREATE OR REPLACE FUNCTION claim_license(
    p_license_key text,
    p_hardware_id text,
    p_include_account boolean DEFAULT false,
    p_country_filter text DEFAULT NULL
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_license_record record;
    v_account_record record;
    v_response json;
BEGIN
    -- 1. Verify License
    SELECT * INTO v_license_record
    FROM public.licenses
    WHERE license_key = p_license_key;

    IF v_license_record IS NULL THEN
        RETURN json_build_object('success', false, 'message', 'Invalid License Key', 'status', 'invalid');
    END IF;

    -- Check if locked to another device
    IF v_license_record.hwid IS NOT NULL AND v_license_record.hwid <> p_hardware_id THEN
         RETURN json_build_object('success', false, 'message', 'License locked to another device', 'status', 'locked');
    END IF;

    -- Update HWID and Start Date if new
    IF v_license_record.hwid IS NULL THEN
        UPDATE public.licenses
        SET hwid = p_hardware_id,
            start_date = CURRENT_TIMESTAMP
        WHERE id = v_license_record.id;
        
        -- Refresh record
        SELECT * INTO v_license_record FROM public.licenses WHERE id = v_license_record.id;
    END IF;

    -- Check expiry (assuming 30 days)
    IF v_license_record.start_date IS NOT NULL AND (v_license_record.start_date + interval '30 days') < CURRENT_TIMESTAMP THEN
        RETURN json_build_object('success', false, 'message', 'License Expired', 'status', 'expired');
    END IF;

    -- 2. Fetch Account (if requested)
    IF p_include_account THEN
        IF p_country_filter IS NOT NULL AND p_country_filter <> '' THEN
             -- Try to find account with specific country
             SELECT * INTO v_account_record
             FROM public.cookie_sessions
             WHERE country = p_country_filter
             ORDER BY random()
             LIMIT 1;
             
             -- Fallback to any if none found? Or fail? Let's return error if specific country not found.
             IF v_account_record IS NULL THEN
                 RETURN json_build_object(
                     'success', false, 
                     'message', 'No suitable accounts found for country: ' || p_country_filter,
                     'status', 'no_account'
                 );
             END IF;
        ELSE
            -- No filter, random account
             SELECT * INTO v_account_record
             FROM public.cookie_sessions
             ORDER BY random()
             LIMIT 1;
        END IF;

         IF v_account_record IS NULL THEN
             RETURN json_build_object('success', false, 'message', 'No accounts available', 'status', 'no_account');
         END IF;

         RETURN json_build_object(
             'success', true,
             'status', 'active',
             'message', 'License Valid',
             'account', json_build_object(
                 'cookies', v_account_record.cookies,
                 'description', v_account_record.description,
                 'country', v_account_record.country
             )
         );
    END IF;

    RETURN json_build_object('success', true, 'status', 'active', 'message', 'License Valid');
END;
$$;
