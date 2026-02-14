import requests
import os
from dotenv import load_dotenv

load_dotenv()

url = os.environ.get("SUPABASE_URL")
key = os.environ.get("SUPABASE_KEY")

print(f"Testing Supabase with raw requests to: {url}")

headers = {
    "apikey": key,
    "Authorization": f"Bearer {key}",
    "Content-Type": "application/json"
}

try:
    # Try to fetch from audit_captures to see if it even works
    response = requests.get(f"{url}/rest/v1/audit_captures?select=count", headers=headers)
    print(f"GET Status: {response.status_code}")
    print(f"GET Body: {response.text}")
    
    if response.status_code == 200:
        print("✅ SUCCESS: Successfully fetched from 'audit_captures' with raw requests.")
    else:
        print(f"❌ FAILURE: Raw request failed. Server said: {response.text}")

except Exception as e:
    print(f"❌ ERROR: {str(e)}")
