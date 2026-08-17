#!/usr/bin/env python3
"""
Test script to verify streaming array parsers can correctly identify
the requisite number of entries in tests/300mb.json
"""

import sys
import os
sys.path.append('/var/www/datadonation-metl/src/framework/processing/py')

from port.script import StreamingTikTokData, StreamingArray

def test_streaming_array_counts():
    """Test streaming array parser counts against expected values"""
    
    test_file = '/var/www/datadonation-metl/tests/300mb.json'
    
    # Expected counts from jq analysis
    expected_counts = {
        'Post.Posts.VideoList': 78,
        'Profile And Settings.Follower.FansList': 285,
        'Profile And Settings.Following.Following': 9410,
        'Your Activity.Login History.LoginHistoryList': 13265,
        'Your Activity.Searches.SearchList': 5024,
        'Your Activity.Share History.ShareHistoryList': 1475,
        'Your Activity.Watch History.VideoList': 2076773
    }
    
    print(f"Testing streaming array parser with {test_file}")
    print("=" * 60)
    
    try:
        # Load using streaming parser
        streaming_data = StreamingTikTokData(test_file)
        
        # Test each expected array
        results = {}
        
        # Test Post.Posts.VideoList
        print("Testing Post.Posts.VideoList...")
        post_section = streaming_data.get('Post', {})
        posts = post_section.get('Posts', {})
        if 'VideoList' in posts:
            video_list = posts['VideoList']
            if hasattr(video_list, '__len__'):
                count = len(video_list)
            else:
                # For streaming arrays, count by iteration
                count = sum(1 for _ in video_list)
            results['Post.Posts.VideoList'] = count
            print(f"  Found {count} entries (expected {expected_counts['Post.Posts.VideoList']})")
        
        # Test Profile And Settings.Follower.FansList
        print("Testing Profile And Settings.Follower.FansList...")
        profile_section = streaming_data.get('Profile And Settings', {})
        follower = profile_section.get('Follower', {})
        if 'FansList' in follower:
            fans_list = follower['FansList']
            if hasattr(fans_list, '__len__'):
                count = len(fans_list)
            else:
                count = sum(1 for _ in fans_list)
            results['Profile And Settings.Follower.FansList'] = count
            print(f"  Found {count} entries (expected {expected_counts['Profile And Settings.Follower.FansList']})")
        
        # Test Profile And Settings.Following.Following
        print("Testing Profile And Settings.Following.Following...")
        following = profile_section.get('Following', {})
        if 'Following' in following:
            following_list = following['Following']
            if hasattr(following_list, '__len__'):
                count = len(following_list)
            else:
                count = sum(1 for _ in following_list)
            results['Profile And Settings.Following.Following'] = count
            print(f"  Found {count} entries (expected {expected_counts['Profile And Settings.Following.Following']})")
        
        # Test Your Activity.Login History.LoginHistoryList
        print("Testing Your Activity.Login History.LoginHistoryList...")
        activity_section = streaming_data.get('Your Activity', {})
        login_history = activity_section.get('Login History', {})
        if 'LoginHistoryList' in login_history:
            login_list = login_history['LoginHistoryList']
            if hasattr(login_list, '__len__'):
                count = len(login_list)
            else:
                count = sum(1 for _ in login_list)
            results['Your Activity.Login History.LoginHistoryList'] = count
            print(f"  Found {count} entries (expected {expected_counts['Your Activity.Login History.LoginHistoryList']})")
        
        # Test Your Activity.Searches.SearchList
        print("Testing Your Activity.Searches.SearchList...")
        searches = activity_section.get('Searches', {})
        if 'SearchList' in searches:
            search_list = searches['SearchList']
            if hasattr(search_list, '__len__'):
                count = len(search_list)
            else:
                count = sum(1 for _ in search_list)
            results['Your Activity.Searches.SearchList'] = count
            print(f"  Found {count} entries (expected {expected_counts['Your Activity.Searches.SearchList']})")
        
        # Test Your Activity.Share History.ShareHistoryList
        print("Testing Your Activity.Share History.ShareHistoryList...")
        share_history = activity_section.get('Share History', {})
        if 'ShareHistoryList' in share_history:
            share_list = share_history['ShareHistoryList']
            if hasattr(share_list, '__len__'):
                count = len(share_list)
            else:
                count = sum(1 for _ in share_list)
            results['Your Activity.Share History.ShareHistoryList'] = count
            print(f"  Found {count} entries (expected {expected_counts['Your Activity.Share History.ShareHistoryList']})")
        
        # Test Your Activity.Watch History.VideoList (largest array)
        print("Testing Your Activity.Watch History.VideoList...")
        watch_history = activity_section.get('Watch History', {})
        if 'VideoList' in watch_history:
            watch_list = watch_history['VideoList']
            if hasattr(watch_list, '__len__'):
                count = len(watch_list)
            else:
                # For very large arrays, count in batches to show progress
                count = 0
                for i, item in enumerate(watch_list):
                    count += 1
                    if count % 100000 == 0:
                        print(f"    Processed {count} items...")
            results['Your Activity.Watch History.VideoList'] = count
            print(f"  Found {count} entries (expected {expected_counts['Your Activity.Watch History.VideoList']})")
        
        # Print summary
        print("\n" + "=" * 60)
        print("SUMMARY:")
        print("=" * 60)
        
        all_correct = True
        for key, expected in expected_counts.items():
            actual = results.get(key, 0)
            status = "✓" if actual == expected else "✗"
            print(f"{status} {key}: {actual} (expected {expected})")
            if actual != expected:
                all_correct = False
        
        print(f"\nOverall result: {'PASS' if all_correct else 'FAIL'}")
        return all_correct
        
    except Exception as e:
        print(f"Error during testing: {e}")
        import traceback
        traceback.print_exc()
        return False

if __name__ == "__main__":
    success = test_streaming_array_counts()
    sys.exit(0 if success else 1)