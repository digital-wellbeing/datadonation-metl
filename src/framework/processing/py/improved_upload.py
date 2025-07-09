import csv
import json
import os
import urllib.request
import urllib.parse
import urllib.error
import re

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
    Advanced JSON fixing to handle truncated and malformed JSON strings
    """
    if not json_string:
        return None
    
    original_string = json_string
    
    # Remove leading and trailing quotes if they exist
    if json_string.startswith('"') and json_string.endswith('"'):
        json_string = json_string[1:-1]
    
    # Unescape double quotes
    json_string = json_string.replace('""', '"')
    
    # Try to parse as-is first
    try:
        parsed = json.loads(json_string)
        return parsed
    except json.JSONDecodeError as e:
        print(f"Initial JSON parse failed: {e}")
        
        # Try to fix common issues
        fixed_string = json_string
        
        # 1. Try to detect and fix truncated JSON
        if "Unterminated string" in str(e):
            print("Attempting to fix unterminated string...")
            
            # Find the last complete object/array and truncate there
            bracket_count = 0
            brace_count = 0
            in_string = False
            escape_next = False
            last_complete_pos = -1
            
            for i, char in enumerate(fixed_string):
                if escape_next:
                    escape_next = False
                    continue
                    
                if char == '\\':
                    escape_next = True
                    continue
                    
                if char == '"' and not escape_next:
                    in_string = not in_string
                    continue
                    
                if not in_string:
                    if char == '[':
                        bracket_count += 1
                    elif char == ']':
                        bracket_count -= 1
                    elif char == '{':
                        brace_count += 1
                    elif char == '}':
                        brace_count -= 1
                    
                    # Check if we have a complete structure
                    if bracket_count == 0 and brace_count == 0:
                        last_complete_pos = i + 1
            
            if last_complete_pos > 0:
                fixed_string = fixed_string[:last_complete_pos]
                print(f"Truncated to position {last_complete_pos}")
        
        # 2. Fix common property name issues
        elif "Expecting property name" in str(e):
            print("Attempting to fix property name issues...")
            # Try to fix unquoted property names
            fixed_string = re.sub(r'([{,]\s*)([a-zA-Z_][a-zA-Z0-9_]*)\s*:', r'\1"\2":', fixed_string)
        
        # 3. Fix trailing commas
        fixed_string = re.sub(r',\s*([}\]])', r'\1', fixed_string)
        
        # 4. Fix missing commas between objects
        fixed_string = re.sub(r'}\s*{', '},{', fixed_string)
        fixed_string = re.sub(r']\s*\[', '],[', fixed_string)
        
        # Try parsing the fixed string
        try:
            parsed = json.loads(fixed_string)
            print("Successfully fixed JSON!")
            return parsed
        except json.JSONDecodeError as e2:
            print(f"Could not fix JSON: {e2}")
            
            # Last resort: try to extract whatever valid JSON we can
            print("Attempting last resort parsing...")
            
            # Try to find and extract the first complete JSON array or object
            for start_char, end_char in [('[', ']'), ('{', '}')]:
                start_idx = fixed_string.find(start_char)
                if start_idx >= 0:
                    # Find the matching closing bracket/brace
                    count = 0
                    in_string = False
                    escape_next = False
                    
                    for i in range(start_idx, len(fixed_string)):
                        char = fixed_string[i]
                        
                        if escape_next:
                            escape_next = False
                            continue
                            
                        if char == '\\':
                            escape_next = True
                            continue
                            
                        if char == '"' and not escape_next:
                            in_string = not in_string
                            continue
                            
                        if not in_string:
                            if char == start_char:
                                count += 1
                            elif char == end_char:
                                count -= 1
                                
                            if count == 0 and i > start_idx:
                                try_string = fixed_string[start_idx:i+1]
                                try:
                                    parsed = json.loads(try_string)
                                    print(f"Successfully extracted valid JSON from position {start_idx} to {i+1}")
                                    return parsed
                                except:
                                    continue
            
            # If all else fails, return a minimal valid structure
            print("Creating minimal fallback structure...")
            return [{"error": "Could not parse original JSON", "original_length": len(original_string)}]

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
    fallback_uploads = 0
    
    with open('uploads_rows.csv', 'r', encoding='utf-8') as file:
        csv_reader = csv.DictReader(file)
        
        for row_num, row in enumerate(csv_reader, start=2):  # Start at 2 because row 1 is header
            try:
                # Fix the JSON data
                fixed_json = fix_json_data(row['json_data'])
                
                if fixed_json is None:
                    print(f"Row {row_num}: Skipping due to completely invalid JSON")
                    failed_uploads += 1
                    continue
                
                # Check if this is a fallback structure
                is_fallback = (isinstance(fixed_json, list) and len(fixed_json) == 1 and 
                             isinstance(fixed_json[0], dict) and "error" in fixed_json[0])
                
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
                            upload_id = result[0].get('id', 'unknown')
                            if is_fallback:
                                print(f"Row {row_num}: Uploaded with fallback data (ID: {upload_id}) - REVIEW NEEDED")
                                fallback_uploads += 1
                            else:
                                print(f"Row {row_num}: Successfully uploaded (ID: {upload_id})")
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
    print(f"Fallback uploads (review needed): {fallback_uploads}")
    print(f"Failed uploads: {failed_uploads}")
    print(f"Total rows processed: {successful_uploads + fallback_uploads + failed_uploads}")

if __name__ == "__main__":
    print("Starting improved data fix and upload process...")
    
    # Load and display Supabase URL for verification
    env_vars = load_env_file('.env.local')
    supabase_url = env_vars.get('REACT_APP_SUPABASE_URL')
    print(f"Supabase URL: {supabase_url}")
    
    upload_to_supabase()
    print("Process completed!") 