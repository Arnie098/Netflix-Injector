import requests
import json
import sys
import time

# Force unbuffered stdout
sys.stdout.reconfigure(encoding='utf-8')

url_base = 'https://rixbfnwxrirmobhrponz.supabase.co/rest/v1'
headers = {
    'apikey': 'sb_publishable_6vIO79ajegecCrZ3KTEEcw_H8QbH8iC',
    'Authorization': 'Bearer sb_publishable_6vIO79ajegecCrZ3KTEEcw_H8QbH8iC',
    'Content-Type': 'application/json',
    'Prefer': 'count=exact'
}

def extract_table(table_name, select_query='*', filename=None):
    if not filename:
        filename = f"{table_name}_export.json"
        
    print(f"\n--- Extracting {table_name} to {filename} ---", flush=True)
    all_data = []
    offset = 0
    limit = 1000
    
    while True:
        target = f"{url_base}/{table_name}"
        params = {
            'select': select_query,
            'offset': offset,
            'limit': limit
        }
        
        # Add ordering if possible to prevent pagination drift, assuming 'id' or 'created_at' exists
        # For generic extraction, we might skip explicit order if PK is unknown, but usually 'id' or 'created_at' is safe guess for Supabase
        if table_name == 'accounts':
             params['order'] = 'id.asc'
        elif table_name == 'account_reports':
             params['order'] = 'id.asc'
        elif table_name == 'access_keys':
             params['order'] = 'created_at.asc'

        try:
            r = requests.get(target, headers=headers, params=params, timeout=30)
            if r.status_code != 200:
                print(f"Error fetching {table_name}: {r.status_code} {r.text[:200]}", flush=True)
                break
                
            data = r.json()
            if not data:
                break
                
            all_data.extend(data)
            print(f"Fetched {len(data)} rows. Total: {len(all_data)}", flush=True)
            
            if len(data) < limit:
                break
            
            offset += limit
            
        except Exception as e:
            print(f"Exception extracting {table_name}: {e}", flush=True)
            break
            
    try:
        with open(filename, 'w', encoding='utf-8') as f:
            json.dump(all_data, f, indent=2, default=str)
        print(f"Saved {len(all_data)} rows to {filename}", flush=True)
    except Exception as e:
        print(f"Error saving {filename}: {e}", flush=True)

# 1. Accounts with cookie_data (credentials)
# We select explicit columns to be sure, or * to get everything including new columns
extract_table('accounts', select_query='*', filename='accounts_full_export.json')

# 2. Access Keys
extract_table('access_keys', select_query='*', filename='access_keys_export.json')

# 3. Account Reports
extract_table('account_reports', select_query='*', filename='account_reports_export.json')

print("\nAll extractions completed.", flush=True)
