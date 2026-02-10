-- Create a stored procedure to handle the "Check and Lock" logic atomically
create or replace function public.claim_license(
  p_license_key text,
  p_hardware_id text,
  p_include_account boolean default false
)
returns json
language plpgsql
security definer -- Runs with privileges of the creator (bypass RLS for the update if needed)
set search_path = public
as $$
declare
  v_license record;
  v_account record;
  v_now timestamp with time zone := now();
  v_attempts integer;
  v_new_claim boolean := false;
begin
  if p_license_key is null or length(trim(p_license_key)) = 0 then
    return json_build_object('success', false, 'message', 'License key required');
  end if;

  -- Basic rate limit per license key
  insert into public.license_attempts (
    license_key,
    attempt_count,
    first_attempt_at,
    last_attempt_at,
    last_hardware_id
  )
  values (
    p_license_key,
    1,
    v_now,
    v_now,
    p_hardware_id
  )
  on conflict (license_key)
  do update set
    attempt_count = case
      when public.license_attempts.last_attempt_at < (v_now - interval '10 minutes') then 1
      else public.license_attempts.attempt_count + 1
    end,
    last_attempt_at = v_now,
    last_hardware_id = p_hardware_id
  returning attempt_count into v_attempts;

  if v_attempts > 10 then
    return json_build_object('success', false, 'message', 'Too many attempts. Please wait.');
  end if;

  -- 1. Find the license
  select * into v_license from public.licenses where license_key = p_license_key;
  
  if not found then
    return json_build_object('success', false, 'message', 'License not found');
  end if;

  if v_license.is_active = false then
    return json_build_object('success', false, 'message', 'License is inactive');
  end if;

  -- 2. Check if already claimed
  if v_license.hardware_id is not null then
    -- Already claimed. Check if it matches.
    if v_license.hardware_id = p_hardware_id then
       -- Check Expiry
       if v_license.expiration_date is not null and v_license.expiration_date < v_now then
          return json_build_object('success', false, 'message', 'License expired');
       end if;
    else
       return json_build_object('success', false, 'message', 'License locked to another device');
    end if;
  else
    -- 3. Not claimed: Claim it now
    if v_license.expiration_date is not null and v_license.expiration_date < v_now then
      return json_build_object('success', false, 'message', 'License expired');
    end if;

    update public.licenses
    set 
      hardware_id = p_hardware_id,
      expiration_date = coalesce(v_license.expiration_date, (v_now + interval '30 days'))
    where id = v_license.id;

    v_new_claim := true;
  end if;

  if not p_include_account then
    return json_build_object(
      'success', true,
      'status', case when v_new_claim then 'newly_claimed' else 'existing_match' end
    );
  end if;

  -- 4. Fetch a valid account only after license validation
  select * into v_account
  from public.accounts
  where platform = 'netflix' and account_status = 'valid'
  order by last_used_at nulls first, random()
  limit 1;

  if not found then
    return json_build_object('success', false, 'message', 'No valid accounts available');
  end if;

  update public.accounts
  set last_used_at = v_now
  where id = v_account.id;

  return json_build_object(
    'success', true,
    'status', case when v_new_claim then 'newly_claimed' else 'existing_match' end,
    'account', json_build_object(
      'id', v_account.id,
      'cookie_data', v_account.cookie_data
    )
  );
end;
$$;

grant execute on function public.claim_license(text, text, boolean) to anon, authenticated;
