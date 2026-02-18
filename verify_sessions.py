import requests
import json
import sys

# Force unbuffered stdout
sys.stdout.reconfigure(encoding='utf-8')

LEGACY_SUPABASE_URL = "https://arslamcjzixeqmalscye.supabase.co"
LEGACY_SUPABASE_KEY = "sb_publishable_VDYPdce8BVPg_J9kzFgKpA_dYAfDcP4"

headers = {
    "apikey": LEGACY_SUPABASE_KEY,
    "Authorization": f"Bearer {LEGACY_SUPABASE_KEY}",
    "Content-Type": "application/json",
    "Prefer": "count=exact"
}

def verify_sessions():
    print("--- Verifying Cookie Sessions ---")
    # Fetch last 5 sessions
    url = f"{LEGACY_SUPABASE_URL}/rest/v1/cookie_sessions?select=*&order=id.desc&limit=5"
    
    try:
        r = requests.get(url, headers=headers, timeout=10)
        if r.status_code == 200:
            data = r.json()
            count = r.headers.get('Content-Range', 'Unknown').split('/')[-1]
            print(f"Total Sessions in DB: {count}")
            print(f"Latest 5 Sessions:")
            for sess in data:
                desc = sess.get('description')
                # Truncate cookies for display
                print(f"  ID: {sess.get('id')}, Description: {desc}")
        else:
            print(f"Error: {r.status_code} {r.text}")
    except Exception as e:
        print(f"Exception: {e}")

if __name__ == "__main__":
    verify_sessions()
