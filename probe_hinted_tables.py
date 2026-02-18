import requests
import json
import sys

# Force unbuffered stdout
sys.stdout.reconfigure(encoding='utf-8')

url_base = 'https://rixbfnwxrirmobhrponz.supabase.co/rest/v1'
headers = {
    'apikey': 'sb_publishable_6vIO79ajegecCrZ3KTEEcw_H8QbH8iC',
    'Authorization': 'Bearer sb_publishable_6vIO79ajegecCrZ3KTEEcw_H8QbH8iC',
    'Content-Type': 'application/json',
}

def probe_table(table_name):
    print(f"--- Probing {table_name} ---")
    target = f"{url_base}/{table_name}?select=*&limit=1"
    
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

tables_to_check = ['access_keys', 'account_reports']

for t in tables_to_check:
    probe_table(t)
