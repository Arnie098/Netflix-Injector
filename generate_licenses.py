import requests
import random
import string
import json

SUPABASE_URL = "https://arslamcjzixeqmalscye.supabase.co"
SUPABASE_KEY = "sb_publishable_VDYPdce8BVPg_J9kzFgKpA_dYAfDcP4"

def generate_key(prefix="PHC"):
    # Generate a random string of 16 characters (4 blocks of 4)
    # But user asked for "PHC in the start", so maybe PHC-XXXX-XXXX-XXXX
    chars = string.ascii_uppercase + string.digits
    part1 = ''.join(random.choices(chars, k=4))
    part2 = ''.join(random.choices(chars, k=4))
    part3 = ''.join(random.choices(chars, k=4))
    return f"{prefix}-{part1}-{part2}-{part3}"

def insert_license(key):
    url = f"{SUPABASE_URL}/rest/v1/licenses"
    headers = {
        "apikey": SUPABASE_KEY,
        "Authorization": f"Bearer {SUPABASE_KEY}",
        "Content-Type": "application/json",
        "Prefer": "return=representation"
    }
    data = {
        "license_key": key,
        # hwid and start_date are null initially
    }
    
    response = requests.post(url, headers=headers, json=data)
    
    if response.status_code == 201:
        print(f"✅ Created: {key}")
        return True
    else:
        print(f"❌ Failed to create {key}: {response.text}")
        return False

def main():
    print("Generating 10 PHC license keys...")
    created_keys = []
    
    for _ in range(10):
        key = generate_key("PHC")
        if insert_license(key):
            created_keys.append(key)
            
    print("\n--- Generated Keys ---")
    for k in created_keys:
        print(k)

    # Save to file
    with open("new_phc_licenses.txt", "w") as f:
        f.write("\n".join(created_keys))
    print(f"\nSaved to new_phc_licenses.txt")

if __name__ == "__main__":
    main()
