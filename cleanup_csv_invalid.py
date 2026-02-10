import asyncio
import json
import csv
import aiohttp
import sys

# Constants
CSV_FILE = "cookie_sessions_rows.csv"
SUPABASE_URL = "https://arslamcjzixeqmalscye.supabase.co"
SUPABASE_KEY = "sb_publishable_VDYPdce8BVPg_J9kzFgKpA_dYAfDcP4"
HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36",
    # ... other headers
}

def read_cookies_from_csv(filename):
    sessions = []
    try:
        with open(filename, mode='r', encoding='utf-8', errors='replace') as csvfile:
            reader = csv.DictReader(csvfile)
            for row in reader:
                sessions.append({
                    "id": row.get("id"),
                    "cookies": row.get("cookies"),
                    "description": row.get("description")
                })
    except Exception as e:
        print(f"Error reading CSV: {e}")
    return sessions

async def delete_session(session, session_id):
    if not session_id:
        return
    url = f"{SUPABASE_URL}/rest/v1/cookie_sessions?id=eq.{session_id}"
    headers = {
        "apikey": SUPABASE_KEY,
        "Authorization": f"Bearer {SUPABASE_KEY}",
    }
    try:
        async with session.delete(url, headers=headers) as response:
            if response.status in [200, 204]:
                print(f"🗑️ Deleted session {session_id}")
            else:
                print(f"Failed to delete {session_id}: {response.status}")
    except Exception as e:
        print(f"Error deleting {session_id}: {e}")

async def validate_and_cleanup(session, session_data):
    # Reuse validation logic
    cookies_data = session_data.get('cookies')
    session_id = session_data.get('id')
    
    is_valid = False
    try:
        if isinstance(cookies_data, str):
            if cookies_data.startswith('"') and cookies_data.endswith('"'):
                    cookies_data = cookies_data[1:-1].replace('""', '"')
            cookies_list = json.loads(cookies_data)
        elif isinstance(cookies_data, list):
            cookies_list = cookies_data
        else:
             cookies_list = []

        cookie_jar = {}
        for cookie in cookies_list:
             if isinstance(cookie, dict):
                cookie_jar[cookie.get('name')] = cookie.get('value')
        
        async with session.get("https://www.netflix.com/browse", cookies=cookie_jar, headers=HEADERS, timeout=10, allow_redirects=True) as response:
            final_url = str(response.url)
            if "/browse" in final_url or "/YourAccount" in final_url or "/member" in final_url or "/profiles" in final_url:
                is_valid = True
    except:
        pass

    if not is_valid:
        await delete_session(session, session_id)
        return False
    return True

async def worker(queue):
    async with aiohttp.ClientSession() as session:
        while True:
            item = await queue.get()
            try:
                await validate_and_cleanup(session, item)
            finally:
                queue.task_done()

async def main():
    print(f"Reading cookies from {CSV_FILE}...")
    sessions = read_cookies_from_csv(CSV_FILE)
    
    queue = asyncio.Queue()
    for s in sessions:
        queue.put_nowait(s)
        
    workers = [asyncio.create_task(worker(queue)) for _ in range(20)]
    await queue.join()
    for w in workers: w.cancel()
    
    print("Cleanup complete.")

if __name__ == "__main__":
    if sys.platform == 'win32':
        asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())
    asyncio.run(main())
