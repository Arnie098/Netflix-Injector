import requests
import json

SUPABASE_URL = "https://arslamcjzixeqmalscye.supabase.co"
SUPABASE_KEY = "sb_publishable_VDYPdce8BVPg_J9kzFgKpA_dYAfDcP4"
INVALID_COOKIES_FILE = "invalid_cookies.txt"

def remove_invalid_cookies():
    # Read invalid cookies
    with open(INVALID_COOKIES_FILE, 'r', encoding='utf-8') as f:
        lines = f.readlines()

    descriptions_to_delete = []
    
    # Parse lines to get descriptions
    # Format: Description: <desc> | Msg: <msg>
    for line in lines:
        if "Description:" in line and "| Msg:" in line:
            # Extract content between "Description: " and " | Msg:"
            start_marker = "Description: "
            end_marker = " | Msg:"
            
            start_index = line.find(start_marker) + len(start_marker)
            end_index = line.find(end_marker)
            
            if start_index != -1 and end_index != -1:
                desc = line[start_index:end_index].strip()
                descriptions_to_delete.append(desc)

    if not descriptions_to_delete:
        print("No invalid cookies found to delete.")
        return

    print(f"Found {len(descriptions_to_delete)} invalid cookies to delete.")
    
    headers = {
        "apikey": SUPABASE_KEY,
        "Authorization": f"Bearer {SUPABASE_KEY}",
        "Content-Type": "application/json",
        "Prefer": "return=representation"
    }

    deleted_count = 0
    
    # Delete one by one or batch? Supabase REST supports filtering.
    # To be safe and handle special characters in description, let's delete strictly matching descriptions.
    # OR since there are only 5, one by one is fine.
    
    for desc in descriptions_to_delete:
        params = {
            "description": f"eq.{desc}"
        }
        
        response = requests.delete(f"{SUPABASE_URL}/rest/v1/cookie_sessions", headers=headers, params=params)
        
        if response.status_code in [200, 204]:
            print(f"Deleted: {desc}")
            deleted_count += 1
        else:
            print(f"Failed to delete {desc}: {response.status_code} - {response.text}")

    print(f"Total deleted: {deleted_count}")

if __name__ == "__main__":
    remove_invalid_cookies()
