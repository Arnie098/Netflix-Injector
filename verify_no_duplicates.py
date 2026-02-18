import json
import requests
from collections import Counter

SUPABASE_URL = "https://arslamcjzixeqmalscye.supabase.co"
SUPABASE_KEY = "sb_publishable_VDYPdce8BVPg_J9kzFgKpA_dYAfDcP4"

def verify_no_duplicates():
    headers = {
        "apikey": SUPABASE_KEY,
        "Authorization": f"Bearer {SUPABASE_KEY}",
    }
    
    # Fetch all records
    response = requests.get(f"{SUPABASE_URL}/rest/v1/cookie_sessions?select=cookies", headers=headers)
    if response.status_code != 200:
        print(f"Error checking duplicates: {response.status_code} - {response.text}")
        return
    
    netflix_ids = []
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
                    netflix_ids.append(c.get("value"))
    
    counts = Counter(netflix_ids)
    duplicates = {k: v for k, v in counts.items() if v > 1}
    
    if duplicates:
        print(f"FAILED: Found {len(duplicates)} duplicate NetflixIds:")
        for nid, count in duplicates.items():
            print(f"  {nid}: {count} times")
    else:
        print("SUCCESS: No duplicate NetflixIds found in database.")

if __name__ == "__main__":
    verify_no_duplicates()
