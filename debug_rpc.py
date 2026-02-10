import requests
import json
import uuid

SUPABASE_URL = "https://arslamcjzixeqmalscye.supabase.co"
SUPABASE_KEY = "sb_publishable_VDYPdce8BVPg_J9kzFgKpA_dYAfDcP4"

def test_claim_license():
    endpoint = f"{SUPABASE_URL}/rest/v1/rpc/claim_license"
    
    # Generate a random HWID and Key for testing
    hwid = str(uuid.uuid4())
    license_key = "test_key_" + str(uuid.uuid4())
    
    print(f"Testing claim_license with HWID: {hwid}")
    
    headers = {
        "apikey": SUPABASE_KEY,
        "Authorization": f"Bearer {SUPABASE_KEY}",
        "Content-Type": "application/json"
    }
    
    payload = {
        "p_license_key": license_key,
        "p_hardware_id": hwid,
        "p_include_account": True,
        "p_country_filter": None
    }
    
    try:
        response = requests.post(endpoint, json=payload, headers=headers)
        print(f"Status Code: {response.status_code}")
        print("Response Text:")
        print(response.text)
        
        if response.status_code == 200:
            try:
                data = response.json()
                print("\nParsed JSON:")
                print(json.dumps(data, indent=2))
            except:
                pass
    except Exception as e:
        print(f"Error: {e}")

if __name__ == "__main__":
    test_claim_license()
