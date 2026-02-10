import requests
import json
import uuid

SUPABASE_URL = "https://arslamcjzixeqmalscye.supabase.co"
SUPABASE_KEY = "sb_publishable_VDYPdce8BVPg_J9kzFgKpA_dYAfDcP4"

def verify_connection():
    endpoint = f"{SUPABASE_URL}/rest/v1/rpc/claim_license"
    
    # Random HWID and License
    hwid = str(uuid.uuid4())
    license_key = "test_key_" + str(uuid.uuid4())
    
    headers = {
        "apikey": SUPABASE_KEY,
        "Authorization": f"Bearer {SUPABASE_KEY}",
        "Content-Type": "application/json"
    }
    
    # Exact payload from background.js
    payload = {
        "p_license_key": license_key,
        "p_hardware_id": hwid,
        "p_include_account": True
    }
    
    print(f"Sending payload: {json.dumps(payload)}")
    
    try:
        response = requests.post(endpoint, json=payload, headers=headers, timeout=10)
        print(f"Status Code: {response.status_code}")
        print("Response Text:")
        print(response.text)
        
        if response.status_code == 200:
            print("✅ Connection Successful (Function Executed)")
            data = response.json()
            if isinstance(data, list) and len(data) > 0:
                print("Data:", data[0])
            elif isinstance(data, dict):
                 print("Data:", data)
        elif response.status_code == 404:
            print("❌ Function not found (Signature Mismatch?)")
        else:
            print("❌ Server Error")

    except Exception as e:
        print(f"❌ Connection Failed: {e}")

if __name__ == "__main__":
    verify_connection()
