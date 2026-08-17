import port.api.props as props
from port.api.assets import *
from port.api.commands import (CommandSystemDonate, CommandSystemExit, CommandUIRender)

import pandas as pd
import zipfile
import json
import datetime
import pytz
import fnmatch
import hashlib
import os
from collections import defaultdict, namedtuple
from contextlib import suppress
from datetime import datetime

# Global variable to store the last donation ID
last_donation_id = None
# Global variable to track if user donated
user_donated = False

# Enable debug mode
DEBUG = True

def debug_log(message):
    if DEBUG:
        print(f"DEBUG: {message}")
        
# Exception to skip to the next step
class SkipToNextStep(Exception):
    pass

def retry_confirmation():
    text = props.Translatable({
        "en": "Unfortunately, we cannot process your file. Continue, if you are sure that you selected the right file. Try again to select a different file.",
        "de": "Leider können wir Ihre Datei nicht bearbeiten. Fahren Sie fort, wenn Sie sicher sind, dass Sie die richtige Datei ausgewählt haben. Versuchen Sie, eine andere Datei auszuwählen.",
        "nl": "Helaas, kunnen we uw bestand niet verwerken. Weet u zeker dat u het juiste bestand heeft gekozen? Ga dan verder. Probeer opnieuw als u een ander bestand wilt kiezen."
    })
    ok = props.Translatable({
        "en": "Try again",
        "de": "Versuchen Sie es noch einmal",
        "nl": "Probeer opnieuw"
    })
    cancel = props.Translatable({
        "en": "Continue",
        "de": "Weiter",
        "nl": "Verder"
    })
    return props.PropsUIPromptConfirm(text, ok, cancel)

def hash_username(username):
    username_bytes = username.encode('utf-8')
    hash_object = hashlib.sha256()
    hash_object.update(username_bytes)
    hex_digest = hash_object.hexdigest()
    return hex_digest

def get_zipfile(filename):
    try:
        return zipfile.ZipFile(filename)
    except zipfile.error:
        return "invalid"
    
   
def get_files(zipfile_ref):
    try: 
        return zipfile_ref.namelist()
    except zipfile.error:
        return []

# =====================
def glob(zipfile, pattern):
    return fnmatch.filter(zipfile.namelist(), pattern)


def glob_json(zipfile, pattern):
    for name in glob(zipfile, pattern):
        with zipfile.open(name) as f:
            yield json.load(f)

def load_json(path):
    import os
    file_size = os.path.getsize(path)
    
    # For very large files, use streaming approach
    if file_size > 100 * 1024 * 1024:  # 100MB threshold
        print(f"DEBUG: Large file detected ({file_size:,} bytes), using streaming JSON parser")
        return _load_json_streaming(path)
    
    # Standard loading for smaller files
    print(f"DEBUG: Loading JSON file ({file_size:,} bytes)...")
    with open(path) as f:
        result = json.load(f)
        print("DEBUG: JSON file loaded successfully")
        return result

def _load_json_streaming(path):
    """Handle large JSON files with research-focused extraction"""
    print("DEBUG: Handling large JSON file with research-focused extraction")
    
    try:
        # Try to load the complete file first
        import gc
        gc.collect()  # Clean up before attempting
        
        print("DEBUG: Attempting to load full JSON file")
        print("DEBUG: Loading... please wait (this may take several minutes for large files)")
        
        with open(path, 'r') as f:
            result = json.load(f)
            
        print("DEBUG: Successfully loaded complete JSON file")
        
        # Validate research categories are present
        research_stats = _validate_research_categories(result)
        print(f"DEBUG: Research data validation: {research_stats}")
        
        return result
        
    except MemoryError as e:
        print(f"DEBUG: Memory error loading large file: {e}")
        print("DEBUG: Switching to targeted research data extraction")
        
        # Use targeted extraction for research categories
        return _extract_research_data_targeted(path)
    except Exception as e:
        print(f"DEBUG: Error loading JSON file: {e}")
        print("DEBUG: Falling back to minimal JSON loader...")
        return _load_json_minimal(path)

def _validate_research_categories(data):
    """Validate that all research categories are present and count items"""
    
    research_stats = {}
    
    # 1. Profile/ID data
    profile_path = data.get('Profile And Settings', {}).get('Profile Info', {}).get('ProfileMap', {})
    research_stats['profile_data'] = {
        'present': bool(profile_path),
        'fields': list(profile_path.keys()) if profile_path else []
    }
    
    # 2. Video uploads (user's own posts)
    video_uploads = data.get('Post', {}).get('Posts', {}).get('VideoList', [])
    research_stats['video_uploads'] = {
        'count': len(video_uploads),
        'has_likes': any('Likes' in v for v in video_uploads)
    }
    
    # 3. Watch history
    watch_history = data.get('Your Activity', {}).get('Watch History', {}).get('VideoList', [])
    research_stats['watch_history'] = {
        'count': len(watch_history)
    }
    
    # 4. Login history
    login_history = data.get('Your Activity', {}).get('Login History', {}).get('LoginHistoryList', [])
    research_stats['login_history'] = {
        'count': len(login_history)
    }
    
    # 5. Purchases
    purchases = data.get('Your Activity', {}).get('Purchases', {})
    research_stats['purchases'] = {
        'present': bool(purchases),
        'sections': list(purchases.keys()) if purchases else []
    }
    
    # 6. Additional activity data
    searches = data.get('Your Activity', {}).get('Searches', {}).get('SearchList', [])
    research_stats['searches'] = {
        'count': len(searches)
    }
    
    return research_stats

def _extract_research_data_targeted(path):
    """Extract only research-relevant data using targeted streaming approach"""
    print("DEBUG: Starting targeted research data extraction")
    
    # This approach reads the file in chunks and extracts only what we need
    result = {
        'Profile And Settings': {
            'Profile Info': {'ProfileMap': {}},
            'Follower': {'FansList': []},
            'Following': {'Following': []}
        },
        'Post': {
            'Posts': {'VideoList': []}
        },
        'Your Activity': {
            'Login History': {'LoginHistoryList': []},
            'Watch History': {'VideoList': []},
            'Searches': {'SearchList': []},
            'Share History': {'ShareHistoryList': []},
            'Purchases': {}
        },
        '_research_extraction': {
            'status': 'targeted_extraction',
            'reason': 'memory_constraints',
            'extracted_categories': ['profile', 'video_uploads', 'watch_history', 'login_history', 'purchases', 'searches']
        }
    }
    
    try:
        # Get file size for progress tracking
        import os
        import time
        file_size = os.path.getsize(path)
        start_time = time.time()
        max_processing_time = 300  # 5 minutes max
        
        # Use targeted extraction with specific focus on research categories
        with open(path, 'r') as f:
            # Read file in manageable chunks
            chunk_size = 2 * 1024 * 1024  # 2MB chunks for better performance
            buffer = ""
            bytes_read = 0
            progress_interval = max(1, file_size // 20)  # Show progress every 5%
            last_progress_report = 0
            process_interval = 5 * 1024 * 1024  # Process buffer every 5MB
            last_process_point = 0
            
            print("DEBUG: Processing large file in chunks...")
            print(f"DEBUG: Will timeout after {max_processing_time} seconds if needed")
            
            while True:
                # Check for timeout
                if time.time() - start_time > max_processing_time:
                    print("DEBUG: Processing timeout reached, stopping early to prevent hanging")
                    break
                
                chunk = f.read(chunk_size)
                if not chunk:
                    break
                
                buffer += chunk
                bytes_read += len(chunk)
                
                # Show progress every 5% of file processed
                if bytes_read - last_progress_report >= progress_interval:
                    progress_percent = (bytes_read / file_size) * 100
                    elapsed = time.time() - start_time
                    print(f"DEBUG: Processed {bytes_read:,} bytes ({progress_percent:.1f}%) of {file_size:,} bytes in {elapsed:.1f}s")
                    last_progress_report = bytes_read
                
                # Only process buffer periodically to improve performance
                if bytes_read - last_process_point >= process_interval:
                    print(f"DEBUG: Extracting data from buffer (size: {len(buffer):,} chars)...")
                    _extract_research_from_buffer(buffer, result)
                    last_process_point = bytes_read
                
                # Keep buffer manageable - retain only end portion for continuity
                if len(buffer) > 8 * 1024 * 1024:  # 8MB limit
                    buffer = buffer[-2 * 1024 * 1024:]  # Keep last 2MB
        
        print("DEBUG: File processing completed - finalizing extraction...")
        
        # Final extraction from remaining buffer
        _extract_research_from_buffer(buffer, result)
        
        # Log extraction results
        stats = _validate_research_categories(result)
        print(f"DEBUG: Targeted extraction results: {stats}")
        
        return result
        
    except Exception as e:
        print(f"DEBUG: Error in targeted extraction: {e}")
        return _load_json_minimal(path)

def _extract_research_from_buffer(buffer, result):
    """Extract research-relevant data from buffer"""
    import re
    
    print("DEBUG: Starting buffer data extraction...")
    extraction_counts = {'profile': 0, 'videos': 0, 'watch': 0, 'logins': 0, 'searches': 0, 'purchases': 0}
    
    # Extract profile data
    try:
        profile_match = re.search(r'"ProfileMap"\s*:\s*({[^}]*(?:{[^}]*}[^}]*)*})', buffer)
        if profile_match:
            try:
                profile_data = json.loads(profile_match.group(1))
                result['Profile And Settings']['Profile Info']['ProfileMap'].update(profile_data)
                extraction_counts['profile'] = len(profile_data)
            except json.JSONDecodeError:
                pass
    except Exception as e:
        print(f"DEBUG: Error extracting profile data: {e}")
    
    # Extract video uploads with likes data (limit to avoid performance issues)
    try:
        video_pattern = r'{\s*"Date"\s*:\s*"[^"]*"[^}]*"Likes"\s*:\s*"[^"]*"[^}]*}'
        videos = re.findall(video_pattern, buffer)[:1000]  # Limit to 1000 per buffer
        for video_str in videos:
            try:
                video_obj = json.loads(video_str)
                # Simple duplicate check - just check if we already have this many entries
                if len(result['Post']['Posts']['VideoList']) < 5000:  # Limit total entries
                    result['Post']['Posts']['VideoList'].append(video_obj)
                    extraction_counts['videos'] += 1
            except json.JSONDecodeError:
                continue
    except Exception as e:
        print(f"DEBUG: Error extracting video data: {e}")
    
    # Extract watch history (limited processing)
    try:
        watch_pattern = r'{\s*"Date"\s*:\s*"[^"]*"[^}]*"Link"\s*:\s*"[^"]*"[^}]*}'
        watch_videos = re.findall(watch_pattern, buffer)[:1000]  # Limit to 1000 per buffer
        for watch_str in watch_videos:
            try:
                watch_obj = json.loads(watch_str)
                # Add to watch history (different from uploads)
                if 'tiktokv.com' in watch_obj.get('Link', '') and len(result['Your Activity']['Watch History']['VideoList']) < 5000:
                    result['Your Activity']['Watch History']['VideoList'].append(watch_obj)
                    extraction_counts['watch'] += 1
            except json.JSONDecodeError:
                continue
    except Exception as e:
        print(f"DEBUG: Error extracting watch history: {e}")
    
    # Extract login history (limited processing)
    try:
        login_pattern = r'{\s*"Date"\s*:\s*"[^"]*"[^}]*"IP"\s*:\s*"[^"]*"[^}]*"DeviceModel"[^}]*}'
        logins = re.findall(login_pattern, buffer)[:500]  # Limit to 500 per buffer
        for login_str in logins:
            try:
                login_obj = json.loads(login_str)
                if len(result['Your Activity']['Login History']['LoginHistoryList']) < 2000:
                    result['Your Activity']['Login History']['LoginHistoryList'].append(login_obj)
                    extraction_counts['logins'] += 1
            except json.JSONDecodeError:
                continue
    except Exception as e:
        print(f"DEBUG: Error extracting login history: {e}")
    
    # Extract searches (limited processing)
    try:
        search_pattern = r'{\s*"Date"\s*:\s*"[^"]*"[^}]*"SearchTerm"\s*:\s*"[^"]*"[^}]*}'
        searches = re.findall(search_pattern, buffer)[:500]  # Limit to 500 per buffer
        for search_str in searches:
            try:
                search_obj = json.loads(search_str)
                if len(result['Your Activity']['Searches']['SearchList']) < 2000:
                    result['Your Activity']['Searches']['SearchList'].append(search_obj)
                    extraction_counts['searches'] += 1
            except json.JSONDecodeError:
                continue
    except Exception as e:
        print(f"DEBUG: Error extracting searches: {e}")
    
    # Extract purchases data
    try:
        purchase_match = re.search(r'"Purchases"\s*:\s*({[^}]*(?:{[^}]*}[^}]*)*})', buffer)
        if purchase_match:
            try:
                purchase_data = json.loads(purchase_match.group(1))
                result['Your Activity']['Purchases'].update(purchase_data)
                extraction_counts['purchases'] = len(purchase_data)
            except json.JSONDecodeError:
                pass
    except Exception as e:
        print(f"DEBUG: Error extracting purchases: {e}")
    
    # Report extraction progress
    total_extracted = sum(extraction_counts.values())
    print(f"DEBUG: Extracted {total_extracted} items from buffer: {extraction_counts}")
    
    # Report current totals
    current_totals = {
        'videos': len(result['Post']['Posts']['VideoList']),
        'watch_history': len(result['Your Activity']['Watch History']['VideoList']),
        'logins': len(result['Your Activity']['Login History']['LoginHistoryList']),
        'searches': len(result['Your Activity']['Searches']['SearchList'])
    }
    print(f"DEBUG: Current totals: {current_totals}")

def _create_fallback_structure(path):
    """Create a fallback structure that indicates memory constraints"""
    print("DEBUG: Creating fallback structure due to memory constraints")
    
    # Return structure that indicates this is a fallback
    # The processing can continue but with limited data
    return {
        "_metadata": {
            "status": "partial_load",
            "reason": "memory_constraints",
            "file_size": os.path.getsize(path),
            "note": "Large file processing limited due to memory constraints"
        },
        "Post": {
            "Posts": {
                "VideoList": []  # Empty but maintains structure
            }
        },
        "Profile And Settings": {
            "Profile Info": {"ProfileMap": {}},
            "Follower": {"FansList": []},
            "Following": {"Following": []},
            "Block List": {"BlockList": []},
            "Settings": {"SettingsMap": {}}
        },
        "Your Activity": {
            "Activity Summary": {},
            "Login History": {"LoginHistoryList": []},
            "Most Recent Location Data": {},
            "Off TikTok Activity": {"OffTikTokActivityDataList": []},
            "Searches": {"SearchList": []},
            "Share History": {"ShareHistoryList": []},
            "Status": {"Status List": []},
            "Watch History": {"VideoList": []},
            "Purchases": {}
        }
    }

def _load_json_manual_streaming(path):
    """Manual streaming JSON parser for large files"""
    print("DEBUG: Using manual streaming JSON parser")
    
    import gc
    
    class JSONStreamer:
        def __init__(self, file_path):
            self.file_path = file_path
            self.result = {}
            self.stack = []
            self.current_key = None
            self.current_value = None
            self.buffer = ""
            self.position = 0
            
        def parse(self):
            with open(self.file_path, 'r') as f:
                chunk_size = 8192  # Small chunks
                
                while True:
                    chunk = f.read(chunk_size)
                    if not chunk:
                        break
                    
                    self.buffer += chunk
                    self._process_buffer()
                    
                    # Keep buffer size manageable
                    if len(self.buffer) > 16384:
                        # Keep only the last portion
                        self.buffer = self.buffer[-8192:]
                    
                    # Force garbage collection periodically
                    if self.position % 10 == 0:
                        gc.collect()
                    
                    self.position += 1
                
                # Final processing
                self._process_buffer()
                
            return self.result
            
        def _process_buffer(self):
            # Simple approach: try to extract complete objects
            # Look for complete JSON structures within the buffer
            
            # Try to find complete array elements
            self._extract_array_elements()
            
        def _extract_array_elements(self):
            import re
            
            # Extract video list items
            video_pattern = r'{\s*"VideoId"\s*:\s*"[^"]*"[^}]*}'
            videos = re.findall(video_pattern, self.buffer)
            
            if videos:
                if 'Post' not in self.result:
                    self.result['Post'] = {'Posts': {'VideoList': []}}
                
                for video_str in videos:
                    try:
                        video_obj = json.loads(video_str)
                        if video_obj not in self.result['Post']['Posts']['VideoList']:
                            self.result['Post']['Posts']['VideoList'].append(video_obj)
                    except json.JSONDecodeError:
                        continue
            
            # Extract search items
            search_pattern = r'{\s*"SearchTerm"\s*:\s*"[^"]*"[^}]*}'
            searches = re.findall(search_pattern, self.buffer)
            
            if searches:
                if 'Your Activity' not in self.result:
                    self.result['Your Activity'] = {'Searches': {'SearchList': []}}
                elif 'Searches' not in self.result['Your Activity']:
                    self.result['Your Activity']['Searches'] = {'SearchList': []}
                
                for search_str in searches:
                    try:
                        search_obj = json.loads(search_str)
                        if search_obj not in self.result['Your Activity']['Searches']['SearchList']:
                            self.result['Your Activity']['Searches']['SearchList'].append(search_obj)
                    except json.JSONDecodeError:
                        continue
                        
            # Extract login history items  
            login_pattern = r'{\s*"DeviceInfo"\s*:\s*"[^"]*"[^}]*}'
            logins = re.findall(login_pattern, self.buffer)
            
            if logins:
                if 'Your Activity' not in self.result:
                    self.result['Your Activity'] = {'Login History': {'LoginHistoryList': []}}
                elif 'Login History' not in self.result['Your Activity']:
                    self.result['Your Activity']['Login History'] = {'LoginHistoryList': []}
                
                for login_str in logins:
                    try:
                        login_obj = json.loads(login_str)
                        if login_obj not in self.result['Your Activity']['Login History']['LoginHistoryList']:
                            self.result['Your Activity']['Login History']['LoginHistoryList'].append(login_obj)
                    except json.JSONDecodeError:
                        continue
    
    # Use the streaming parser
    streamer = JSONStreamer(path)
    result = streamer.parse()
    
    # Ensure basic structure exists
    if not result:
        result = _load_json_minimal(path)
    
    # Add any missing structure
    if 'Post' not in result:
        result['Post'] = {'Posts': {'VideoList': []}}
    if 'Your Activity' not in result:
        result['Your Activity'] = {
            'Searches': {'SearchList': []},
            'Login History': {'LoginHistoryList': []},
            'Watch History': {'VideoList': []},
            'Share History': {'ShareHistoryList': []}
        }
    
    print(f"DEBUG: Streaming parser extracted {len(result.get('Post', {}).get('Posts', {}).get('VideoList', []))} videos")
    print(f"DEBUG: Streaming parser extracted {len(result.get('Your Activity', {}).get('Searches', {}).get('SearchList', []))} searches")
    print(f"DEBUG: Streaming parser extracted {len(result.get('Your Activity', {}).get('Login History', {}).get('LoginHistoryList', []))} logins")
    
    return result

def _estimate_counts_from_file(path):
    """Estimate array counts by reading file chunks"""
    import re
    
    counts = {}
    
    try:
        with open(path, 'r') as f:
            # Read file in chunks to avoid memory issues
            chunk_size = 1024 * 1024  # 1MB chunks
            total_read = 0
            max_read = 50 * 1024 * 1024  # Only read first 50MB
            
            content_buffer = ""
            
            while total_read < max_read:
                chunk = f.read(chunk_size)
                if not chunk:
                    break
                    
                content_buffer += chunk
                total_read += len(chunk)
                
                # Keep buffer manageable
                if len(content_buffer) > 2 * 1024 * 1024:  # 2MB buffer
                    # Extract counts from current buffer
                    _extract_counts_from_buffer(content_buffer, counts)
                    # Keep only last part of buffer for continuity
                    content_buffer = content_buffer[-1024*1024:]
            
            # Process final buffer
            _extract_counts_from_buffer(content_buffer, counts)
            
        print(f"DEBUG: Estimated counts: {counts}")
        return counts
        
    except Exception as e:
        print(f"DEBUG: Error estimating counts: {e}")
        return {}

def _extract_counts_from_buffer(buffer, counts):
    """Extract counts from buffer using pattern matching"""
    import re
    
    # Patterns to match array structures
    patterns = {
        'Post.Posts.VideoList': r'"VideoList"\s*:\s*\[',
        'Profile And Settings.Follower.FansList': r'"FansList"\s*:\s*\[',
        'Profile And Settings.Following.Following': r'"Following"\s*:\s*\[',
        'Your Activity.Login History.LoginHistoryList': r'"LoginHistoryList"\s*:\s*\[',
        'Your Activity.Searches.SearchList': r'"SearchList"\s*:\s*\[',
        'Your Activity.Share History.ShareHistoryList': r'"ShareHistoryList"\s*:\s*\[',
        'Your Activity.Watch History.VideoList': r'"VideoList"\s*:\s*\[.*?"Date"',
    }
    
    for key, pattern in patterns.items():
        if key not in counts:
            # Count occurrences of individual items in arrays
            if 'VideoList' in key:
                # Count video entries
                video_count = len(re.findall(r'"VideoId"\s*:', buffer))
                if video_count > 0:
                    counts[key] = max(counts.get(key, 0), video_count)
            elif 'FansList' in key:
                # Count fan entries
                fan_count = len(re.findall(r'"Date"\s*:\s*"[^"]*"', buffer))
                if fan_count > 0:
                    counts[key] = max(counts.get(key, 0), fan_count)
            elif 'Following' in key:
                # Count following entries
                following_count = len(re.findall(r'"Date"\s*:\s*"[^"]*"', buffer))
                if following_count > 0:
                    counts[key] = max(counts.get(key, 0), following_count)
            elif 'LoginHistoryList' in key:
                # Count login entries
                login_count = len(re.findall(r'"DeviceInfo"\s*:', buffer))
                if login_count > 0:
                    counts[key] = max(counts.get(key, 0), login_count)
            elif 'SearchList' in key:
                # Count search entries
                search_count = len(re.findall(r'"SearchTerm"\s*:', buffer))
                if search_count > 0:
                    counts[key] = max(counts.get(key, 0), search_count)
            elif 'ShareHistoryList' in key:
                # Count share entries
                share_count = len(re.findall(r'"SharedContent"\s*:', buffer))
                if share_count > 0:
                    counts[key] = max(counts.get(key, 0), share_count)

def _parse_jq_output(output):
    """Parse jq output to extract array counts"""
    counts = {}
    
    for line in output.strip().split('\n'):
        if ':' in line:
            path, count = line.split(':', 1)
            try:
                counts[path.strip()] = int(count.strip())
            except ValueError:
                continue
    
    return counts

def _create_structure_with_actual_counts(counts):
    """Create structure with actual array lengths"""
    
    # Extract specific counts we need
    video_list_count = counts.get('Post.Posts.VideoList', 0)
    fans_list_count = counts.get('Profile And Settings.Follower.FansList', 0)
    following_count = counts.get('Profile And Settings.Following.Following', 0)
    login_history_count = counts.get('Your Activity.Login History.LoginHistoryList', 0)
    search_count = counts.get('Your Activity.Searches.SearchList', 0)
    share_history_count = counts.get('Your Activity.Share History.ShareHistoryList', 0)
    watch_history_count = counts.get('Your Activity.Watch History.VideoList', 0)
    
    print(f"DEBUG: Creating structure with counts - Videos: {video_list_count}, Fans: {fans_list_count}, Following: {following_count}")
    print(f"DEBUG: Login: {login_history_count}, Search: {search_count}, Share: {share_history_count}, Watch: {watch_history_count}")
    
    # Create representative samples (limited to prevent memory issues)
    return {
        "Post": {
            "Posts": {
                "VideoList": [{"VideoId": f"video_{i}", "Date": f"2024-01-{i%30+1:02d}"} 
                             for i in range(min(video_list_count, 50))]  # Limit to 50 samples
            }
        },
        "Profile And Settings": {
            "Profile Info": {"ProfileMap": {"UserName": "sample_user"}},
            "Follower": {
                "FansList": [{"Date": f"2024-01-{i%30+1:02d}", "UserName": f"fan_{i}"} 
                            for i in range(min(fans_list_count, 50))]
            },
            "Following": {
                "Following": [{"Date": f"2024-01-{i%30+1:02d}", "UserName": f"following_{i}"} 
                             for i in range(min(following_count, 50))]
            }
        },
        "Your Activity": {
            "Login History": {
                "LoginHistoryList": [{"Date": f"2024-01-{i%30+1:02d}", "IP": f"192.168.1.{i%255}"} 
                                   for i in range(min(login_history_count, 50))]
            },
            "Searches": {
                "SearchList": [{"Date": f"2024-01-{i%30+1:02d}", "SearchTerm": f"search_{i}"} 
                              for i in range(min(search_count, 50))]
            },
            "Share History": {
                "ShareHistoryList": [{"Date": f"2024-01-{i%30+1:02d}", "SharedContent": f"content_{i}"} 
                                   for i in range(min(share_history_count, 50))]
            },
            "Watch History": {
                "VideoList": [{"Date": f"2024-01-{i%30+1:02d}", "VideoId": f"watch_{i}"} 
                             for i in range(min(watch_history_count, 100))]  # Slightly more for watch history
            }
        }
    }

def _set_nested_dict(obj, path, value):
    """Helper to set nested dictionary values"""
    current = obj
    for key in path[:-1]:
        if key not in current:
            current[key] = {}
        current = current[key]
    if path:
        current[path[-1]] = value

def _load_json_minimal(path):
    """Minimal JSON loader that returns a simplified structure to avoid memory issues"""
    print("DEBUG: Using minimal JSON loader due to memory constraints")
    
    # Return a minimal structure that won't cause memory issues
    # but still allows the processing to continue
    return {
        "Post": {"Posts": {"VideoList": []}},
        "Profile And Settings": {
            "Profile Info": {"ProfileMap": {}},
            "Follower": {"FansList": []},
            "Following": {"Following": []}
        },
        "Your Activity": {
            "Login History": {"LoginHistoryList": []},
            "Searches": {"SearchList": []},
            "Share History": {"ShareHistoryList": []},
            "Watch History": {"VideoList": []}
        }
    }

# =====================

def extract_file(zipfile_ref, filename):
    try:
        # make it slow for demo reasons only
        import time
        time.sleep(1)
        info = zipfile_ref.getinfo(filename)
        return (filename, info.compress_size, info.file_size)
    except zipfile.error:
        return "invalid"

def extract_id(jsonfile):

    try:
        print(">>> in extract_id(), jsonfile type:", type(jsonfile), "keys (if dict):", (list(jsonfile.keys()) if isinstance(jsonfile, dict) else None))
        # First path:
        profile = jsonfile.get('Profile', {}) or jsonfile.get('Profile And Settings', {}) or {}
        profile_info = profile.get('Profile Information', {}) or profile.get('Profile Info') or {}
        profile_map = profile_info.get('ProfileMap', {}) or {}
        username = profile_map.get('userName')
        print("After first path, username =", repr(username))

        if not username:
            alt_info = profile.get('Profile Info', {}) or {}
            alt_map = alt_info.get('ProfileMap', {}) or {}
            username = alt_map.get('userName')
            print("After second path, username =", repr(username))

        if not username:
            print("Error extracting ID: Username not found in either 'Profile Information' or 'Profile Info'.")
        else:
            print("Found username:", username)
        
        hashed_username = hash_username(username) if username else None

        return ExtractionResult(
            "id",
            props.Translatable({"en": "Unique Identifier (note: deleting this will invalidate your submission)", "nl": "Unique Identifier (note: deleting this will invalidate your submission)"}),
            pd.DataFrame([hashed_username])
        )
    
    except Exception as e:
        print(f"Error extracting ID: {e}")

def extract_sharehistory(jsonfile):

    share_list = []
    print("Trying to extract share history…")

    try:
        # Navigate to the list that holds all share events
        activity_root  = jsonfile.get("Activity") or jsonfile.get("Your Activity") or {}
        share_root = activity_root.get("Share History", {})
        share_history_list = share_root.get("ShareHistoryList", [])

        for idx, item in enumerate(share_history_list):
            # Normalise keys to lowercase for defensive access
            item_lower = {k.lower(): v for k, v in item.items()}

            date  = item_lower.get("date", "")
            link  = item_lower.get("link", "")
            scontent = item_lower.get("sharedcontent", "")
            method   = item_lower.get("method", "")

            if date and link:
                share_list.append(
                    {
                        "Date":          date,
                        "Link":          link,
                        "SharedContent": scontent,
                        "Method":        method,
                    }
                )
            else:
                print(f"Share {idx + 1} is missing 'Date' or 'Link'. Skipping.")

    except Exception as e:
        print(f"Error extracting Share History: {e}")

    print(f"Total shares extracted: {len(share_list)}")
    return ExtractionResult(
        "shares",
        props.Translatable({"en": "Shares", "nl": "Shares"}),
        pd.DataFrame(share_list)
    )

def extract_activity_summary(jsonfile):

    print("Trying to extract activity summary…")
    summary_dict = {}

    try:
        # Navigate defensively to the summary map
        activity_root  = jsonfile.get("Activity") or jsonfile.get("Your Activity") or {}
        summary_root   = activity_root.get("Activity Summary", {})
        summary_map    = summary_root.get("ActivitySummaryMap", {})

        # Collect only numeric keys, skip descriptive notes
        for k, v in summary_map.items():
            if k.lower() == "note":
                continue
            summary_dict[k] = v

        if not summary_dict:
            print("ActivitySummaryMap is empty or contains only non-numeric keys.")

    except Exception as e:
        print(f"Error extracting Activity Summary Map: {e}")

    print(f"Metrics extracted: {len(summary_dict)}")
    return ExtractionResult(
        "activity_summary",
        props.Translatable({"en": "Activity summary", "nl": "Activiteitssamenvatting"}),
        pd.DataFrame([summary_dict])
    )

def extract_likes(jsonfile):

    like_list = []
    print('Trying to extract likes...')

    try:
        # Extract the "Like List"
        activity_root = jsonfile.get("Activity") or jsonfile.get("Your Activity") or {}
        item_favorite_list = activity_root.get('Like List', {}).get('ItemFavoriteList', [])

        for idx, item in enumerate(item_favorite_list):
            item_lower = {k.lower(): v for k, v in item.items()}
            date = item_lower.get('date', '')
            link = item_lower.get('link', '')
            if date and link:
                like_list.append({'Date': date, 'Link': link})
            else:
                print(f"Like {idx+1} is missing 'Date' or 'Link'. Skipping.")

    except Exception as e:
        print(f"Error extracting Like List: {e}")

    print(f"Total likes extracted: {len(like_list)}")
    return ExtractionResult(
        "likes",
        props.Translatable({"en": "Likes", "nl": "Likes"}),
        pd.DataFrame(like_list)
    )



def extract_watch_history(jsonfile):
    watch_history_list = []
    print('Trying to extract watch history...')

    try:
        # Extract the "VideoList" - handle both old and new formats
        activity_root = jsonfile.get("Activity") or jsonfile.get("Your Activity") or {}
        browsing_root = activity_root.get('Video Browsing History') or activity_root.get('Watch History') or {}
        json_videos = browsing_root.get('VideoList', []) if isinstance(browsing_root, dict) else browsing_root

        for idx, item in enumerate(json_videos):
            date = item.get('Date') or item.get('date', '')
            link = item.get('Link') or item.get('link', '')
            if date and link:
                watch_history_list.append({'Date': date, 'Link': link})
            else:
                print(f"Watch history item {idx+1} is missing 'Date' or 'Link'. Skipping.")

    except Exception as e:
        print(f"Error extracting Watch History: {e}")

    print(f"Total videos extracted: {len(watch_history_list)}")
    return ExtractionResult(
        "WatchHistory",
        props.Translatable({"en": "Watch History", "nl": "Watch History"}),
        pd.DataFrame(watch_history_list)
    )

def extract_logins(jsonfile):
    logins_list = []
    print('Trying to extract logins...')

    try:
        # Extract the "LoginHistoryList" - handle both old and new formats
        activity_root = jsonfile.get("Activity") or jsonfile.get("Your Activity") or {}
        json_videos = activity_root.get('Login History', {}).get('LoginHistoryList', [])

        for idx, item in enumerate(json_videos):
            date = item.get('Date') or item.get('date', '')
            device = item.get('DeviceModel', '')
            network = item.get('NetworkType', '')
            
            if date and device and network:
                logins_list.append({'Date': date, 
                                    'Device': device, 
                                    'Network': network})
            else:
                print(f"Login {idx+1} is missing 'Date' or 'Device'. Skipping.")

    except Exception as e:
        print(f"Error extracting Login List: {e}")

    print(f"Total logins extracted: {len(logins_list)}")
    return ExtractionResult(
        "LoginHistory",
        props.Translatable({"en": "Login History", "nl": "Login History"}),
        pd.DataFrame(logins_list)
    )

def extract_video_uploads(jsonfile):
    uploads_list = []
    print('Trying to extract logins...')

    try:
        # Attempt original location first
        json_videos = (
            jsonfile.get("Video", {})
                    .get("Videos", {})
                    .get("VideoList", [])
        )

        # Fallback to the 'Post' layout if nothing was found
        if not json_videos:
            json_videos = (
                jsonfile.get("Post", {})
                        .get("Posts", {})
                        .get("VideoList", [])
            )

        for idx, video in enumerate(json_videos):
            date_str = video.get('Date', '')
            likes_str = video.get('Likes', '0')

            if date_str:
                try:
                    date_obj = datetime.strptime(date_str, '%Y-%m-%d %H:%M:%S')
                    year = date_obj.year
                    week_num = date_obj.isocalendar()[1]
                except ValueError:
                    print(f"Invalid date format for video {idx+1}. Skipping.")
                    continue
            else:
                print(f"Video {idx+1} is missing 'Date'. Skipping.")
                continue

            try:
                likes = int(likes_str)
            except ValueError:
                print(f"Invalid likes count for video {idx+1}. Setting Likes to 0.")
                likes = 0

            uploads_list.append({'Year': year, 'Week': week_num, 'Likes': likes})
            # print(f"Extracted Video {idx+1}: Year={year}, Week={week_num}, Likes={likes}")

    except Exception as e:
        print(f"Error extracting video uploads: {e}")

    print(f"Total uploads extracted: {len(uploads_list)}")
    return ExtractionResult(
        "UploadHistory",
        props.Translatable({"en": "Upload History (de-identified, no links/content extracted)", 
                            "nl": "Upload History (de-identified, no links/content extracted)"}),
        pd.DataFrame(uploads_list)
    )

def extract_purchases(jsonfile):
    gifts_list = []
    print('Trying to extract purchases...')

    try:
        # Extract the "Purchase History" - handle both old and new formats
        activity_root = jsonfile.get("Activity") or jsonfile.get("Your Activity") or {}
        purchase_root = activity_root.get('Purchase History', {}) or activity_root.get('Purchases', {})
        json_gifts = purchase_root.get('BuyGifts', [])

        for idx, item in enumerate(json_gifts):
            date = item.get('Date') or item.get('date', '')
            value = item.get('Value', '')
            if date and value:
                gifts_list.append({'Date': date, 'Value': value})
            else:
                print(f"Purchase {idx+1} is missing 'Date' or 'Value'. Skipping.")

    except Exception as e:
        print(f"Error extracting Purchase List: {e}")

    print(f"Total purchases extracted: {len(gifts_list)}")
    return ExtractionResult(
        "PurchaseHistory",
        props.Translatable({"en": "Purchase History", "nl": "Purchase History"}),
        pd.DataFrame(gifts_list)
    )

# ActivityWatch extraction functions
def extract_activitywatch_data(file_path):
    """Main function to extract all data from ActivityWatch JSON file."""
    print('Started extracting ActivityWatch data')
    
    try:
        # Load the JSON file
        print("DEBUG: Loading ActivityWatch JSON file...")
        jsonfile = load_json(file_path)
        
        # First, determine if this is mobile or desktop data
        buckets = jsonfile.get('buckets', {})
        is_mobile = False
        
        # Check bucket IDs for mobile-specific patterns
        for bucket_id in buckets.keys():
            if 'android' in bucket_id.lower() or ('mobile' in bucket_id.lower()):
                is_mobile = True
                debug_log(f"Detected Android/Mobile ActivityWatch data: {bucket_id}")
                break
        
        if is_mobile:
            debug_log("Processing as mobile ActivityWatch data")
        else:
            debug_log("Processing as desktop ActivityWatch data")
        
        # Common extractors for both platforms
        extractors = [
            extract_activitywatch_id,
            extract_activitywatch_buckets_info,
            extract_activitywatch_screen_unlocks,
            extract_activitywatch_app_usage,
            extract_activitywatch_afk_data,
        ]
        
        # Save the file for record-keeping
        try:
            saved_path = save_uploaded_file(file_path)
            debug_log(f"ActivityWatch file saved to: {saved_path}")
        except Exception as save_error:
            debug_log(f"Warning: Could not save ActivityWatch file: {str(save_error)}")
        
        # Process each extractor and collect results
        results = []
        print(f"DEBUG: Processing {len(extractors)} ActivityWatch extractors...")
        for i, extractor in enumerate(extractors):
            try:
                print(f"DEBUG: Running ActivityWatch extractor {i+1}/{len(extractors)}: {extractor.__name__}")
                result = extractor(jsonfile)
                if result is not None:  # Only add non-None results
                    results.append(result)
                    debug_log(f"Added result from {extractor.__name__}")
                else:
                    debug_log(f"Skipped empty result from {extractor.__name__}")
            except Exception as e:
                debug_log(f"Error in {extractor.__name__}: {str(e)}")
                import traceback
                traceback.print_exc()
        
        # If we got no valid results other than ID, ensure at least the ID is present
        if len(results) == 0:
            debug_log("No data could be extracted, adding fallback ID only")
            dummy_id = hash_username(f"error-activitywatch-nodata-{datetime.now().isoformat()}")
            results.append(
                ExtractionResult(
                    "id",
                    props.Translatable({"en": "Your Random ID", "nl": "Your Random ID"}),
                    pd.DataFrame([dummy_id])
                )
            )
            # Also add an explanation
            results.append(
                ExtractionResult(
                    "error_info",
                    props.Translatable({"en": "Information", "nl": "Information"}),
                    pd.DataFrame([{"Message": "No data could be extracted from the ActivityWatch file."}])
                )
            )
        
        debug_log(f"Returning {len(results)} data sections")
        return results
        
    except Exception as e:
        print(f"Error extracting ActivityWatch data: {e}")
        import traceback
        traceback.print_exc()
        
        # Return minimal data with error info to ensure process continues
        try:
            # Create a minimal dataset to continue the process
            dummy_id = hash_username(f"error-activitywatch-{datetime.now().isoformat()}")
            
            # Return ActivityWatch-specific table names even on error to maintain consistency
            return [
                ExtractionResult(
                    "id",
                    props.Translatable({"en": "Your Random ID", "nl": "Your Random ID"}),
                    pd.DataFrame([dummy_id])
                ),
                ExtractionResult(
                    "error_info",
                    props.Translatable({"en": "Error Information", "nl": "Error Information"}),
                    pd.DataFrame([{"Error": str(e)}])
                ),
                # Add empty ActivityWatch-specific tables to keep consistent UI
                ExtractionResult(
                    "BucketInfo",
                    props.Translatable({"en": "Data Buckets", "nl": "Data Buckets"}),
                    pd.DataFrame(columns=["Bucket ID", "Type", "Client", "Events", "Start Date", "End Date"])
                ),
                ExtractionResult(
                    "AppUsage",
                    props.Translatable({"en": "App Usage", "nl": "App Usage"}),
                    pd.DataFrame(columns=["Date", "Time", "App", "Duration (min)"])
                ),
                ExtractionResult(
                    "AfkData",
                    props.Translatable({"en": "Computer Activity", "nl": "Computer Activity"}),
                    pd.DataFrame(columns=["Date", "Time", "Status", "Duration (min)"])
                )
            ]
        except Exception as inner_e:
            print(f"Critical error in fallback extraction: {str(inner_e)}")
            # Return absolute minimum to avoid crashing
            return [
                ExtractionResult(
                    "id",
                    props.Translatable({"en": "Error ID", "nl": "Error ID"}),
                    pd.DataFrame(["error-critical"])
                ),
                ExtractionResult(
                    "error_info",
                    props.Translatable({"en": "Critical Error", "nl": "Critical Error"}),
                    pd.DataFrame([{"Error": "A critical error occurred during extraction."}])
                )
            ]

def extract_activitywatch_id(jsonfile):
    """Extract a hashed ID from the ActivityWatch data."""
    try:
        # Use hostname from the first bucket as an identifier
        buckets = jsonfile.get('buckets', {})
        first_bucket_key = next(iter(buckets), None)
        
        if first_bucket_key and 'hostname' in buckets[first_bucket_key]:
            hostname = buckets[first_bucket_key]['hostname']
            # For consistency, don't use the actual hostname - just a unique identifier
            # that doesn't expose the actual computer name
            anonymized_id = "activitywatch-user"
            hashed_id = hash_username(anonymized_id)
        else:
            hashed_id = hash_username("unknown-activitywatch-user")
    except Exception as e:
        print(f"Error extracting ActivityWatch ID: {e}")
        hashed_id = hash_username("error-extracting-id")
    
    return ExtractionResult(
        "id",
        props.Translatable({"en": "Your Random ID", "nl": "Your Random ID"}),
        pd.DataFrame([hashed_id])
    )

def extract_activitywatch_buckets_info(jsonfile):
    """Extract basic information about the buckets in the ActivityWatch data."""
    bucket_info = []
    
    try:
        buckets = jsonfile.get('buckets', {})
        
        for bucket_id, bucket_data in buckets.items():
            # Sanitize the bucket_id by removing the computer name suffix
            # Example: "aw-watcher-window_OII-RADON" -> "aw-watcher-window"
            sanitized_bucket_id = bucket_id.split('_')[0] if '_' in bucket_id else bucket_id
            
            bucket_type = bucket_data.get('type', 'unknown')
            client = bucket_data.get('client', 'unknown')
            created = bucket_data.get('created', 'unknown')
            events = bucket_data.get('events', [])
            event_count = len(events)
            
            # First try to get date range from metadata
            metadata = bucket_data.get('metadata', {})
            start_date = metadata.get('start', 'unknown')
            end_date = metadata.get('end', 'unknown')
            
            # If metadata doesn't have start/end dates or they're unknown, extract from events
            if start_date == 'unknown' or end_date == 'unknown':
                debug_log(f"Extracting time range from events for bucket: {bucket_id}")
                
                # Extract timestamps from all events
                timestamps = []
                for event in events:
                    if 'timestamp' in event:
                        try:
                            # Standardize timestamp format
                            timestamp = event['timestamp'].replace('Z', '+00:00')
                            timestamps.append(timestamp)
                        except Exception as e:
                            debug_log(f"Error processing timestamp in bucket {bucket_id}: {e}")
                
                # If we have timestamps, find min and max
                if timestamps:
                    try:
                        # Convert to datetime objects for comparison
                        datetime_objects = [datetime.fromisoformat(ts) for ts in timestamps]
                        min_time = min(datetime_objects)
                        max_time = max(datetime_objects)
                        
                        # If start_date was unknown, update it
                        if start_date == 'unknown':
                            start_date = min_time.strftime('%Y-%m-%d %H:%M:%S')
                            debug_log(f"Set start_date from events: {start_date}")
                        
                        # If end_date was unknown, update it
                        if end_date == 'unknown':
                            end_date = max_time.strftime('%Y-%m-%d %H:%M:%S')
                            debug_log(f"Set end_date from events: {end_date}")
                    except Exception as e:
                        debug_log(f"Error determining min/max timestamps: {e}")
            
            # Format dates to be more human-readable if they're still in ISO format
            if start_date != 'unknown' and not isinstance(start_date, str):
                start_date = start_date.strftime('%Y-%m-%d %H:%M:%S')
            elif start_date != 'unknown' and 'T' in start_date:
                try:
                    date_obj = datetime.fromisoformat(start_date.replace('Z', '+00:00'))
                    start_date = date_obj.strftime('%Y-%m-%d %H:%M:%S')
                except Exception as e:
                    debug_log(f"Error formatting start date: {e}")
            
            if end_date != 'unknown' and not isinstance(end_date, str):
                end_date = end_date.strftime('%Y-%m-%d %H:%M:%S')
            elif end_date != 'unknown' and 'T' in end_date:
                try:
                    date_obj = datetime.fromisoformat(end_date.replace('Z', '+00:00'))
                    end_date = date_obj.strftime('%Y-%m-%d %H:%M:%S')
                except Exception as e:
                    debug_log(f"Error formatting end date: {e}")
            
            bucket_info.append({
                'Bucket ID': sanitized_bucket_id,
                'Type': bucket_type,
                'Client': client,
                'Events': event_count,
                'Start Date': start_date,
                'End Date': end_date
            })
            debug_log(f"Added bucket info: {sanitized_bucket_id}, {start_date} to {end_date}")
    except Exception as e:
        print(f"Error extracting ActivityWatch bucket info: {e}")
        debug_log(f"Bucket info extraction error: {str(e)}")
        import traceback
        traceback.print_exc()
    
    return ExtractionResult(
        "BucketInfo",
        props.Translatable({"en": "Data Buckets", "nl": "Data Buckets"}),
        pd.DataFrame(bucket_info)
    )

def extract_activitywatch_screen_unlocks(jsonfile):
    """Extract screen unlock events from ActivityWatch data."""
    unlocks = []
    
    try:
        # Look for the unlock bucket
        buckets = jsonfile.get('buckets', {})
        unlock_bucket = None
        
        # Determine if this is mobile or desktop data
        is_mobile = any('android' in bucket_id.lower() for bucket_id in buckets.keys())
        debug_log(f"Detecting screen unlocks, mobile device: {is_mobile}")
        
        # For Android, specifically look for android-unlock bucket
        if is_mobile:
            for bucket_id, bucket_data in buckets.items():
                debug_log(f"Checking bucket for unlocks: {bucket_id}")
                if 'android-unlock' in bucket_id.lower() or 'os.lockscreen.unlocks' in bucket_data.get('type', '').lower():
                    debug_log(f"Found Android unlock bucket: {bucket_id}")
                    unlock_bucket = bucket_data
                    break
        else:
            # For desktop, there's usually no specific unlock bucket
            # Look for AFK bucket changes instead
            for bucket_id, bucket_data in buckets.items():
                base_bucket_id = bucket_id.split('_')[0] if '_' in bucket_id else bucket_id
                if 'unlock' in base_bucket_id.lower() or 'unlock' in bucket_data.get('type', '').lower():
                    debug_log(f"Found desktop unlock bucket: {bucket_id}")
                    unlock_bucket = bucket_data
                    break
        
        if unlock_bucket:
            events = unlock_bucket.get('events', [])
            debug_log(f"Found {len(events)} unlock events")
            
            for event in events:
                timestamp = event.get('timestamp', '')
                # Convert timestamp to date only for cleaner display
                if timestamp:
                    try:
                        date_obj = datetime.fromisoformat(timestamp.replace('Z', '+00:00'))
                        date_str = date_obj.strftime('%Y-%m-%d')
                        time_str = date_obj.strftime('%H:%M:%S')
                    except Exception as e:
                        debug_log(f"Error parsing timestamp: {e}")
                        date_str = timestamp
                        time_str = ''
                
                unlocks.append({
                    'Date': date_str,
                    'Time': time_str
                })
        else:
            debug_log("No unlock bucket found")
    except Exception as e:
        print(f"Error extracting ActivityWatch screen unlocks: {e}")
        debug_log(f"Screen unlock extraction error: {str(e)}")
        import traceback
        traceback.print_exc()
    
    # If no unlocks were found, return None instead of a placeholder
    if not unlocks:
        debug_log("No screen unlock data found, skipping this section")
        return None
    
    return ExtractionResult(
        "ScreenUnlocks",
        props.Translatable({"en": "Screen Unlocks", "nl": "Screen Unlocks"}),
        pd.DataFrame(unlocks)
    )

def extract_activitywatch_app_usage(jsonfile):
    """Extract app usage data from ActivityWatch."""
    app_usage = []
    
    try:
        buckets = jsonfile.get('buckets', {})
        
        # Determine if this is mobile or desktop data
        is_mobile = any('android' in bucket_id.lower() for bucket_id in buckets.keys())
        debug_log(f"Detecting app usage, mobile device: {is_mobile}")
        
        # Look for app-related buckets
        for bucket_id, bucket_data in buckets.items():
            debug_log(f"Checking bucket for app usage: {bucket_id} with type: {bucket_data.get('type', 'unknown')}")
            
            # Check if this is a window/currentwindow bucket (more inclusive for desktop)
            is_window_bucket = (
                'currentwindow' in bucket_data.get('type', '').lower() or  # Check type
                'window' in bucket_id.lower() or                           # Check bucket id 
                ('watcher' in bucket_id.lower() and 'window' in bucket_id.lower())  # Common pattern
            )
            
            # For Android, we need to include any bucket with app info
            is_android_app_bucket = is_mobile and (
                'android' in bucket_id.lower() or
                bucket_data.get('client', '').lower() == 'aw-android'
            )
            
            if is_window_bucket or is_android_app_bucket:
                debug_log(f"Processing app usage from bucket: {bucket_id}")
                events = bucket_data.get('events', [])
                debug_log(f"Found {len(events)} app events in bucket {bucket_id}")
                
                for event in events:
                    timestamp = event.get('timestamp', '')
                    duration = event.get('duration', 0)
                    data = event.get('data', {})
                    
                    # Get app name from various fields depending on source
                    app = None
                    
                    # Try 'app' field first (most common)
                    if 'app' in data:
                        app = data.get('app')
                        
                    # Try 'package' field for Android
                    elif 'package' in data:
                        app = data.get('package', '').split('.')[-1]  # Get last part of package name
                    
                    # Try to extract from title as last resort
                    elif 'title' in data and not app:
                        title = data.get('title', '')
                        # Extract app name from title (usually at the end after " - ")
                        if ' - ' in title:
                            app = title.split(' - ')[-1]
                        # Or just use the first part of title if it's short
                        elif len(title) < 20:
                            app = title
                    
                    # Handle desktop app format
                    if app and app.lower().endswith('.exe'):
                        app = app[:-4]  # Remove ".exe" suffix
                    
                    # Skip events with no app info
                    if not app:
                        debug_log(f"Skipping event with no app info")
                        continue
                    
                    # Convert timestamp to readable format
                    date_str = "Unknown"
                    time_str = "Unknown"
                    if timestamp:
                        try:
                            date_obj = datetime.fromisoformat(timestamp.replace('Z', '+00:00'))
                            date_str = date_obj.strftime('%Y-%m-%d')
                            time_str = date_obj.strftime('%H:%M:%S')
                        except Exception as e:
                            debug_log(f"Error formatting timestamp: {e}")
                            date_str = timestamp
                            time_str = ''
                    
                    # Convert duration from seconds to minutes
                    duration_min = round(duration / 60, 2) if duration else 0
                    
                    app_usage.append({
                        'Date': date_str,
                        'Time': time_str,
                        'App': app,
                        'Duration (min)': duration_min
                    })
                    
                    debug_log(f"Added app usage: {date_str} {time_str} - {app} ({duration_min} min)")
    except Exception as e:
        print(f"Error extracting ActivityWatch app usage: {e}")
        debug_log(f"App usage extraction error: {str(e)}")
        import traceback
        traceback.print_exc()
    
    # If no app usage was found, return None instead of a placeholder
    if not app_usage:
        debug_log("No app usage data found, skipping this section")
        return None
    
    return ExtractionResult(
        "AppUsage",
        props.Translatable({"en": "App Usage", "nl": "App Usage"}),
        pd.DataFrame(app_usage)
    )

def extract_activitywatch_afk_data(jsonfile):
    """Extract AFK (Away From Keyboard) data from ActivityWatch."""
    afk_data = []
    
    try:
        buckets = jsonfile.get('buckets', {})
        
        # Determine if this is mobile or desktop data
        is_mobile = any('android' in bucket_id.lower() for bucket_id in buckets.keys())
        debug_log(f"Detecting AFK data, mobile device: {is_mobile}")
        
        # Look for AFK buckets - for desktop this is critical data
        afk_buckets_found = 0
        for bucket_id, bucket_data in buckets.items():
            # More inclusive bucket detection for AFK data
            is_afk_bucket = (
                ('afk' in bucket_id.lower()) or
                ('afkstatus' in bucket_data.get('type', '').lower()) or
                ('not-afk' in str(bucket_data).lower())  # Check for not-afk status in data
            )
            
            if is_afk_bucket:
                debug_log(f"Found AFK bucket: {bucket_id}")
                afk_buckets_found += 1
                events = bucket_data.get('events', [])
                debug_log(f"Found {len(events)} AFK events")
                
                # Process each AFK state change event
                for event in events:
                    timestamp = event.get('timestamp', '')
                    duration = event.get('duration', 0)
                    data = event.get('data', {})
                    
                    # Get status - can be 'afk' or 'not-afk'
                    status = data.get('status', 'unknown')
                    
                    # Convert timestamp to readable format
                    date_str = "Unknown"
                    time_str = "Unknown"
                    if timestamp:
                        try:
                            date_obj = datetime.fromisoformat(timestamp.replace('Z', '+00:00'))
                            date_str = date_obj.strftime('%Y-%m-%d')
                            time_str = date_obj.strftime('%H:%M:%S')
                        except Exception as e:
                            debug_log(f"Error formatting AFK timestamp: {e}")
                            date_str = timestamp
                            time_str = ''
                    
                    # Convert duration from seconds to minutes for display
                    duration_min = round(duration / 60, 2) if duration else 0
                    
                    # Create a more readable status label
                    status_label = "Active" if status == "not-afk" else "Away"
                    if status == "unknown":
                        status_label = "Unknown"
                    
                    afk_data.append({
                        'Date': date_str,
                        'Time': time_str,
                        'Status': status_label,
                        'Duration (min)': duration_min
                    })
                    
                    debug_log(f"Added AFK entry: {date_str} {time_str} - {status_label} ({duration_min} min)")
        
        debug_log(f"Processed {afk_buckets_found} AFK buckets with {len(afk_data)} total events")
    except Exception as e:
        print(f"Error extracting ActivityWatch AFK data: {e}")
        debug_log(f"AFK data extraction error: {str(e)}")
        import traceback
        traceback.print_exc()
    
    # If no AFK data was found, return None instead of a placeholder
    if not afk_data:
        debug_log("No AFK data found, skipping this section")
        return None
    
    return ExtractionResult(
        "AfkData",
        props.Translatable({"en": "Computer Activity", "nl": "Computer Activity"}),
        pd.DataFrame(afk_data)
    )

# main function to extract all various data from the JSON file
def save_uploaded_file(file_path):
    """Save the uploaded file to the uploads directory with timestamp."""
    import os
    import shutil
    from datetime import datetime
    import sys

    try:
        print(f"DEBUG: Attempting to save file: {file_path}", file=sys.stderr)
        print(f"DEBUG: File exists: {os.path.exists(file_path)}", file=sys.stderr)
        print(f"DEBUG: Current working directory: {os.getcwd()}", file=sys.stderr)
        print(f"DEBUG: File path absolute: {os.path.abspath(file_path)}", file=sys.stderr)
        print(f"DEBUG: File path contents: {os.listdir(os.path.dirname(file_path))}", file=sys.stderr)

        # Create uploads directory in the home directory
        home_dir = os.path.expanduser("~")
        uploads_dir = os.path.join(home_dir, "feldspar_uploads")
        print(f"DEBUG: Creating uploads directory at: {uploads_dir}", file=sys.stderr)
        os.makedirs(uploads_dir, exist_ok=True)
        print(f"DEBUG: Uploads directory exists: {os.path.exists(uploads_dir)}", file=sys.stderr)

        # Generate filename with timestamp
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        filename = os.path.basename(file_path)
        new_filename = f"{timestamp}_{filename}"
        save_path = os.path.join(uploads_dir, new_filename)
        print(f"DEBUG: Will save to: {save_path}", file=sys.stderr)

        # Copy the file
        shutil.copy2(file_path, save_path)
        print(f"DEBUG: Successfully saved file to: {save_path}", file=sys.stderr)
        print(f"DEBUG: Saved file exists: {os.path.exists(save_path)}", file=sys.stderr)
        print(f"DEBUG: Uploads directory contents: {os.listdir(uploads_dir)}", file=sys.stderr)
        return save_path
    except Exception as e:
        print(f"ERROR: Error saving file: {str(e)}", file=sys.stderr)
        print(f"ERROR: Error type: {type(e)}", file=sys.stderr)
        import traceback
        print(f"ERROR: Traceback: {traceback.format_exc()}", file=sys.stderr)
        raise

def extract_data(path, platform='TikTok'):
    print(f'started extracting data for platform: {platform}')
    
    try:
        # Load the JSON file
        print("DEBUG: Beginning data extraction process...")
        jsonfile = load_json(path)
        
        # Check if this is ActivityWatch data (has 'buckets' key)
        if 'buckets' in jsonfile or platform == 'ActivityWatch':
            debug_log("ActivityWatch data detected in extract_data, redirecting to ActivityWatch extractor")
            # Redirect to ActivityWatch extractor
            return extract_activitywatch_data(path)
        
        # If not ActivityWatch, use TikTok extractors
        print("DEBUG: Starting TikTok data extraction...")
        extractors = [
            extract_likes,
            extract_watch_history,
            extract_activity_summary,
            extract_sharehistory,
            extract_logins,
            extract_video_uploads,
            extract_purchases,
            extract_id
        ]

        # Save the file first
        print("DEBUG: Saving uploaded file...")
        saved_path = save_uploaded_file(path)
        
        print("DEBUG: Running data extractors...")
        results = []
        for i, extractor in enumerate(extractors):
            print(f"DEBUG: Running extractor {i+1}/{len(extractors)}: {extractor.__name__}")
            result = extractor(jsonfile)
            results.append(result)
        
        print("DEBUG: Data extraction completed successfully")
        return results
    except Exception as e:
        debug_log(f"Error in extract_data: {str(e)}")
        import traceback
        traceback.print_exc()
        
        # Return minimal data to ensure process continues
        try:
            # Create a minimal dataset to continue the process
            dummy_id = hash_username(f"error-in-extraction-{datetime.now().isoformat()}")
            debug_log(f"Generated fallback ID: {dummy_id}")
            
            if platform == 'ActivityWatch':
                # Return ActivityWatch-specific empty tables
                return [
                    ExtractionResult(
                        "id",
                        props.Translatable({"en": "Your Random ID", "nl": "Your Random ID"}),
                        pd.DataFrame([dummy_id])
                    ),
                    ExtractionResult(
                        "error_info",
                        props.Translatable({"en": "Error Information", "nl": "Error Information"}),
                        pd.DataFrame([{"Error": str(e)}])
                    ),
                    # Add empty ActivityWatch-specific tables
                    ExtractionResult(
                        "BucketInfo",
                        props.Translatable({"en": "Data Buckets", "nl": "Data Buckets"}),
                        pd.DataFrame(columns=["Bucket ID", "Type", "Client", "Events", "Start Date", "End Date"])
                    ),
                    ExtractionResult(
                        "AppUsage",
                        props.Translatable({"en": "App Usage", "nl": "App Usage"}),
                        pd.DataFrame(columns=["Date", "Time", "App", "Duration (min)"])
                    ),
                    ExtractionResult(
                        "AfkData",
                        props.Translatable({"en": "Computer Activity", "nl": "Computer Activity"}),
                        pd.DataFrame(columns=["Date", "Time", "Status", "Duration (min)"])
                    )
                ]
            else:
                # Return TikTok-specific empty tables
                return [
                    ExtractionResult(
                        "id",
                        props.Translatable({"en": "Your Random ID", "nl": "Your Random ID"}),
                        pd.DataFrame([dummy_id])
                    ),
                    ExtractionResult(
                        "error_info",
                        props.Translatable({"en": "Error Information", "nl": "Error Information"}),
                        pd.DataFrame([{"Error": str(e)}])
                    )
                ]
        except Exception as inner_e:
            debug_log(f"Critical error in fallback extraction: {str(inner_e)}")
            # Return absolute minimum to avoid crashing
            return [
                ExtractionResult(
                    "id",
                    props.Translatable({"en": "Error ID", "nl": "Error ID"}),
                    pd.DataFrame(["error-critical"])
                )
            ]

def prompt_consent(data, meta_data):

    table_title = props.Translatable({
        "en": "JSON file contents",
        "de": "Inhalt der JSON-Datei",
        "nl": "Inhoud JSON bestand"
    })

    log_title = props.Translatable({
        "en": "Log messages",
        "de": "Log Nachrichten",
        "nl": "Log berichten"
    })

    tables=[]
    if data is not None:
        data_frame = pd.DataFrame(data, columns=["filename", "compressed size", "size"])
        tables = [props.PropsUIPromptConsentFormTable("zip_content", table_title, data_frame)]

    meta_frame = pd.DataFrame(meta_data, columns=["type", "message"])
    meta_table = props.PropsUIPromptConsentFormTable("log_messages", log_title, meta_frame)
    return props.PropsUIPromptConsentForm(tables, [meta_table])


######################
# Data donation flow #
######################


ExtractionResult = namedtuple("ExtractionResult", ["id", "title", "data_frame"])
# ExtractionResult = namedtuple("ExtractionResult", ["id", "title", "data_frame", "visualizations"])


class DataDonationProcessor:
    
    def __init__(self, platform, mime_types, extractor, session_id):
        self.platform = platform
        self.mime_types = mime_types
        self.extractor = extractor
        self.session_id = session_id
        self.progress = 0
        self.meta_data = []

    def process(self):
    
        with suppress(SkipToNextStep):
            while True:
                
                file_result = yield from self.prompt_file()
                
                # Get original filename from the path
                original_filename = os.path.basename(file_result.value)
                self.log(f"processing file: {file_result.value} (original name: {original_filename})")
                print('made it to DataDonationProcessor.process()')
                try:
                    extraction_result = self.extract_data(file_result.value)
                    # Add original filename to the data that will be sent to the bridge
                    # Create metadata DataFrame with explicit column name
                    metadata_df = pd.DataFrame({
                        'original_filename': [original_filename]
                    })
                    # Convert to records format for consistent serialization
                    metadata_json = metadata_df.to_json(orient='split')
                    print(f"Metadata JSON:\n{metadata_json}")
                    
                    # Create new DataFrame from the JSON to ensure proper structure
                    metadata_df_final = pd.read_json(metadata_json, orient='split')
                    extraction_result.append(ExtractionResult(
                        "metadata",
                        props.Translatable({"en": "File Metadata", "nl": "File Metadata"}),
                        metadata_df_final
                    ))
                    # Get the actual saved file path
                    filename = os.path.basename(file_result.value)
                    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
                    saved_filename = f"{timestamp}_{filename}"
                    saved_path = os.path.join(os.path.dirname(__file__), "uploads", saved_filename)
                    self.log(f"File saved as: {saved_path}")
                    print("made it past extract_data(), now what")
                except (IOError, zipfile.BadZipFile):
                    self.log(f"prompt confirmation to retry file selection")
                    try_again = yield from self.prompt_retry()
                    if try_again:
                        continue
                    return
                else: # execute if no exception
                    if extraction_result is None:
                        try_again = yield from self.prompt_retry()
                        if try_again:
                            continue
                        else:
                            return
                    self.log(f"extraction successful, go to consent form")
                    yield from self.prompt_consent(extraction_result)
                    return


    def prompt_retry(self):
        retry_result = yield render_donation_page(
            self.platform, retry_confirmation(self.platform), self.progress
        )
        return retry_result.__type__ == "PayloadTrue"

    def prompt_file(self):
        debug_log("Starting prompt_file in DataDonationProcessor")
        description = props.Translatable({
            "en": "Please follow the download instructions and choose the file that you stored on your device.",
            "de": "Wählen Sie eine beliebige Zip-Datei aus, die Sie auf Ihrem Gerät gespeichert haben.",
            "nl": "Selecteer een willekeurige zip file die u heeft opgeslagen op uw apparaat."
        })
        debug_log("Creating PropsUIPromptFileInput")
        prompt_file = props.PropsUIPromptFileInput(description, self.mime_types)
        
        debug_log("Rendering donation page with file input")
        file_result = yield render_donation_page(
            self.platform, prompt_file, self.progress
        )
        
        debug_log(f"File input result type: {file_result.__type__}")
        if file_result.__type__ != "PayloadString":
            debug_log("File result is not a string, skipping to next step")
            self.log(f"skip to next step")
            raise SkipToNextStep()
            
        debug_log(f"File selected: {file_result.value}")
        return file_result

    def prompt_extraction_message(message, percentage):
        description = props.Translatable({
            "en": "One moment please. Information is now being extracted from the selected file.",
            "de": "Einen Moment bitte. Es werden nun Informationen aus der ausgewählten Datei extrahiert.",
            "nl": "Een moment geduld. Informatie wordt op dit moment uit het geselecteerde bestaand gehaald."
        })

        return props.PropsUIPromptProgress(description, message, percentage)

    def log(self, message):
        self.meta_data.append(("debug", f"{self.platform}: {message}"))
        print(f"DEBUG: {self.platform}: {message}")

    def extract_data(self, file):
        debug_log(f"Extracting data for platform: {self.platform}")
        print(f"DEBUG: Starting data extraction for {self.platform}...")
        # The extractor can either be a direct callable function (like extract_activitywatch_data)
        # or the default extract_data function
        if self.extractor:
            result = self.extractor(file)
            print(f"DEBUG: Data extraction completed for {self.platform}")
            return result
        else:
            # Fallback to the default extract_data function with platform information
            result = extract_data(file, self.platform)
            print(f"DEBUG: Data extraction completed for {self.platform}")
            return result

    def prompt_consent(self, data):
        # Important: in class methods, we access the global variable
        # but don't need to modify it directly here - only in donate()
        log_title = props.Translatable({"en": "Log messages", "nl": "Log berichten"})

        debug_log(f"Preparing consent form with {len(data)} tables for platform {self.platform}")
        
        tables = [
            # props.PropsUIPromptConsentFormTable(table.id, table.title, table.data_frame, table.visualizations)
            props.PropsUIPromptConsentFormTable(table.id, table.title, table.data_frame)
            for table in data
        ]
        
        # Check if the extraction was successful by examining the data tables
        # Filter out the metadata and id tables
        content_tables = [table for table in data if table.id not in ['metadata', 'id', 'error_info']]
        
        # Check if all tables are empty or have minimal data
        all_empty_or_minimal = True
        for table in content_tables:
            # Check if the DataFrame has any rows
            if len(table.data_frame) > 1:  # More than 1 row means actual data was found
                all_empty_or_minimal = False
                break
        
        # Create description with a warning if necessary
        description = None
        if all_empty_or_minimal:
            # Add a warning message for empty/minimal data
            warning_text = {
                "en": f"⚠️ WARNING: None of the extractions were successful. The file may be empty, corrupted, or in an incorrect format. Please check your file and make sure it contains the expected {self.platform} data.",
                "nl": f"⚠️ WAARSCHUWING: Geen van de extracties was succesvol. Het bestand is mogelijk leeg, beschadigd of heeft een onjuist formaat. Controleer uw bestand en zorg ervoor dat het de verwachte {self.platform}-gegevens bevat."
            }
            description = props.Translatable(warning_text)
            self.log(f"Warning added: Empty or minimal data detected in {self.platform} file")
        
        meta_frame = pd.DataFrame(self.meta_data, columns=["type", "message"])
        meta_table = props.PropsUIPromptConsentFormTable(
            "log_messages", log_title, meta_frame
        )
        self.log(f"prompt consent")
        
        # Create the consent form with the description (warning if needed)
        consent_form = props.PropsUIPromptConsentForm(tables, [meta_table], description, validation_failed=all_empty_or_minimal)
        
        consent_result = yield render_donation_page(
            self.platform,
            consent_form,
            self.progress,
        )

        global user_donated  # Declare global at the top of the function
        self.log(f"Consent result type: {consent_result.__type__}")
        debug_log(f"Consent result type: {consent_result.__type__}")
        
        if consent_result.__type__ == "PayloadJSON":
            user_donated = True  # Set donation status when PayloadJSON is received
            donation_id = f"{self.session_id}-{self.platform}"
            self.log(f"trying to donate consent data with ID: {donation_id}")
            debug_log(f"[DONATION_TRACKING] Creating donation ID: {donation_id}")
            debug_log(f"[DONATION_TRACKING] Session ID: {self.session_id}, Platform: {self.platform}")
            debug_log(f"[DONATION_TRACKING] Set user_donated to: {user_donated} (PayloadJSON received)")
            
            # We don't need global here, as donate() will handle setting the global variable
            try:
                yield donate(donation_id, consent_result.value)
                debug_log("[DONATION_TRACKING] Donation command yielded successfully")
            except Exception as e:
                debug_log(f"[DONATION_TRACKING] Error in donate command: {str(e)}")
                import traceback
                traceback.print_exc()
                
            print("DataDonationProcessor CONSENT completed.")
            debug_log("Consent process completed")
            return
        else:
            user_donated = False
            debug_log(f"Consent not given, result type was {consent_result.__type__}")
            debug_log(f"[DONATION_TRACKING] Set user_donated to: {user_donated}")


class DataDonation:
    def __init__(self, platform, mime_types, extractor):
        self.platform = platform
        self.mime_types = mime_types
        self.extractor = extractor

    def __call__(self, session_id):
        processor = DataDonationProcessor(
            self.platform, self.mime_types, self.extractor, session_id
        )
        yield from processor.process()
        print("DataDonation completed.")
        return

# let's write this down
# we call data_donation(session_id) and instantiate a DataDonation object
# the DataDonation object is a generator that yields from a DataDonationProcessor object
# the DataDonationProcessor first yields from prompt_file, then from extract_data, then from prompt_consent
# prompt_consent yields from render_donation_page, then from donate
# and when all that is done, we should be out of the whole loop and move onto render_end_page, and yet it doesn't happen.

# =============================================================================
# Pokemon Go extraction
# Niantic exports a ZIP containing several JSON files. Each extractor below
# targets one file pattern; all fields that could identify location (GPS coords,
# IP addresses, exact addresses) are dropped. Usernames are SHA-256 hashed.
# Extraction is best-effort: if a file is missing or has an unexpected schema
# the extractor returns None and is silently skipped.
# =============================================================================

def _pokemongo_parse_zip(file_path):
    """Return a ZipFile handle, or None if the file is not a valid ZIP."""
    zf = get_zipfile(file_path)
    return None if zf == "invalid" else zf


def _pokemongo_find_json(zf, *candidates):
    """Return the parsed JSON for the first matching filename in the ZIP."""
    names = zf.namelist()
    for candidate in candidates:
        matches = fnmatch.filter(names, f"**/{candidate}") or fnmatch.filter(names, candidate)
        if matches:
            with zf.open(matches[0]) as f:
                try:
                    return json.load(f)
                except Exception:
                    return None
    return None


def _pokemongo_extract_profile(zf):
    """Hashed username and account creation date."""
    data = _pokemongo_find_json(zf, "account.json", "profile.json", "user.json")
    if data is None:
        return None
    try:
        account = data if isinstance(data, dict) else {}
        username = account.get("username") or account.get("userName") or account.get("playerId", "")
        created = account.get("created") or account.get("createdTime") or account.get("accountCreationTime", "")
        return ExtractionResult(
            "pokemongo_profile",
            props.Translatable({"en": "Account", "nl": "Account"}),
            pd.DataFrame([{"hashed_username": hash_username(str(username)) if username else "", "account_created": created}])
        )
    except Exception as e:
        debug_log(f"Pokemon Go profile extraction error: {e}")
        return None


def _pokemongo_extract_playtime(zf):
    """Play session timestamps and durations (no location data)."""
    data = _pokemongo_find_json(zf, "activity.json", "play_log.json", "sessions.json")
    if data is None:
        return None
    try:
        sessions = data if isinstance(data, list) else data.get("sessions") or data.get("activity") or []
        rows = []
        for s in sessions:
            rows.append({
                "timestamp": s.get("timestamp") or s.get("startTime") or s.get("date", ""),
                "duration_seconds": s.get("durationSeconds") or s.get("duration", ""),
                "steps": s.get("steps") or s.get("stepCount", ""),
            })
        if not rows:
            return None
        return ExtractionResult(
            "pokemongo_playtime",
            props.Translatable({"en": "Play Sessions", "nl": "Spelsessies"}),
            pd.DataFrame(rows)
        )
    except Exception as e:
        debug_log(f"Pokemon Go playtime extraction error: {e}")
        return None


def _pokemongo_extract_battles(zf):
    """Battle history: timestamp, type, and outcome only."""
    data = _pokemongo_find_json(zf, "battles.json", "battle_history.json", "pvp.json")
    if data is None:
        return None
    try:
        battles = data if isinstance(data, list) else data.get("battles") or data.get("battleHistory") or []
        rows = []
        for b in battles:
            rows.append({
                "timestamp": b.get("timestamp") or b.get("battleTime", ""),
                "type": b.get("type") or b.get("battleType", ""),
                "outcome": b.get("outcome") or b.get("result", ""),
            })
        if not rows:
            return None
        return ExtractionResult(
            "pokemongo_battles",
            props.Translatable({"en": "Battle History", "nl": "Gevechtsgeschiedenis"}),
            pd.DataFrame(rows)
        )
    except Exception as e:
        debug_log(f"Pokemon Go battles extraction error: {e}")
        return None


def _pokemongo_extract_friends(zf):
    """Friends list with hashed usernames and friendship dates."""
    data = _pokemongo_find_json(zf, "friends.json", "friend_list.json", "friendships.json")
    if data is None:
        return None
    try:
        friends = data if isinstance(data, list) else data.get("friends") or data.get("friendList") or []
        rows = []
        for f in friends:
            username = f.get("username") or f.get("friendName") or f.get("name", "")
            rows.append({
                "hashed_username": hash_username(str(username)) if username else "",
                "friendship_date": f.get("created") or f.get("friendshipDate") or f.get("date", ""),
            })
        if not rows:
            return None
        return ExtractionResult(
            "pokemongo_friends",
            props.Translatable({"en": "Friends", "nl": "Vrienden"}),
            pd.DataFrame(rows)
        )
    except Exception as e:
        debug_log(f"Pokemon Go friends extraction error: {e}")
        return None


def _pokemongo_extract_purchases(zf):
    """Purchase history: timestamp, item, and amount."""
    data = _pokemongo_find_json(zf, "purchases.json", "purchase_history.json", "transactions.json")
    if data is None:
        return None
    try:
        purchases = data if isinstance(data, list) else data.get("purchases") or data.get("purchaseHistory") or []
        rows = []
        for p in purchases:
            rows.append({
                "timestamp": p.get("timestamp") or p.get("purchaseTime") or p.get("date", ""),
                "item": p.get("item") or p.get("itemName") or p.get("sku", ""),
                "amount": p.get("amount") or p.get("price", ""),
                "currency": p.get("currency", ""),
            })
        if not rows:
            return None
        return ExtractionResult(
            "pokemongo_purchases",
            props.Translatable({"en": "Purchase History", "nl": "Aankoopgeschiedenis"}),
            pd.DataFrame(rows)
        )
    except Exception as e:
        debug_log(f"Pokemon Go purchases extraction error: {e}")
        return None


def extract_data_pokemongo(file_path):
    """Main entry point for Pokemon Go data extraction.

    Expects a Niantic data export ZIP. Extracts play sessions, battle history,
    friends (hashed), and purchase history. Location data is never collected.
    """
    print("Started extracting Pokemon Go data")
    zf = _pokemongo_parse_zip(file_path)
    if zf is None:
        debug_log("Pokemon Go: file is not a valid ZIP")
        return []

    extractors = [
        _pokemongo_extract_profile,
        _pokemongo_extract_playtime,
        _pokemongo_extract_battles,
        _pokemongo_extract_friends,
        _pokemongo_extract_purchases,
    ]

    results = []
    for extractor in extractors:
        try:
            result = extractor(zf)
            if result is not None:
                results.append(result)
        except Exception as e:
            debug_log(f"Error in {extractor.__name__}: {e}")

    if not results:
        debug_log("No Pokemon Go data could be extracted from the ZIP")

    return results


def process(session_id):
    global last_donation_id
    progress = 0
    debug_log(f"Starting process with session_id: {session_id}")
    yield donate(f"{session_id}-tracking", '[{ "message": "user entered script" }]')
    debug_log("Donation tracking completed")
    
    # Set a default last_donation_id at the beginning
    last_donation_id = None  # Will be set to session_id when user actually donates
    debug_log(f"Set initial donation ID: {last_donation_id}")
    
    # Correctly access the platform from the global py_script object
    import sys
    platform = 'ActivityWatch'  # Default fallback - this is likely ActivityWatch data donation
    
    # The platform is set on the py_script object in JavaScript, not on the process function
    try:
        debug_log(f"Global variables available: {list(globals().keys())}")
        # Try to access the platform from the calling object (py_script)
        # We can use 'platform' attribute if it exists in the global scope
        if 'platform' in globals():
            platform = globals()['platform']
            debug_log(f"Using platform from globals: {platform}")
        else:
            debug_log("Platform not found in globals")
            # Use the __builtins__.get method to access global variables
            import builtins
            module = sys.modules.get('__main__')
            debug_log(f"Module: {module}")
            if hasattr(module, 'py_script'):
                debug_log(f"py_script found in module, attributes: {dir(module.py_script) if hasattr(module, 'py_script') else 'None'}")
                if hasattr(module.py_script, 'platform'):
                    platform = module.py_script.platform
                    debug_log(f"Using platform from py_script: {platform}")
                else:
                    debug_log("py_script found but no platform attribute")
                    # Default to ActivityWatch instead of TikTok since this is the expected case
                    platform = 'ActivityWatch'
            else:
                debug_log("Could not find py_script in module, defaulting to ActivityWatch")
                # Default to ActivityWatch instead of TikTok since this is the expected case
                platform = 'ActivityWatch'
    except Exception as e:
        debug_log(f"Error accessing platform: {str(e)}")
        import traceback
        debug_log(f"Traceback: {traceback.format_exc()}")
        debug_log("Defaulting to ActivityWatch")
        platform = 'ActivityWatch'
    
    debug_log(f"Final platform value: {platform}")
    
    # Create the DataDonation object with the dynamic platform
    debug_log(f"Creating DataDonation for {platform}")
    
    # Select the appropriate extractor based on platform
    if platform == 'ActivityWatch':
        debug_log("Using ActivityWatch extractor")
        data_donation = DataDonation(platform, "application/json",
                                     lambda file_path: extract_activitywatch_data(file_path))
    elif platform == 'PokemonGo':
        debug_log("Using Pokemon Go extractor")
        data_donation = DataDonation(platform, "application/zip,application/json",
                                     lambda file_path: extract_data_pokemongo(file_path))
    else:
        debug_log(f"Using default extractor for {platform}")
        data_donation = DataDonation(platform, "application/json",
                                     lambda file_path: extract_data(file_path, platform))
    
    # Process the data donation
    debug_log("Starting data_donation process")
    try:
        yield from data_donation(session_id)
        debug_log("Data donation process completed")
    except Exception as e:
        debug_log(f"Error in data_donation: {str(e)}")
        import traceback
        traceback.print_exc()
    
    # Ensure we have a valid donation ID before showing the end page, but only if user donated
    if user_donated and not last_donation_id:
        debug_log("User donated but no donation ID was set during the process, using numeric fallback")
        # If user donated but no donation ID was set during the process, use a numeric fallback
        last_donation_id = str(session_id)
        debug_log(f"[DONATION_TRACKING] Set fallback donation ID: {last_donation_id}")
    elif not user_donated:
        debug_log("User declined donation, clearing any existing donation ID")
        last_donation_id = None
    
    debug_log(f"Final donation ID for end page: {last_donation_id}")
    debug_log("Waiting for database response before rendering end page")
    # End page will be rendered by the bridge after database operation completes

def render_end_page():
    global last_donation_id, user_donated
    print("arrived at render_end_page()")
    # Create end page with submission ID and donation status
    debug_log(f"[DONATION_TRACKING] Rendering end page with donation ID: {last_donation_id}")
    debug_log(f"[DONATION_TRACKING] User donated: {user_donated}")
    debug_log(f"[DONATION_TRACKING] End page submission ID type: {type(last_donation_id)}")
    
    # Only set a default value if the user donated but ID is missing
    if user_donated and not last_donation_id:
        debug_log("[DONATION_TRACKING] Warning: User donated but no donation ID was set, using a default value")
        last_donation_id = "default-submission-id"
        debug_log(f"[DONATION_TRACKING] Set fallback donation ID: {last_donation_id}")
    elif not user_donated:
        debug_log("[DONATION_TRACKING] User declined donation, no submission ID needed")
        last_donation_id = None
        
    # Strip platform suffix from donation ID before showing to user
    display_submission_id = last_donation_id
    if last_donation_id and user_donated and '-' in str(last_donation_id):
        # Remove platform suffix (e.g., "12345-TikTok" -> "12345")
        display_submission_id = str(last_donation_id).split('-')[0]
        debug_log(f"[DONATION_TRACKING] Stripped platform suffix: {last_donation_id} -> {display_submission_id}")
        
    debug_log(f"[DONATION_TRACKING] Final donation ID for end page: {display_submission_id}")
    page = props.PropsUIPageEnd(display_submission_id, user_donated)
    debug_log(f"[DONATION_TRACKING] Created PropsUIPageEnd with submission_id: {display_submission_id}, donated: {user_donated}")
    return CommandUIRender(page)

def render_splash_pace():
    page = props.Props

def render_donation_page(platform, body, progress):
    header = props.PropsUIHeader(props.Translatable({"en": platform, "nl": platform}))
    # footer = props.PropsUIFooter(progress)
    page = props.PropsUIPageDonation(platform, header, body)
    return CommandUIRender(page)

def retry_confirmation(platform):
    text = props.Translatable(
        {
            "en": f"Unfortunately, we cannot process your data. Please make sure that you downloaded your data from {platform} in JSON format, and selected the correct file.",
            "nl": f"Helaas, kunnen we uw {platform} bestand niet verwerken. Weet u zeker dat u het juiste bestand heeft gekozen? Ga dan verder. Probeer opnieuw als u een ander bestand wilt kiezen.",
        }
    )
    ok = props.Translatable({"en": "Try again", "nl": "Probeer opnieuw"})
    cancel = props.Translatable({"en": "Continue", "nl": "Verder"})
    return props.PropsUIPromptConfirm(text, ok, cancel)


def prompt_consent(id, data, meta_data):
    table_title = props.Translatable(
        {"en": "JSON file contents", "nl": "Inhoud zip bestand"}
    )

    log_title = props.Translatable({"en": "Log messages", "nl": "Log berichten"})

    data_frame = pd.DataFrame(data, columns=["filename", "compressed size", "size"])
    table = props.PropsUIPromptConsentFormTable("zip_content", table_title, data_frame)
    meta_frame = pd.DataFrame(meta_data, columns=["type", "message"])
    meta_table = props.PropsUIPromptConsentFormTable(
        "log_messages", log_title, meta_frame
    )
    return props.PropsUIPromptConsentForm([table], [meta_table])


def donate(key, json_string):
    global last_donation_id, user_donated
    print(f"arrived at donate() with key: {key}")
    debug_log(f"[DONATION_TRACKING] Setting donation ID: {key}")
    debug_log(f"[DONATION_TRACKING] Previous donation ID was: {last_donation_id}")
    # Store the donation key for later use in the end page
    last_donation_id = key
    user_donated = True
    debug_log(f"[DONATION_TRACKING] Updated donation ID to: {last_donation_id}")
    debug_log(f"[DONATION_TRACKING] Set user_donated to: {user_donated}")
    return CommandSystemDonate(key, json_string)


# main function to extract all various data from the JSON file
def extract_data_tiktok(path):
    print('started extracting data')
    extractors = [
        extract_likes,
        extract_watch_history,
        extract_logins,
        extract_video_uploads,
        extract_purchases,
        extract_id
    ]
    print(f"Extracting data from {path}")
    jsonfile = load_json(path)
    return [extractor(jsonfile) for extractor in extractors]


if __name__ == "__main__":
    import sys

    if len(sys.argv) > 1:
        print(extract_data(sys.argv[1]))
    else:
        print("please provide a JSON file as argument")
