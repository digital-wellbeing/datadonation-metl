import csv
import json
import os
from supabase import create_client, Client
from dotenv import load_dotenv

# Load environment variables
load_dotenv('.env.local')

# Supabase credentials
SUPABASE_URL = os.getenv('REACT_APP_SUPABASE_URL')
SUPABASE_KEY = os.getenv('REACT_APP_SUPABASE_ANON_KEY')

def fix_json_data(json_string):
    """
    Fix the JSON data by removing outer quotes and unescaping double quotes
    """
    if not json_string:
        return None
    
    # Remove leading and trailing quotes if they exist
    if json_string.startswith('"') and json_string.endswith('"'):
        json_string = json_string[1:-1]
    
    # Unescape double quotes
    json_string = json_string.replace('""', '"')
    
    try:
        # Validate that it's proper JSON
        parsed = json.loads(json_string)
        return parsed
    except json.JSONDecodeError as e:
        print(f"JSON decode error: {e}")
        print(f"Problematic JSON: {json_string[:200]}...")
        return None

def upload_to_supabase():
    """
    Read CSV file, fix JSON data, and upload to Supabase
    """
    # Initialize Supabase client
    supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)
    
    successful_uploads = 0
    failed_uploads = 0
    
    with open('uploads_rows.csv', 'r', encoding='utf-8') as file:
        csv_reader = csv.DictReader(file)
        
        for row_num, row in enumerate(csv_reader, start=2):  # Start at 2 because row 1 is header
            try:
                # Fix the JSON data
                fixed_json = fix_json_data(row['json_data'])
                
                if fixed_json is None:
                    print(f"Row {row_num}: Skipping due to invalid JSON")
                    failed_uploads += 1
                    continue
                
                # Prepare the data for upload
                upload_data = {
                    'created_at': row['created_at'] if row['created_at'] else None,
                    'json_data': fixed_json,
                    'submission_id': int(row['submission_id']) if row['submission_id'] else None,
                    'platform': row['platform'] if row['platform'] else None
                }
                
                # Remove None values
                upload_data = {k: v for k, v in upload_data.items() if v is not None}
                
                # Insert into Supabase
                result = supabase.table('uploads').insert(upload_data).execute()
                
                if result.data:
                    print(f"Row {row_num}: Successfully uploaded (ID: {result.data[0]['id']})")
                    successful_uploads += 1
                else:
                    print(f"Row {row_num}: Upload failed - no data returned")
                    failed_uploads += 1
                    
            except Exception as e:
                print(f"Row {row_num}: Error - {str(e)}")
                failed_uploads += 1
                continue
    
    print(f"\nUpload Summary:")
    print(f"Successful uploads: {successful_uploads}")
    print(f"Failed uploads: {failed_uploads}")
    print(f"Total rows processed: {successful_uploads + failed_uploads}")

if __name__ == "__main__":
    print("Starting data fix and upload process...")
    print(f"Supabase URL: {SUPABASE_URL}")
    
    if not SUPABASE_URL or not SUPABASE_KEY:
        print("Error: Missing Supabase credentials in .env.local")
        exit(1)
    
    upload_to_supabase()
    print("Process completed!") 