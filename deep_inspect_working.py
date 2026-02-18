import requests
import json
import time

SUPABASE_URL = "https://arslamcjzixeqmalscye.supabase.co"
SUPABASE_KEY = "sb_publishable_VDYPdce8BVPg_J9kzFgKpA_dYAfDcP4"

EMAILS_TO_CHECK = [
    "grodv1965",
    "priyasamvar.pr",
    "muskangupta2880",
    "sachinrerapanday",
    "e.schootemeijer",
    "c-orina",
    "qhuzairiazizi",
    "qurratukunie",
    "emailsyarifudin13",
    "ubieeraw",
    "mutiasaridewi59",
    "flavinha92street"
]

HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36",
}

def deep_inspect(sess):
    cookies_data = sess.get('cookies')
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
        resp = s.get("https://www.netflix.com/browse", timeout=15)
        html = resp.text.lower()
        
        findings = []
        if "household" in html: findings.append("HOUSEHOLD mentioned")
        if "primary location" in html: findings.append("PRIMARY LOCATION mentioned")
        if "update your payment" in html: findings.append("PAYMENT UPDATE mentioned")
        if "account on hold" in html: findings.append("ACCOUNT ON HOLD mentioned")
        if "choose your plan" in html: findings.append("CHOOSE PLAN mentioned")
        if "profiles" in resp.url: findings.append("Redirected to PROFILES")
        if "/browse" in resp.url: findings.append("Landed on BROWSE")
        
        # Check if we can see profile names in HTML
        profile_matches = len(re.findall(r'profile-name', html))
        if profile_matches > 0:
            findings.append(f"Found {profile_matches} profile indicators")
            
        return {
            "url": resp.url,
            "findings": findings,
            "html_sample": resp.text[:1000] # For manual review if needed
        }
    except Exception as e:
        return {"error": str(e)}

import re

def main():
    headers = {"apikey": SUPABASE_KEY, "Authorization": f"Bearer {SUPABASE_KEY}"}
    print(f"Deep inspecting {len(EMAILS_TO_CHECK)} 'Working' sessions...")
    
    for email in EMAILS_TO_CHECK:
        # Fetch session by description match (more robust)
        url = f"{SUPABASE_URL}/rest/v1/cookie_sessions?description=ilike.*{email}*&select=*"
        resp = requests.get(url, headers=headers)
        data = resp.json()
        if not data:
            print(f"Could not find session for {email}")
            continue
            
        sess = data[0]
        desc = sess.get('description', 'Unknown')
        print(f"\nTargeting: {desc}")
        result = deep_inspect(sess)
        if "error" in result:
            print(f"  Error: {result['error']}")
        else:
            print(f"  Final URL: {result['url']}")
            print(f"  Indicators: {', '.join(result['findings']) if result['findings'] else 'NONE'}")
            
if __name__ == "__main__":
    main()
