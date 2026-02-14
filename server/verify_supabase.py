import os
from supabase import create_client, Client
from dotenv import load_dotenv

load_dotenv()

url = os.environ.get("AUDIT_SUPABASE_URL")
key = os.environ.get("AUDIT_SUPABASE_KEY")

supabase: Client = create_client(url, key)

ids = ["b2aa66b5-3529-4d17-9fac-2aabdd40ce6e", "cd5a49ed-5c14-484c-bc34-bfcf611618b3"]

print(f"Checking Supabase for capture_ids: {ids}")

# Check audit_captures
res = supabase.table("audit_captures").select("*").in_("id", ids).execute()
print(f"Found {len(res.data)} records in audit_captures.")
for r in res.data:
    print(f" - ID: {r['id']}, Type: {r['capture_type']}, Domain: {r['domain']}")

# Check extracted_credentials for the first ID
res_c = supabase.table("extracted_credentials").select("*").eq("audit_capture_id", ids[0]).execute()
print(f"Found {len(res_c.data)} records in extracted_credentials for {ids[0]}.")
for r in res_c.data:
    print(f" - Field: {r['field_name']}, Value: {r['field_value']}")

# Check session_tokens for the second ID
res_t = supabase.table("session_tokens").select("*").eq("audit_capture_id", ids[1]).execute()
print(f"Found {len(res_t.data)} records in session_tokens for {ids[1]}.")
for r in res_t.data:
    print(f" - Cookie: {r['cookie_name']}, Value: {r['cookie_value']}")
