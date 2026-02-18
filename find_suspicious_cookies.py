import asyncio
import json
import aiohttp
import re

SUPABASE_URL = "https://arslamcjzixeqmalscye.supabase.co"
SUPABASE_KEY = "sb_publishable_VDYPdce8BVPg_J9kzFgKpA_dYAfDcP4"

HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36",
}

async def check_suspicious(session, row):
    cookies_data = row.get('cookies')
    if not cookies_data: return None
    
    try:
        if isinstance(cookies_data, str):
            cookies_list = json.loads(cookies_data)
        else:
            cookies_list = cookies_data
            
        cookie_jar = aiohttp.CookieJar(unsafe=True)
        for c in cookies_list:
            cookie_jar.update_cookies({c['name']: c['value']})
        
        async with aiohttp.ClientSession(cookie_jar=cookie_jar, headers=HEADERS) as sess:
            async with sess.get("https://www.netflix.com/browse", timeout=15) as resp:
                html = (await resp.text()).lower()
                final_url = str(resp.url)
                
                # Keywords that might indicate a soft-block or verification wall
                suspicious_keywords = [
                    "verify", "identity", "phone", "email", "code", "confirm", 
                    "security", "unusual", "suspicious", "bot", "captcha",
                    "geoblock", "region", "not available", "household", "location"
                ]
                
                found = [k for k in suspicious_keywords if k in html]
                
                if found or "/verify" in final_url or "/security" in final_url:
                    return {
                        "desc": row.get('description'),
                        "url": final_url,
                        "keywords": found,
                        "html_len": len(html)
                    }
        return None
    except:
        return None

async def main():
    headers = {"apikey": SUPABASE_KEY, "Authorization": f"Bearer {SUPABASE_KEY}"}
    async with aiohttp.ClientSession(headers=headers) as session:
        async with session.get(f"{SUPABASE_URL}/rest/v1/cookie_sessions?select=*") as resp:
            rows = await resp.json()
            
    print(f"Loaded {len(rows)} cookies. Searching for suspicious WORKING cookies...")
    
    tasks = []
    for row in rows:
        tasks.append(check_suspicious(session, row))
        
    results = await asyncio.gather(*tasks)
    suspicious = [r for r in results if r]
    
    print(f"\nFound {len(suspicious)} cookies with suspicious indicators.")
    for s in suspicious[:20]: # Show first 20
        print(f"Target: {s['desc'][:40]}")
        print(f"  URL: {s['url']}")
        print(f"  Keywords: {', '.join(s['keywords'])}")
        print("-" * 20)

if __name__ == "__main__":
    asyncio.run(main())
