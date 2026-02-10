import requests
import json
import time

SUPABASE_URL = "https://arslamcjzixeqmalscye.supabase.co"
SUPABASE_KEY = "sb_publishable_VDYPdce8BVPg_J9kzFgKpA_dYAfDcP4"

HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.9",
    "Upgrade-Insecure-Requests": "1",
}

def get_cookies_from_supabase():
    headers = {
        "apikey": SUPABASE_KEY,
        "Authorization": f"Bearer {SUPABASE_KEY}",
        "Content-Type": "application/json"
    }
    print("Fetching cookies from Supabase...")
    response = requests.get(f"{SUPABASE_URL}/rest/v1/cookie_sessions?select=*", headers=headers)
    if response.status_code == 200:
        return response.json()
    else:
        print(f"Error fetching cookies: {response.status_code}")
        return []

def validate_cookie(session_data):
    try:
        cookies_data = session_data.get('cookies')
        if not cookies_data:
            return False, "No cookie data"

        if isinstance(cookies_data, str):
            try:
                cookies_list = json.loads(cookies_data)
            except json.JSONDecodeError:
                # it might be double encoded or just invalid
                return False, "JSON Decode Error"
        elif isinstance(cookies_data, list):
            cookies_list = cookies_data
        else:
            return False, f"Unexpected type: {type(cookies_data)}"
        
        session = requests.Session()
        session.headers.update(HEADERS)
        
        # Add cookies to session
        for cookie in cookies_list:
            # requests.cookies.RequestsCookieJar wants specific fields
            # We can use session.cookies.set
            session.cookies.set(
                cookie['name'], 
                cookie['value'], 
                domain=cookie.get('domain', '.netflix.com'), 
                path=cookie.get('path', '/')
            )

        # Make request to check validty
        # /browse is the main page for logged in users
        try:
            response = session.get("https://www.netflix.com/browse", timeout=10, allow_redirects=True)
            final_url = response.url
            
            if "/browse" in final_url:
                return True, "Active (/browse)"
            elif "/login" in final_url:
                return False, "Redirected to login"
            elif "/YourAccount" in final_url:
                return True, "Active (/YourAccount)"
            elif "/member" in final_url: # Payment/Hold
                return True, "Active (Hold/Member)" 
            else:
                return False, f"Unknown State: {final_url}"
                
        except Exception as e:
            return False, f"Request Error: {str(e)}"

    except Exception as e:
        return False, f"Parse Error: {str(e)}"

def main():
    sessions = get_cookies_from_supabase()
    print(f"Found {len(sessions)} sessions to validate.")
    
    working = 0
    non_working = 0
    
    for i, sess in enumerate(sessions):
        desc = sess.get('description', 'No Description')
        print(f"[{i+1}/{len(sessions)}] Checking: {desc[:50]}...")
        
        is_valid, msg = validate_cookie(sess)
        
        if is_valid:
            print(f"  Result: \033[92mWORKING\033[0m - {msg}")
            working += 1
        else:
            print(f"  Result: \033[91mNOT WORKING\033[0m - {msg}")
            non_working += 1
            
        time.sleep(1) # Polite delay

    print("=" * 40)
    print(f"Total: {len(sessions)}")
    print(f"Working: {working}")
    print(f"Not Working: {non_working}")

if __name__ == "__main__":
    main()
