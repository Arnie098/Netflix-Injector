import os
import requests
from dotenv import load_dotenv

load_dotenv(os.path.join("server", ".env"))

url = os.environ.get("AUDIT_SUPABASE_URL")
key = os.environ.get("AUDIT_SUPABASE_KEY")

print(f"Connecting to Audit Project: {url}")

headers = {
    "apikey": key,
    "Authorization": f"Bearer {key}",
}

try:
    # Query Postgrest for all tables in the current schema
    res = requests.get(f"{url}/rest/v1/", headers=headers)
    if res.status_code == 200:
        data = res.json()
        print("\n--- Available Tables/Views ---")
        paths = data.get("paths", {})
        for path in paths:
            if "/" != path:
                print(f" - {path}")
    else:
        print(f"❌ Error: {res.status_code} - {res.text}")
except Exception as e:
    print(f"⚠️ Error: {e}")
