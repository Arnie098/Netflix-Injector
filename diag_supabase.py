import os
import requests
from dotenv import load_dotenv

load_dotenv(os.path.join("server", ".env"))

def check_project(name, url, key):
    print(f"\n--- Checking {name} ---")
    print(f"URL: {url}")
    print(f"Key Prefix: {key[:15]}...")
    
    headers = {
        "apikey": key,
        "Authorization": f"Bearer {key}",
    }
    
    try:
        # Try 'cookie_sessions'
        res = requests.get(f"{url}/rest/v1/cookie_sessions?select=count", headers=headers)
        if res.status_code == 200:
            print(f"✅ Found 'cookie_sessions' table! Count: {res.json()}")
        else:
            print(f"❌ 'cookie_sessions' table not found or error: {res.status_code} - {res.text}")
            
        # Try 'licenses'
        res = requests.get(f"{url}/rest/v1/licenses?select=count", headers=headers)
        if res.status_code == 200:
            print(f"✅ Found 'licenses' table! Count: {res.json()}")
        else:
            print(f"❌ 'licenses' table not found or error: {res.status_code} - {res.text}")
            
    except Exception as e:
        print(f"⚠️ Error: {e}")

# From .env
inj_url = os.environ.get("INJECTOR_SUPABASE_URL")
inj_key = os.environ.get("INJECTOR_SUPABASE_KEY")

aud_url = os.environ.get("AUDIT_SUPABASE_URL")
aud_key = os.environ.get("AUDIT_SUPABASE_KEY")

if inj_url:
    check_project("Injector Project", inj_url, inj_key)

if aud_url:
    check_project("Audit Project", aud_url, aud_key)
