import requests
import json
import sys

# Force unbuffered stdout
sys.stdout.reconfigure(encoding='utf-8')

# Legacy Supabase Config
SUPABASE_URL = "https://arslamcjzixeqmalscye.supabase.co"
SUPABASE_KEY = "sb_publishable_VDYPdce8BVPg_J9kzFgKpA_dYAfDcP4"

headers = {
    "apikey": SUPABASE_KEY,
    "Authorization": f"Bearer {SUPABASE_KEY}",
    "Content-Type": "application/json"
}

def probe_table(table_name):
    print(f"--- Probing {table_name} ---")
    target = f"{SUPABASE_URL}/rest/v1/{table_name}?select=*&limit=1"
    
    try:
        r = requests.get(target, headers=headers, timeout=10)
        print(f"Status: {r.status_code}")
        
        if r.status_code == 200:
            data = r.json()
            if data:
                print(f"Success! Found {len(data)} row(s).")
                print(f"Columns found: {list(data[0].keys())}")
            else:
                print("Success, but table is empty or RLS hides all rows.")
        else:
            print(f"Error: {r.text[:200]}")
    except Exception as e:
        print(f"Exception: {e}")
    print("\n")

tables_to_check = ['accounts', 'cookie_sessions', 'cookies']

for t in tables_to_check:
    probe_table(t)
