import asyncio
import json
import aiohttp
import re

SUPABASE_URL = "https://arslamcjzixeqmalscye.supabase.co"
SUPABASE_KEY = "sb_publishable_VDYPdce8BVPg_J9kzFgKpA_dYAfDcP4"

HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36",
}

async def inspect_working(session, row):
    cookies_data = row.get('cookies')
    if not cookies_data: return None
    
    try:
        cookies_list = json.loads(cookies_data) if isinstance(cookies_data, str) else cookies_data
        cookie_jar = aiohttp.CookieJar(unsafe=True)
        for c in cookies_list:
            cookie_jar.update_cookies({c['name']: c['value']})
        
        async with aiohttp.ClientSession(cookie_jar=cookie_jar, headers=HEADERS) as sess:
            async with sess.get("https://www.netflix.com/browse", timeout=12) as resp:
                final_url = str(resp.url)
                if not any(x in final_url for x in ["/browse", "/profiles", "/YourAccount"]):
                    return None # Not working
                
                html = (await resp.text()).lower()
                
                # Check for subtle blocks on the browse page
                indicators = {
                    "HOUSEHOLD": "household",
                    "PRIMARY_LOCATION": "primary location",
                    "PAYMENT_ISSUE": "update your payment",
                    "ACCOUNT_HOLD": "account on hold",
                    "PLAN_SELECTION": "choose your plan",
                    "VERIFY_AGE": "verify your age",
                    "PIN_REQUIRED": "enter your pin"
                }
                
                found = {k: v for k, v in indicators.items() if v in html}
                
                if found:
                    return {
                        "desc": row.get('description'),
                        "url": final_url,
                        "found": found
                    }
        return None
    except:
        return None

async def main():
    headers = {"apikey": SUPABASE_KEY, "Authorization": f"Bearer {SUPABASE_KEY}"}
    async with aiohttp.ClientSession(headers=headers) as session:
        async with session.get(f"{SUPABASE_URL}/rest/v1/cookie_sessions?select=*") as resp:
            rows = await resp.json()
            
    print(f"Inspecting {len(rows)} cookies for hidden blocks in 'Working' sessions...")
    
    tasks = [inspect_working(None, row) for row in rows]
    results = await asyncio.gather(*tasks)
    false_positives = [r for r in results if r]
    
    if not false_positives:
        print("No hidden blocks found in any 'Working' sessions.")
    else:
        print(f"\nFound {len(false_positives)} False Positives (Working but Blocked):")
        for fp in false_positives:
            print(f"Target: {fp['desc'][:40]}")
            print(f"  URL: {fp['url']}")
            print(f"  Issues: {', '.join(fp['found'].keys())}")
            print("-" * 20)

if __name__ == "__main__":
    asyncio.run(main())
