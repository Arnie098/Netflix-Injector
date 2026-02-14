import requests
import json
import os
from dotenv import load_dotenv

load_dotenv()

API_BASE = "http://127.0.0.1:8888/v1/admin"
TOKEN = os.getenv("ADMIN_API_KEY", "admin_secret_key_123")

headers = {
    "Authorization": f"Bearer {TOKEN}",
    "Content-Type": "application/json"
}

def test_bulk_delete():
    print("--- Testing Bulk Delete ---")
    
    # 1. Fetch some IDs to delete
    res = requests.get(f"{API_BASE}/captures?page_size=5", headers=headers)
    data = res.json().get("data", [])
    
    if not data:
        print("No data found to test deletion.")
        return

    target_ids = [item["id"] for item in data]
    print(f"Attempting to bulk delete: {target_ids}")

    # 2. Perform bulk delete
    delete_res = requests.post(
        f"{API_BASE}/captures/bulk-delete",
        headers=headers,
        json={"ids": target_ids}
    )
    
    print(f"Status: {delete_res.status_code}")
    print(f"Response: {delete_res.json()}")

    # 3. Verify they are gone
    verify_res = requests.get(f"{API_BASE}/captures?page_size=20", headers=headers)
    remaining_ids = [item["id"] for item in verify_res.json().get("data", [])]
    
    found_any = any(tid in remaining_ids for tid in target_ids)
    if not found_any:
        print("✅ SUCCESS: Bulk delete verified.")
    else:
        print("❌ FAILURE: Some IDs still exist.")

if __name__ == "__main__":
    test_bulk_delete()
