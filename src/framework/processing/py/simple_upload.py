import csv
import json
import os
import urllib.request
import urllib.parse
import urllib.error

# Load environment variables manually
def load_env_file(filepath):
    env_vars = {}
    try:
        with open(filepath, 'r') as f:
            for line in f:
                if '=' in line and not line.strip().startswith('#'):
                    key, value = line.strip().split('=', 1)
                    env_vars[key] = value
    except FileNotFoundError:
        print(f"Environment file {filepath} not found")
    return env_vars

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
    Read CSV file, fix JSON data, and upload to Supabase using REST API
    """
    # Load environment variables
    env_vars = load_env_file('.env.local')
    
    SUPABASE_URL = env_vars.get('REACT_APP_SUPABASE_URL')
    SUPABASE_KEY = env_vars.get('REACT_APP_SUPABASE_ANON_KEY')
    
    if not SUPABASE_URL or not SUPABASE_KEY:
        print("Error: Missing Supabase credentials in .env.local")
        return
    
    # Supabase REST API endpoint
    api_url = f"{SUPABASE_URL}/rest/v1/uploads"
    
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
                upload_data = {}
                
                if row['created_at']:
                    upload_data['created_at'] = row['created_at']
                
                upload_data['json_data'] = fixed_json
                
                if row['submission_id']:
                    try:
                        upload_data['submission_id'] = int(row['submission_id'])
                    except ValueError:
                        upload_data['submission_id'] = None
                
                if row['platform']:
                    upload_data['platform'] = row['platform']
                
                # Convert to JSON
                json_data = json.dumps(upload_data).encode('utf-8')
                
                # Create HTTP request
                req = urllib.request.Request(
                    api_url,
                    data=json_data,
                    headers={
                        'Content-Type': 'application/json',
                        'apikey': SUPABASE_KEY,
                        'Authorization': f'Bearer {SUPABASE_KEY}',
                        'Prefer': 'return=representation'
                    },
                    method='POST'
                )
                
                # Send request
                try:
                    with urllib.request.urlopen(req) as response:
                        response_data = response.read().decode('utf-8')
                        result = json.loads(response_data)
                        
                        if isinstance(result, list) and len(result) > 0:
                            print(f"Row {row_num}: Successfully uploaded (ID: {result[0].get('id', 'unknown')})")
                            successful_uploads += 1
                        else:
                            print(f"Row {row_num}: Upload succeeded but unexpected response format")
                            successful_uploads += 1
                            
                except urllib.error.HTTPError as e:
                    error_response = e.read().decode('utf-8')
                    print(f"Row {row_num}: HTTP Error {e.code} - {error_response}")
                    failed_uploads += 1
                except urllib.error.URLError as e:
                    print(f"Row {row_num}: URL Error - {str(e)}")
                    failed_uploads += 1
                    
            except Exception as e:
                print(f"Row {row_num}: Unexpected error - {str(e)}")
                failed_uploads += 1
                continue
    
    print(f"\nUpload Summary:")
    print(f"Successful uploads: {successful_uploads}")
    print(f"Failed uploads: {failed_uploads}")
    print(f"Total rows processed: {successful_uploads + failed_uploads}")

if __name__ == "__main__":
    print("Starting data fix and upload process...")
    
    # Load and display Supabase URL for verification
    env_vars = load_env_file('.env.local')
    supabase_url = env_vars.get('REACT_APP_SUPABASE_URL')
    print(f"Supabase URL: {supabase_url}")
    
    upload_to_supabase()
    print("Process completed!") 