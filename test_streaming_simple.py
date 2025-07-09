#!/usr/bin/env python3
"""
Standalone test for streaming array counting without external dependencies
"""

import json
import re
import os

def debug_log(msg):
    print(f"[DEBUG] {msg}")

def count_streaming_array(file_path, array_path):
    """
    Count items in a JSON array without loading the entire file into memory
    array_path: dot-separated path like "Post.Posts.VideoList"
    """
    
    # Convert dot notation to nested keys
    keys = array_path.split('.')
    
    # Find the array start position
    array_start = find_array_start(file_path, keys)
    if array_start == -1:
        return 0
    
    # Count items in the array
    return count_items_in_array(file_path, array_start)

def find_array_start(file_path, keys):
    """Find the byte position where the target array starts"""
    
    # Build regex pattern to find the nested structure
    pattern_parts = []
    for i, key in enumerate(keys):
        if i == len(keys) - 1:
            # Last key should be followed by an array
            pattern_parts.append(f'"{re.escape(key)}"\\s*:\\s*\\[')
        else:
            # Intermediate keys should be followed by an object
            pattern_parts.append(f'"{re.escape(key)}"\\s*:\\s*{{')
    
    # For nested structures, we need to find the final array pattern
    final_pattern = f'"{re.escape(keys[-1])}"\\s*:\\s*\\['
    
    chunk_size = 1024 * 1024  # 1MB chunks
    overlap = 1024  # Overlap between chunks
    
    with open(file_path, 'r', encoding='utf-8') as file:
        position = 0
        prev_chunk_end = ""
        
        while True:
            chunk = file.read(chunk_size)
            if not chunk:
                break
                
            # Combine with previous chunk overlap
            search_text = prev_chunk_end + chunk
            
            # Search for the pattern
            match = re.search(final_pattern, search_text)
            if match:
                # Found the array start
                array_start = position + match.end() - len(prev_chunk_end)
                return array_start
            
            # Prepare for next iteration
            prev_chunk_end = search_text[-overlap:] if len(search_text) > overlap else search_text
            position += len(chunk)
    
    return -1

def count_items_in_array(file_path, start_pos):
    """Count items in JSON array starting from start_pos"""
    
    with open(file_path, 'r', encoding='utf-8') as file:
        file.seek(start_pos)
        
        bracket_count = 0
        brace_count = 0
        in_string = False
        escaped = False
        item_count = 0
        buffer = ""
        
        # Process character by character
        while True:
            char = file.read(1)
            if not char:
                break
                
            if escaped:
                escaped = False
                continue
                
            if char == '\\' and in_string:
                escaped = True
                continue
                
            if char == '"' and not escaped:
                in_string = not in_string
                continue
                
            if in_string:
                continue
                
            if char == '[':
                bracket_count += 1
            elif char == ']':
                bracket_count -= 1
                if bracket_count == 0:
                    # End of main array
                    break
            elif char == '{':
                brace_count += 1
            elif char == '}':
                brace_count -= 1
                if brace_count == 0 and bracket_count == 1:
                    # End of an item in the array
                    item_count += 1
                    if item_count % 10000 == 0:
                        debug_log(f"Processed {item_count} items...")
            elif char == ',' and bracket_count == 1 and brace_count == 0:
                # Comma at array level - might be between items
                continue
    
    return item_count

def test_streaming_counts():
    """Test streaming array counting"""
    
    test_file = '/var/www/datadonation-metl/tests/300mb.json'
    
    if not os.path.exists(test_file):
        print(f"Test file not found: {test_file}")
        return False
    
    # Expected counts from jq analysis
    test_cases = [
        ('Post.Posts.VideoList', 78),
        ('Profile And Settings.Follower.FansList', 285),
        ('Profile And Settings.Following.Following', 9410),
        ('Your Activity.Login History.LoginHistoryList', 13265),
        ('Your Activity.Searches.SearchList', 5024),
        ('Your Activity.Share History.ShareHistoryList', 1475),
        ('Your Activity.Watch History.VideoList', 2076773),
    ]
    
    print(f"Testing streaming array counting with {test_file}")
    print("=" * 60)
    
    results = {}
    all_correct = True
    
    for array_path, expected_count in test_cases:
        print(f"Testing {array_path}...")
        try:
            actual_count = count_streaming_array(test_file, array_path)
            results[array_path] = actual_count
            
            status = "✓" if actual_count == expected_count else "✗"
            print(f"  {status} Found {actual_count} entries (expected {expected_count})")
            
            if actual_count != expected_count:
                all_correct = False
                
        except Exception as e:
            print(f"  ✗ Error: {e}")
            all_correct = False
    
    print("\n" + "=" * 60)
    print("SUMMARY:")
    print("=" * 60)
    
    for array_path, expected_count in test_cases:
        actual_count = results.get(array_path, 0)
        status = "✓" if actual_count == expected_count else "✗"
        print(f"{status} {array_path}: {actual_count} (expected {expected_count})")
    
    print(f"\nOverall result: {'PASS' if all_correct else 'FAIL'}")
    return all_correct

if __name__ == "__main__":
    import sys
    success = test_streaming_counts()
    sys.exit(0 if success else 1)