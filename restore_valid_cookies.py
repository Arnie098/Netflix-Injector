import requests
import json
import re

SUPABASE_URL = "https://arslamcjzixeqmalscye.supabase.co"
SUPABASE_KEY = "sb_publishable_VDYPdce8BVPg_J9kzFgKpA_dYAfDcP4"

def restore_valid_cookies():
    # 1. Delete all existing cookies (since they are likely invalid)
    print("Clearing existing cookies from Supabase...")
    headers = {
        "apikey": SUPABASE_KEY,
        "Authorization": f"Bearer {SUPABASE_KEY}",
        "Content-Type": "application/json",
        "Prefer": "return=representation"
    }
    
    # Get all IDs first
    get_resp = requests.get(f"{SUPABASE_URL}/rest/v1/cookie_sessions?select=id", headers=headers)
    if get_resp.status_code == 200:
        ids = [str(x['id']) for x in get_resp.json()]
        if ids:
            # Delete in batches or all at once? Query string might get too long.
            # Using a filter to delete all
            del_resp = requests.delete(f"{SUPABASE_URL}/rest/v1/cookie_sessions?id=neq.0", headers=headers)
            print(f"Deleted status: {del_resp.status_code}")
        else:
            print("Table already empty.")
    
    # 2. Insert the valid cookies from migration.sql (hardcoded here for simplicity)
    print("Inserting valid cookies from migration.sql...")
    
    cookies_1 = [{
        "name": "netflix-sans-normal-3-loaded", "path": "/", "value": "true", "domain": ".netflix.com", "secure": False, "session": False, "storeId": None, "hostOnly": False, "httpOnly": False, "sameSite": None, "expirationDate": 1777288991.732274
    }, {
        "name": "SecureNetflixId", "path": "/", "value": "v%3D3%26mac%3DAQEAEQABABSkftEib2gRw5kZBeKl134obWeet5inHUg.%26dt%3D1769512882382", "domain": ".netflix.com", "secure": True, "session": False, "storeId": None, "hostOnly": False, "httpOnly": True, "sameSite": "strict", "expirationDate": 1785064882.588209
    }, {
        "name": "NetflixId", "path": "/", "value": "v%3D3%26ct%3DBgjHlOvcAxKCA6Rcq08Mx1uboY9oFOOUa4zZXgVVCEUnkdoy0n1-35z1lxkSaQCYGSf5r85yAfKSCgSmlO7l2Wa502gHxrlPDziPVAJVfDhYsBNpsA4or-bXqZ22t9bUe_LfhRDiNcVC3jQwGr71z1yIDkFyRKBZPHAniqx5yC5wcHFjs4a1bAy_ej25JGDKWFpfY5dJOJ2WY2Vd8snuAwzHf23kjLTfjqRX9pZ7lnykByE0DZF4uOzuBuP2Fobz84dbHstvExMrzfRZ5VqkKaP0wAFA15QgG5UXHIgA8xUk6JnKqLrddkRAYvkjH1xN_gfl7j30r1dNCaiu6v8Fo4quyBTgtZs73iQSRHFISYfuzhJKzw8yhLMSIvjnFsVZZgprd9-KtJRLw4m3Y98z0iAQMista2CuQuP8t4RtR4Tpv3Esoj5TqpzETwqUOAXoaTjBybUNzC9Bl2UIYm4tjtOViyrlqd57awfh6T8sc73ZXzoKkzHzVC9LQF2K2X9Xej7HjrQSlEhyy7uIGAYiDgoMojdC5HS9WlgrlawA%26pg%3DZ3QNPN7EKBCMTGIZ6Y5LMTG4LA%26ch%3DAQEAEAABABRL18grBX5Bd6RBRLV2lyVRrCVKRBJOGD0.", "domain": ".netflix.com", "secure": True, "session": False, "storeId": None, "hostOnly": False, "httpOnly": True, "sameSite": "lax", "expirationDate": 1785064882.588366
    }]
    
    entry_1 = {
        "cookies": json.dumps(cookies_1),
        "description": "joshuaharris11@hotmail.co.uk | GB | TEST_VALID"
    }

    resp = requests.post(f"{SUPABASE_URL}/rest/v1/cookie_sessions", json=[entry_1], headers=headers)
    print(f"Insert status: {resp.status_code}")
    print(resp.text)

if __name__ == "__main__":
    restore_valid_cookies()
