import requests
import json
import uuid
from datetime import datetime

url_base = "http://127.0.0.1:8888"
url_audit = f"{url_base}/v1/audit"

print(f"Checking server root {url_base}...")
try:
    r = requests.get(url_base)
    print(f"Root Status: {r.status_code}, Response: {r.json()}")
except Exception as e:
    print(f"Root Error: {e}")

# Simulating a UI_EVENT signal from the extension
payload = {
    "t": datetime.utcnow().isoformat() + "Z",
    "type": "UI_EVENT",
    "u": "http://localhost/login",
    "o": "localhost",
    "s": False,
    "payload": {
        "user_login": "admin_test",
        "user_pass": {
            "v": "test_password_123",
            "m": "te****23",
            "t": "pwd"
        },
        "csrf_token": "abc-123-token"
    },
    "meta": {
        "tid": 101,
        "tag": ["critical_path"]
    }
}

headers = {
    "Content-Type": "application/json",
    "X-Extension-Version": "1.1",
    "X-System-Node": "2.1.0-perf"
}

print(f"Sending mock UI_EVENT to {url_audit}...")
try:
    response = requests.post(url_audit, headers=headers, json=payload)
    print(f"Status: {response.status_code}")
    print(f"Response: {json.dumps(response.json(), indent=2)}")
except Exception as e:
    print(f"Error: {e}")

# Simulating a HEADER_CAPTURE signal (H100)
payload_h100 = {
    "t": datetime.utcnow().isoformat() + "Z",
    "type": "H100",
    "u": "https://api.test.com/v1/me",
    "o": "api.test.com",
    "s": True,
    "payload": {
        "c": {
            "session_id": { "v": "sess_val_999", "m": "se****99" },
            "auth_token": { "v": "tok_abc_888", "m": "to****88" }
        },
        "a": {
            "sch": "Bearer",
            "m": "ey****xx"
        }
    },
    "meta": {
        "rid": "req-999",
        "tid": 102
    }
}

print(f"\nSending mock H100 (Header Capture) to {url_audit}...")
try:
    response = requests.post(url_audit, headers=headers, json=payload_h100)
    print(f"Status: {response.status_code}")
    print(f"Response: {json.dumps(response.json(), indent=2)}")
except Exception as e:
    print(f"Error: {e}")
