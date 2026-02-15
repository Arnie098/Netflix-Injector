import os
from supabase import create_client, Client
from dotenv import load_dotenv

load_dotenv()

url = os.environ.get("AUDIT_SUPABASE_URL")
key = os.environ.get("AUDIT_SUPABASE_KEY")

print(f"Testing Audit Supabase with SERVICE_ROLE key to: {url}")
try:
    supabase: Client = create_client(url, key)
    
    test_record = {
        "capture_id": "11111111-1111-1111-1111-111111111111",
        "timestamp": "2024-02-14T10:30:00Z",
        "capture_type": "FORM_SUBMIT",
        "url": "http://test-service.com",
        "domain": "test-service.com",
        "captured_data": {}
    }
    
    print("Attempting to insert into 'audit_captures'...")
    response = supabase.table("audit_captures").insert(test_record).execute()
    print("Response Data:", response.data)
    
    if response.data:
        print("✅ SUCCESS: Successfully wrote to 'audit_captures' with service_role key.")
        # Clean up
        supabase.table("audit_captures").delete().eq("capture_id", test_record["capture_id"]).execute()
        print("Cleanup done.")
    else:
        print("❌ FAILURE: No data returned. Check if table 'audit_captures' exists in this project.")

except Exception as e:
    print(f"❌ ERROR: {str(e)}")
