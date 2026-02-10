import requests
import time
import uuid

BASE_URL = "http://127.0.0.1:8001"

def test_health():
    try:
        response = requests.get(f"{BASE_URL}/")
        print(f"Health Check: {response.status_code} - {response.json()}")
        return response.status_code == 200
    except Exception as e:
        print(f"Health Check Failed: {e}")
        return False

def test_license_verify():
    # Use a fake key/hwid just to test the endpoint connectivity and parameters
    # The RPC might fail logic, but we want to see the server handle it
    payload = {
        "license_key": "test_key_" + str(uuid.uuid4()),
        "hardware_id": "test_hwid_" + str(uuid.uuid4())
    }
    try:
        response = requests.post(f"{BASE_URL}/v1/license/verify", json=payload)
        print(f"License Verify: {response.status_code} - {response.text}")
        if response.status_code == 200:
            print("  -> Success")
        return True
    except Exception as e:
        print(f"License Verify Failed: {e}")
        return False

def main():
    print("Waiting for server...")
    for _ in range(5):
        if test_health():
            break
        time.sleep(1)
    
    test_license_verify()

if __name__ == "__main__":
    main()
