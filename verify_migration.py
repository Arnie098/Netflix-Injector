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

def verify_accounts():
    print("--- Verifying Migrated Accounts ---")
    # Fetch last 5 accounts
    url = f"{LEGACY_SUPABASE_URL}/rest/v1/accounts?select=*&order=id.desc&limit=5"
    
    try:
        r = requests.get(url, headers=headers, timeout=10)
        if r.status_code == 200:
            data = r.json()
            count = r.headers.get('Content-Range', 'Unknown').split('/')[-1]
            print(f"Total Accounts in DB: {count}")
            print(f"Latest 5 Accounts:")
            for acc in data:
                print(f"  ID: {acc.get('id')}, Email: {acc.get('account_email')}, Status: {acc.get('account_status')}")
        else:
            print(f"Error: {r.status_code} {r.text}")
    except Exception as e:
        print(f"Exception: {e}")

if __name__ == "__main__":
    verify_accounts()
