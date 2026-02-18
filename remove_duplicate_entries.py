import json
import requests
from collections import defaultdict

SUPABASE_URL = "https://arslamcjzixeqmalscye.supabase.co"
SUPABASE_KEY = "sb_publishable_VDYPdce8BVPg_J9kzFgKpA_dYAfDcP4"

def cleanup_duplicates():
    headers = {
        "apikey": SUPABASE_KEY,
        "Authorization": f"Bearer {SUPABASE_KEY}",
    }
    
    # Fetch all records with IDs
    response = requests.get(f"{SUPABASE_URL}/rest/v1/cookie_sessions?select=id,cookies", headers=headers)
    if response.status_code != 200:
        print(f"Error fetching cookies: {response.status_code} - {response.text}")
        return
    
    data = response.json()
    netflix_id_to_rows = defaultdict(list)
    
    for row in data:
        row_id = row.get("id")
        cookies = row.get("cookies")
        if not cookies:
            continue
            
        if isinstance(cookies, str):
            try:
                cookies = json.loads(cookies)
            except:
                continue
                
        if isinstance(cookies, list):
            for c in cookies:
                if c.get("name") == "NetflixId":
                    netflix_id_to_rows[c.get("value")].append(row_id)
    
    ids_to_delete = []
    for nid, row_ids in netflix_id_to_rows.items():
        if len(row_ids) > 1:
            # Keep the first one, delete the rest
            ids_to_delete.extend(row_ids[1:])
            
    if not ids_to_delete:
        print("No duplicates found to delete.")
        return
        
    print(f"Total rows to delete: {len(ids_to_delete)}")
    
    # Supabase/PostgREST delete by list of IDs
    # e.g. DELETE /rest/v1/cookie_sessions?id=in.(1,2,3)
    # We may need to do this in batches if the list is long
    batch_size = 50
    for i in range(0, len(ids_to_delete), batch_size):
        batch = ids_to_delete[i:i+batch_size]
        ids_str = ",".join(map(str, batch))
        url = f"{SUPABASE_URL}/rest/v1/cookie_sessions?id=in.({ids_str})"
        resp = requests.delete(url, headers=headers)
        if resp.status_code in [200, 204]:
            print(f"Deleted batch {i//batch_size + 1}")
        else:
            print(f"Error deleting batch: {resp.status_code} - {resp.text}")
            
    print(f"Successfully removed {len(ids_to_delete)} duplicate rows.")

if __name__ == "__main__":
    cleanup_duplicates()
