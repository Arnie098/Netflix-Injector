import os
from supabase import create_client, Client
from dotenv import load_dotenv

load_dotenv()

# --- Injector Supabase (Licenses & Cookies) ---
url_inj: str = os.environ.get("INJECTOR_SUPABASE_URL")
key_inj: str = os.environ.get("INJECTOR_SUPABASE_KEY")

if not url_inj or not key_inj:
    raise ValueError("INJECTOR_SUPABASE credentials must be set in .env")

supabase_injector: Client = create_client(url_inj, key_inj)

# --- Audit Supabase (Extracted Credentials) ---
url_aud: str = os.environ.get("AUDIT_SUPABASE_URL")
key_aud: str = os.environ.get("AUDIT_SUPABASE_KEY")

if not url_aud or not key_aud:
    raise ValueError("AUDIT_SUPABASE credentials must be set in .env")

supabase_audit: Client = create_client(url_aud, key_aud)

# Legacy support (defaults to injector for other modules)
supabase: Client = supabase_injector
