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

CONCURRENCY = 10 

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

async def delete_cookie_from_supabase(session, cookie_id):
    headers = {
        "apikey": SUPABASE_KEY,
        "Authorization": f"Bearer {SUPABASE_KEY}",
        "Content-Type": "application/json",
        "Prefer": "return=minimal"
    }
    async with session.delete(f"{SUPABASE_URL}/rest/v1/cookie_sessions?id=eq.{cookie_id}", headers=headers) as response:
        return response.status in [200, 204]

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
        
        cookie_jar = {}
        for cookie in cookies_list:
             cookie_jar[cookie['name']] = cookie['value']

        try:
            async with session.get("https://www.netflix.com/browse", cookies=cookie_jar, headers=HEADERS, timeout=15, allow_redirects=True) as response:
                final_url = str(response.url)
                
                if "/browse" in final_url:
                    return True, "Active (/browse)", description
                elif "/login" in final_url:
                    return False, "Redirected to login", description
                elif "/YourAccount" in final_url:
                    return True, "Active (/YourAccount)", description
                elif "/member" in final_url:
                    return True, "Active (Hold/Member)", description
                else:
                    return False, f"Unknown State: {final_url}", description
                
        except Exception as e:
            return False, f"Request Error: {str(e)}", description

    except Exception as e:
        return False, f"Parse Error: {str(e)}", description

async def worker(queue, delete_queue):
    async with aiohttp.ClientSession() as session:
        while True:
            item = await queue.get()
            try:
                index, total, data = item
                is_valid, msg, desc = await validate_cookie(session, data)
                
                if is_valid:
                    print(f"\033[92m[KEEP]\033[0m {desc[:40]}...")
                else:
                    print(f"\033[91m[DELETE]\033[0m {desc[:40]}... Reason: {msg}")
                    # Add to delete queue
                    delete_queue.put_nowait(data['id'])
                
            finally:
                queue.task_done()

async def deleter(delete_queue, deleted_count):
    async with aiohttp.ClientSession() as session:
        while True:
            cookie_id = await delete_queue.get()
            try:
                success = await delete_cookie_from_supabase(session, cookie_id)
                if success:
                    print(f"  -> Deleted ID: {cookie_id}")
                    deleted_count['count'] += 1
                else:
                    print(f"  -> Failed to delete ID: {cookie_id}")
            finally:
                delete_queue.task_done()

async def main():
    sessions = await get_cookies_from_supabase()
    if not sessions:
        print("No sessions to check.")
        return

    print(f"Found {len(sessions)} sessions to validate and clean up.")
    
    queue = asyncio.Queue()
    delete_queue = asyncio.Queue()
    deleted_count = {'count': 0}
    
    # Enqueue items
    for i, sess in enumerate(sessions):
        queue.put_nowait((i+1, len(sessions), sess))
        
    # Start validation workers
    workers = []
    for _ in range(CONCURRENCY):
        task = asyncio.create_task(worker(queue, delete_queue))
        workers.append(task)
        
    # Start deleter worker
    deleter_task = asyncio.create_task(deleter(delete_queue, deleted_count))
    
    await queue.join()
    
    # Wait for deletion to finish
    await delete_queue.join()
    
    # Cancel workers
    for task in workers:
        task.cancel()
    deleter_task.cancel()
    
    print("=" * 40)
    print(f"Cleanup Complete.")
    print(f"Deleted {deleted_count['count']} invalid sessions.")

if __name__ == "__main__":
    asyncio.run(main())
