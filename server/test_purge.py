import requests
import json
import os
from datetime import datetime
from dotenv import load_dotenv

load_dotenv()

API_BASE = "http://127.0.0.1:8888/v1"
ADMIN_URL = f"{API_BASE}/admin"
AUDIT_URL = f"{API_BASE}/audit"
TOKEN = os.getenv("ADMIN_API_KEY", "admin_secret_key_123")

headers_admin = {
    "Authorization": f"Bearer {TOKEN}",
    "Content-Type": "application/json"
}

headers_audit = {
    "Content-Type": "application/json",
    "X-Extension-Version": "1.1",
    "X-System-Node": "test-runner"
}

def test_purge():
    print("--- Testing Purge All Data ---")
    
    # 1. Insert some dummy data
    print("Step 1: Inserting dummy data...")
    payload = {
        "t": datetime.utcnow().isoformat() + "Z",
        "type": "UI_EVENT",
        "u": "http://test-purge.com/login",
        "o": "test-purge.com",
        "s": False,
        "payload": {
            "user_login": "purge_test_user",
            "user_pass": {"v": "purge_secret", "m": "pu****et", "t": "pwd"}
        },
        "meta": {"tid": 999}
    }
    
    try:
        res_insert = requests.post(AUDIT_URL, headers=headers_audit, json=payload)
        if res_insert.status_code == 200:
            print("✅ Successfully inserted test data.")
        else:
            print(f"❌ Failed to insert test data: {res_insert.status_code} {res_insert.text}")
            return
    except Exception as e:
        print(f"❌ Error inserting data: {e}")
        return

    # 2. Verify data exists
    print("Step 2: Verifying data exists before purge...")
    try:
        res_check = requests.get(f"{ADMIN_URL}/captures", headers=headers_admin)
        data_count = res_check.json().get("total", 0)
        print(f"Found {data_count} records in audit_captures.")
        if data_count == 0:
            print("⚠️ No data found to purge. Check if server is running or if database is empty.")
    except Exception as e:
        print(f"❌ Error checking data: {e}")
        return

    # 3. Perform Purge
    print("Step 3: Performing purge...")
    try:
        res_purge = requests.delete(f"{ADMIN_URL}/purge", headers=headers_admin)
        print(f"Purge Response: {res_purge.status_code} {res_purge.json()}")
        if res_purge.status_code != 200:
            print("❌ Purge failed.")
            return
    except Exception as e:
        print(f"❌ Error performing purge: {e}")
        return

    # 4. Final verification
    print("Step 4: Final verification...")
    try:
        res_verify = requests.get(f"{ADMIN_URL}/captures", headers=headers_admin)
        final_count = res_verify.json().get("total", 0)
        if final_count == 0:
            print("✅ SUCCESS: All data purged.")
        else:
            print(f"❌ FAILURE: {final_count} records remaining.")
            # Also check credentials table directly if possible via admin API
            res_creds = requests.get(f"{ADMIN_URL}/credentials", headers=headers_admin)
            creds_count = res_creds.json().get("total", 0)
            print(f"Records remaining in credentials: {creds_count}")
    except Exception as e:
        print(f"❌ Error in final verification: {e}")

if __name__ == "__main__":
    test_purge()
