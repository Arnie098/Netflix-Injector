import requests

SUPABASE_URL = "https://arslamcjzixeqmalscye.supabase.co"
SUPABASE_KEY = "sb_publishable_VDYPdce8BVPg_J9kzFgKpA_dYAfDcP4"

def verify_count():
    headers = {
        "apikey": SUPABASE_KEY,
        "Authorization": f"Bearer {SUPABASE_KEY}",
        "Range": "0-0",
        "Prefer": "count=exact"
    }
    
    # We use HEAD to get the count without downloading all data
    response = requests.get(f"{SUPABASE_URL}/rest/v1/cookie_sessions", headers=headers)
    
    if response.status_code in [200, 206]:
        content_range = response.headers.get("Content-Range")
        if content_range:
            # Content-Range: 0-0/1234
            count = content_range.split('/')[-1]
            print(f"Total cookies in database: {count}")
        else:
            print("Could not retrieve count from Content-Range header.")
    else:
        print(f"Error checking count: {response.status_code} - {response.text}")

if __name__ == "__main__":
    verify_count()
