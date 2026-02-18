import json
import requests
import time
import sys
from datetime import datetime, timezone

# Force unbuffered stdout
sys.stdout.reconfigure(encoding='utf-8')

# --- Configuration ---
SOURCE_FILE = 'accounts_full_export.json'
LEGACY_SUPABASE_URL = "https://arslamcjzixeqmalscye.supabase.co"
LEGACY_SUPABASE_KEY = "sb_publishable_VDYPdce8BVPg_J9kzFgKpA_dYAfDcP4"

HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.9",
    "Upgrade-Insecure-Requests": "1",
}

# Global tracker for next available ID
NEXT_ID = 0

def fetch_max_id():
    """Fetches the current maximum ID from the accounts table."""
    headers = {
        "apikey": LEGACY_SUPABASE_KEY,
        "Authorization": f"Bearer {LEGACY_SUPABASE_KEY}",
        "Content-Type": "application/json"
    }
    url = f"{LEGACY_SUPABASE_URL}/rest/v1/accounts?select=id&order=id.desc&limit=1"
    try:
        r = requests.get(url, headers=headers, timeout=10)
        if r.status_code == 200:
            data = r.json()
            if data:
                return int(data[0]['id'])
    except Exception as e:
        print(f"Warning: Could not fetch max ID: {e}")
    return 0

def get_next_id():
    global NEXT_ID
    NEXT_ID += 1
    return NEXT_ID

def upsert_account_legacy(account_data):
    """Upserts account data into legacy Supabase using Check-then-Update/Insert."""
    email = account_data.get('account_email')
    if not email:
        print("  [SKIP] No email provided.")
        return False

    headers = {
        "apikey": LEGACY_SUPABASE_KEY,
        "Authorization": f"Bearer {LEGACY_SUPABASE_KEY}",
        "Content-Type": "application/json",
        "Prefer": "return=representation"
    }

    # 1. Check if account exists by Email
    check_url = f"{LEGACY_SUPABASE_URL}/rest/v1/accounts?account_email=eq.{email}&select=id"
    try:
        r = requests.get(check_url, headers=headers, timeout=10)
        existing = r.json() if r.status_code == 200 else []
    except Exception as e:
        print(f"  [ERROR] Check existence failed for {email}: {e}")
        return False

    # Prepare payload
    payload = {
        "account_email": email,
        "cookie_data": account_data.get('cookie_data'), 
        "account_status": "valid",
        "platform": "netflix",
        "last_used_at": datetime.now(timezone.utc).isoformat(),
        "updated_at": datetime.now(timezone.utc).isoformat(),
    }
    
    # Preserve creation time
    if account_data.get('created_at'):
        payload['created_at'] = account_data.get('created_at')
    elif not existing:
        payload['created_at'] = datetime.now(timezone.utc).isoformat()

    # Extract Netflix IDs
    cookies = account_data.get('cookie_data', [])
    if isinstance(cookies, list):
         for c in cookies:
            if isinstance(c, dict):
                if c.get('name') == 'NetflixId':
                    payload['netflix_id'] = c.get('value')
                elif c.get('name') == 'SecureNetflixId':
                    payload['secure_netflix_id'] = c.get('value')

    try:
        if existing:
            # UPDATE (No ID needed in payload, identified by URL param)
            acc_id = existing[0]['id']
            update_url = f"{LEGACY_SUPABASE_URL}/rest/v1/accounts?id=eq.{acc_id}"
            r = requests.patch(update_url, headers=headers, json=payload, timeout=10)
            action = "Updated"
        else:
            # INSERT
            # Requires explicit ID since DB has no default
            new_id = get_next_id()
            payload['id'] = new_id
            
            insert_url = f"{LEGACY_SUPABASE_URL}/rest/v1/accounts"
            r = requests.post(insert_url, headers=headers, json=payload, timeout=10)
            action = f"Inserted (ID: {new_id})"

        if r.status_code in [200, 201, 204]:
            print(f"  [SUCCESS] {action} {email}")
            return True
        else:
            print(f"  [ERROR] {action} failed for {email}: {r.status_code} {r.text}")
            return False

    except Exception as e:
        print(f"  [EXCEPTION] Upsert error: {e}")
        return False

def validate_cookies(cookies_input):
    """Validates cookies by making a request to Netflix."""
    cookies_list = []
    
    # Robust Checking/Parsing
    if isinstance(cookies_input, str):
        try:
            cookies_list = json.loads(cookies_input)
        except json.JSONDecodeError:
            return False, "JSON Decode Error in cookie_data", None
    elif isinstance(cookies_input, list):
        cookies_list = cookies_input
    else:
        return False, f"Invalid cookie_data type: {type(cookies_input)}", None

    if not cookies_list:
        return False, "No cookies found after parsing", None

    # Normalization: ensure list of dicts
    if not isinstance(cookies_list, list):
         return False, "Parsed structure is not a list", None

    session = requests.Session()
    session.headers.update(HEADERS)
    
    try:
        for cookie in cookies_list:
            if not isinstance(cookie, dict):
                continue 
            
            session.cookies.set(
                cookie.get('name'), 
                cookie.get('value'), 
                domain=cookie.get('domain', '.netflix.com'), 
                path=cookie.get('path', '/')
            )
            
        response = session.get("https://www.netflix.com/browse", timeout=10, allow_redirects=True)
        final_url = response.url
        html = response.text.lower()
        
        if "/login" in final_url:
            return False, "Redirected to login", cookies_list
        
        if "update your payment" in html or "account on hold" in html or ("/member" in final_url and ("update" in html or "payment" in html)):
            return False, "Account on Hold / Payment Update", cookies_list
        
        if "household" in html or "primary location" in html or "geoblock" in html or "not in your household" in html:
            return False, "Household Verification Block", cookies_list
            
        if "choose your plan" in html or "planselection" in final_url:
            return False, "No Plan Selected", cookies_list

        valid_paths = ["/browse", "/profiles", "/youraccount", "/member"]
        if any(path in final_url.lower() for path in valid_paths):
             return True, f"Active ({final_url})", cookies_list
        
        return False, f"Unknown State: {final_url}", cookies_list

    except Exception as e:
        return False, f"Request Error: {e}", cookies_list

def main():
    global NEXT_ID
    
    print("Fetching current Max ID from legacy DB...")
    max_id = fetch_max_id()
    NEXT_ID = max_id
    print(f"Starting ID generation from {NEXT_ID}")

    print(f"Loading accounts from {SOURCE_FILE}...")
    try:
        with open(SOURCE_FILE, 'r', encoding='utf-8') as f:
            accounts = json.load(f)
    except Exception as e:
        print(f"Error loading source file: {e}")
        return

    print(f"Found {len(accounts)} accounts to process.")
    
    valid_count = 0
    invalid_count = 0
    
    for i, acc in enumerate(accounts):
        email = acc.get('account_email', 'Unknown')
        print(f"\n[{i+1}/{len(accounts)}] Processing {email}...")
        
        raw_cookies = acc.get('cookie_data')
        if not raw_cookies:
            print("  [SKIP] No cookie data found.")
            invalid_count += 1
            continue
            
        is_valid, msg, parsed_cookies = validate_cookies(raw_cookies)
        
        if parsed_cookies:
            acc['cookie_data'] = parsed_cookies
        
        if is_valid:
            print(f"  [VALID] {msg}")
            if upsert_account_legacy(acc):
                valid_count += 1
            else:
                pass 
        else:
            print(f"  [INVALID] {msg}")
            invalid_count += 1
            
        time.sleep(1)

    print("\n" + "="*40)
    print("MIGRATION COMPLETE")
    print(f"Total Processed: {len(accounts)}")
    print(f"Successfully Migrated: {valid_count}")
    print(f"Invalid/Failed: {invalid_count}")
    print("="*40)

if __name__ == "__main__":
    main()
