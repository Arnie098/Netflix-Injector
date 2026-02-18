import json
import requests
import time
import sys

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

def insert_cookie_session(account_data):
    """Inserts valid cookies into cookie_sessions table."""
    email = account_data.get('account_email', 'Unknown')
    cookies = account_data.get('cookie_data')

    url = f"{LEGACY_SUPABASE_URL}/rest/v1/cookie_sessions"
    headers = {
        "apikey": LEGACY_SUPABASE_KEY,
        "Authorization": f"Bearer {LEGACY_SUPABASE_KEY}",
        "Content-Type": "application/json",
        "Prefer": "return=minimal" 
    }
    
    payload = {
        "cookies": cookies, # Supabase handles JSON/JSONB automatically from list/dict
        "description": f"Imported: {email}"
    }

    try:
        r = requests.post(url, headers=headers, json=payload, timeout=10)
        if r.status_code in [200, 201, 204]:
            print(f"  [SUCCESS] Inserted session for {email}")
            return True
        else:
            print(f"  [ERROR] Insert failed for {email}: {r.status_code} {r.text}")
            return False
    except Exception as e:
        print(f"  [EXCEPTION] Insert error: {e}")
        return False

def validate_cookies(cookies_input):
    """Validates cookies by making a request to Netflix."""
    cookies_list = []
    
    if isinstance(cookies_input, str):
        try:
            cookies_list = json.loads(cookies_input)
        except json.JSONDecodeError:
            return False, "JSON Decode Error"
    elif isinstance(cookies_input, list):
        cookies_list = cookies_input
    else:
        return False, "Invalid type"

    if not cookies_list:
        return False, "No cookies"

    if not isinstance(cookies_list, list):
         return False, "Not a list"

    session = requests.Session()
    session.headers.update(HEADERS)
    
    try:
        for cookie in cookies_list:
            if not isinstance(cookie, dict): continue
            session.cookies.set(
                cookie.get('name'), 
                cookie.get('value'), 
                domain=cookie.get('domain', '.netflix.com'), 
                path=cookie.get('path', '/')
            )
            
        response = session.get("https://www.netflix.com/browse", timeout=10, allow_redirects=True)
        final_url = response.url
        html = response.text.lower()
        
        if "/login" in final_url: return False, "Redirected to login"
        if "update your payment" in html or "account on hold" in html or ("/member" in final_url and ("update" in html or "payment" in html)): return False, "Hold/Payment"
        if "household" in html or "primary location" in html or "geoblock" in html or "not in your household" in html: return False, "Household Block"
        if "choose your plan" in html or "planselection" in final_url: return False, "No Plan"

        valid_paths = ["/browse", "/profiles", "/youraccount", "/member"]
        if any(path in final_url.lower() for path in valid_paths):
             return True, "Active"
        
        return False, f"Unknown: {final_url}"

    except Exception as e:
        return False, f"Error: {e}"

def main():
    print(f"Loading accounts from {SOURCE_FILE}...")
    try:
        with open(SOURCE_FILE, 'r', encoding='utf-8') as f:
            accounts = json.load(f)
    except Exception as e:
        print(f"Error loading source file: {e}")
        return

    print(f"Found {len(accounts)} accounts. Validating and migrating to cookie_sessions...")
    
    valid_count = 0
    
    for i, acc in enumerate(accounts):
        email = acc.get('account_email', 'Unknown')
        print(f"[{i+1}/{len(accounts)}] {email}...", end=" ")
        
        raw_cookies = acc.get('cookie_data')
        if not raw_cookies:
            print("SKIP (No cookies)")
            continue
            
        is_valid, msg = validate_cookies(raw_cookies)
        
        if is_valid:
            # Re-parse if it was string, just to be safe for insertion, though validate_cookies handles it, 
            # we need the object for insertion if it was a string in source
            if isinstance(raw_cookies, str):
                try: raw_cookies = json.loads(raw_cookies)
                except: pass

            acc['cookie_data'] = raw_cookies # ensure clean list

            print(f"VALID ({msg}) -> ", end="")
            if insert_cookie_session(acc):
                valid_count += 1
        else:
            print(f"INVALID ({msg})")
            
        time.sleep(1)

    print("\n" + "="*40)
    print(f"Migration to cookie_sessions complete. valid_count={valid_count}")

if __name__ == "__main__":
    main()
