import asyncio
import json
import time
import aiohttp
from datetime import datetime

SUPABASE_URL = "https://arslamcjzixeqmalscye.supabase.co"
SUPABASE_KEY = "sb_publishable_VDYPdce8BVPg_J9kzFgKpA_dYAfDcP4"

HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8",
    "Upgrade-Insecure-Requests": "1",
}

CONCURRENCY = 10 # Adjust as needed

async def get_cookies_from_supabase():
    async with aiohttp.ClientSession() as session:
        headers = {
            "apikey": SUPABASE_KEY,
            "Authorization": f"Bearer {SUPABASE_KEY}",
            "Content-Type": "application/json"
        }
        print("Fetching cookies from Supabase...")
        async with session.get(f"{SUPABASE_URL}/rest/v1/cookie_sessions?select=*", headers=headers) as response:
            if response.status == 200:
                return await response.json()
            else:
                print(f"Error fetching cookies: {response.status}")
                return []

async def validate_cookie(session, session_data):
    try:
        cookies_data = session_data.get('cookies')
        description = session_data.get('description', 'No Description')
        
        if not cookies_data:
            return False, "No cookie data", description

        if isinstance(cookies_data, str):
            try:
                cookies_list = json.loads(cookies_data)
            except json.JSONDecodeError:
                return False, "JSON Decode Error", description
        elif isinstance(cookies_data, list):
            cookies_list = cookies_data
        else:
            return False, f"Unexpected type: {type(cookies_data)}", description
        
        # Prepare cookies for aiohttp properly using a CookieJar or passing to request
        # Explicit dict is often safer for simple GET, but let's ensure we handle domains
        cookie_dict = {}
        for cookie in cookies_list:
             cookie_dict[cookie['name']] = cookie['value']

        # Make request
        try:
            # Using a custom timeout and following redirects
            # aiohttp.ClientSession handles cookies naturally if passed to .get()
            async with session.get(
                "https://www.netflix.com/browse", 
                cookies=cookie_dict, 
                headers=HEADERS, 
                timeout=aiohttp.ClientTimeout(total=20), 
                allow_redirects=True
            ) as response:
                final_url = str(response.url)
                html = (await response.text()).lower()
                
                # Strict Usability Checks
                if "/login" in final_url:
                    return False, "Redirected to login", description
                
                # Check for Hold/Payment indicators
                if "update your payment" in html or "account on hold" in html or ("/member" in final_url and ("update" in html or "payment" in html)):
                    return False, "False Positive: Account on Hold / Payment Update", description
                
                # Check for Household indicators
                if "household" in html or "primary location" in html or "geoblock" in html:
                    return False, "False Positive: Household Verification", description
                
                # Check for Plan indicators
                if "choose your plan" in html or "planselection" in final_url:
                    return False, "False Positive: No Plan Selected", description

                if "/browse" in final_url:
                    return True, "Active (/browse)", description
                elif "/profiles" in final_url:
                    return True, "Active (/profiles)", description
                elif "/YourAccount" in final_url:
                    return True, "Active (/YourAccount)", description
                elif "/member" in final_url:
                    return True, "Active (/member)", description
                else:
                    return False, f"Unknown State: {final_url}", description
                
        except Exception as e:
            err_type = type(e).__name__
            return False, f"Request Error ({err_type}): {str(e)}", description

    except Exception as e:
        return False, f"Parse Error: {str(e)}", description

async def worker(queue, results):
    async with aiohttp.ClientSession() as session:
        while True:
            item = await queue.get()
            try:
                index, total, data = item
                is_valid, msg, desc = await validate_cookie(session, data)
                
                results.append({
                    "valid": is_valid,
                    "msg": msg,
                    "desc": desc,
                    "data": data
                })
                
                status_color = "\033[92mWORKING\033[0m" if is_valid else "\033[91mNOT WORKING\033[0m"
                print(f"[{index}/{total}] {status_color} {desc[:40]}... : {msg}")
                
            finally:
                queue.task_done()

async def main():
    sessions = await get_cookies_from_supabase()
    if not sessions:
        print("No sessions to check.")
        return

    print(f"Found {len(sessions)} sessions to validate with concurrency {CONCURRENCY}.")
    
    queue = asyncio.Queue()
    results = []
    
    # Enqueue items
    for i, sess in enumerate(sessions):
        queue.put_nowait((i+1, len(sessions), sess))
        
    # Start workers
    workers = []
    for _ in range(CONCURRENCY):
        task = asyncio.create_task(worker(queue, results))
        workers.append(task)
        
    await queue.join()
    
    # Cancel workers
    for task in workers:
        task.cancel()
    await asyncio.gather(*workers, return_exceptions=True)
    
    # Process results
    working = [r for r in results if r['valid']]
    not_working = [r for r in results if not r['valid']]
    
    # Save to files
    with open("working_cookies.txt", "w", encoding="utf-8") as f:
        for w in working:
            f.write(f"Description: {w['desc']} | Msg: {w['msg']}\n")
            # Optionally write the cookie JSON too? 
            # f.write(json.dumps(w['data']) + "\n")
            
    with open("invalid_cookies.txt", "w", encoding="utf-8") as f:
        for nw in not_working:
            f.write(f"Description: {nw['desc']} | Msg: {nw['msg']}\n")

    print("=" * 40)
    print(f"Total: {len(sessions)}")
    print(f"Working: {len(working)}")
    print(f"Not Working: {len(not_working)}")
    print("Results saved to 'working_cookies.txt' and 'invalid_cookies.txt'")

if __name__ == "__main__":
    asyncio.run(main())
