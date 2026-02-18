import requests

url = "https://arslamcjzixeqmalscye.supabase.co"
key = "sb_publishable_VDYPdce8BVPg_J9kzFgKpA_dYAfPcP4"

def test_headers(name, headers):
    print(f"\n--- Testing: {name} ---")
    try:
        res = requests.get(f"{url}/rest/v1/licenses?select=count", headers=headers)
        print(f"Status: {res.status_code}")
        print(f"Response: {res.text}")
    except Exception as e:
        print(f"Error: {e}")

# Attempt 1: Standard both
test_headers("Both headers", {
    "apikey": key,
    "Authorization": f"Bearer {key}"
})

# Attempt 2: Only apikey
test_headers("Only apikey", {
    "apikey": key
})

# Attempt 3: apikey and no Bearer prefix? (Unlikely)
test_headers("apikey and raw key", {
    "apikey": key,
    "Authorization": key
})
