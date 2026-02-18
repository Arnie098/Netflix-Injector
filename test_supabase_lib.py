import os
from supabase import create_client, Client
from dotenv import load_dotenv

load_dotenv(os.path.join("server", ".env"))

url = os.environ.get("INJECTOR_SUPABASE_URL")
key = os.environ.get("INJECTOR_SUPABASE_KEY")

print(f"Connecting to: {url}")
print(f"Key Prefix: {key[:15]}...")

try:
    supabase: Client = create_client(url, key)
    # Try a simple select
    res = supabase.table("licenses").select("count", count="exact").limit(1).execute()
    print(f"✅ Success! Licenses count: {res.count}")
except Exception as e:
    print(f"❌ Error: {e}")
