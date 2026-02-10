import json
import re

INPUT_FILE = r"c:\Users\Admin\Downloads\NETFLIX_INJECTOR\NETFLIX_INJECTOR\newcookies.txt"
OUTPUT_FILE = r"c:\Users\Admin\Downloads\NETFLIX_INJECTOR\NETFLIX_INJECTOR\insert_new_cookies.sql"

def parse_cookies():
    entries = []
    
    with open(INPUT_FILE, 'r', encoding='utf-8') as f:
        lines = f.readlines()

    id_counter = 1000 # Start IDs from 1000 to avoid conflicts with existing manual entries if any

    sql_header = "INSERT INTO public.cookie_sessions (cookies, description)\nVALUES\n"
    sql_values = []

    for line in lines:
        line = line.strip()
        if not line:
            continue

        # Format: NetflixId=... | EMAIL:... | ... | COUNTRY:XX | ...
        # Regex to extract NetflixId value and Email and Country
        netflix_id_match = re.search(r'NetflixId=(.*?)(?=\s\|)', line)
        email_match = re.search(r'\|\sEMAIL:(.*?)(?=\s\|)', line)
        country_match = re.search(r'\|\sCOUNTRY:(.*?)(?=\s\|)', line)

        if netflix_id_match and email_match:
            netflix_id_value = netflix_id_match.group(1)
            email = email_match.group(1).strip()
            country = country_match.group(1).strip() if country_match else None
            
            # Construct JSON cookie object
            cookie_obj = {
                "name": "NetflixId",
                "value": netflix_id_value,
                "domain": ".netflix.com",
                "path": "/",
                "secure": True,
                "httpOnly": True,
                "sameSite": "Lax",
                "expirationDate": 2147483647, # far future
                "session": False
            }
            
            # Encapsulate in array as per schema expectation
            cookies_json = json.dumps([cookie_obj])
            
            # Escape single quotes for SQL
            cookies_json_sql = cookies_json.replace("'", "''")
            email_sql = email.replace("'", "''")
            
            description = f"{email} | {country}" if country else email
            description_sql = description.replace("'", "''")
            
            # Value entry checks
            value_entry = f"('{cookies_json_sql}', '{description_sql}')"
            
            sql_values.append(value_entry)
            
            id_counter += 1

    if sql_values:
        full_sql = sql_header + ",\n".join(sql_values) + ";"
        
        with open(OUTPUT_FILE, 'w', encoding='utf-8') as f:
            f.write(full_sql)
            
        print(f"Successfully generated SQL for {len(sql_values)} cookies.")
    else:
        print("No valid cookie lines found.")

if __name__ == "__main__":
    parse_cookies()
