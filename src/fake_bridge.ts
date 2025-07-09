import { CommandSystem, CommandSystemDonate, CommandSystemExit, isCommandSystemDonate, isCommandSystemExit } from './framework/types/commands';
import { Bridge } from './framework/types/modules';
import { supabase } from './utils/supabase';

declare global {
  interface Window {
    submissionId: number | undefined;
    submissionError: {
      message: string;
      code: string;
      timestamp: string;
    } | undefined;
  }
}

// Generate a random 16-digit submission ID as a number
function generateSubmissionId(): number {
  // Generate a number between 1000_0000_0000_0000 and 9999_9999_9999_9999
  const submissionId = Math.floor(1000_0000_0000_0000 + Math.random() * 9000_0000_0000_0000);
  console.log('[FakeBridge] [SUBMISSION_TRACKING] Generated new submission ID:', submissionId);
  return submissionId;
}

interface DataItem {
  id: string;
  title: {
    en: string;
    nl: string;
  };
  data_frame: any;
}

export default class FakeBridge implements Bridge {
  send(command: CommandSystem): void {
    console.log('[FakeBridge] [SUBMISSION_TRACKING] Received command:', {
      type: command.__type__,
      key: isCommandSystemDonate(command) ? command.key : 'N/A',
      timestamp: new Date().toISOString()
    });

    if (isCommandSystemDonate(command)) {
      this.handleDonation(command);
    } else if (isCommandSystemExit(command)) {
      this.handleExit(command);
    } else {
      console.log('[FakeBridge] received unknown command: ' + JSON.stringify(command));
    }
  }

  async handleDonation(command: CommandSystemDonate): Promise<void> {
    try {
      const data = JSON.parse(command.json_string);
      
      // Check if this is a platform donation (either TikTok or ActivityWatch) or just a tracking message
      const isTikTokDonation = command.key.endsWith('-TikTok') || command.key.endsWith('-Tiktok');
      const isActivityWatchDonation = command.key.endsWith('-ActivityWatch') || command.key.endsWith('-Activitywatch');
      
      // Skip tracking messages that aren't platform donations
      if (!isTikTokDonation && !isActivityWatchDonation) {
        console.log('[FakeBridge] Skipping tracking message:', command.key);
        return;
      }

      const platform = isTikTokDonation ? 'TikTok' : 'ActivityWatch';
      console.log(`[FakeBridge] [SUBMISSION_TRACKING] Processing ${platform} data donation:`, {
        key: command.key,
        platform: platform,
        timestamp: new Date().toISOString()
      });

      // Use existing submission ID that was generated when user clicked "Yes, donate"
      if (!window.submissionId) {
        console.error('[FakeBridge] [SUBMISSION_TRACKING] ERROR: No submission ID found! This should have been generated when user clicked "Yes, donate"');
        window.submissionId = generateSubmissionId();
        console.log('[FakeBridge] [SUBMISSION_TRACKING] Generated fallback submission ID:', window.submissionId);
      } else {
        console.log('[FakeBridge] [SUBMISSION_TRACKING] Using submission ID from donate button click:', window.submissionId);
      }

      // Find the metadata section that contains the original filename
      const metadata = data.find((item: DataItem) => item.id === 'metadata');
      console.log('[FakeBridge] Metadata object found:', !!metadata);
      
      // Get filename from the DataFrame's split format
      const originalFilename = metadata?.data_frame?.columns?.includes('original_filename') 
        ? metadata.data_frame.data[0][metadata.data_frame.columns.indexOf('original_filename')]
        : 'unknown.json';
      console.log('[FakeBridge] Extracted filename:', originalFilename);

      // Insert into Supabase with detailed error handling
      console.log('[FakeBridge] [SUBMISSION_TRACKING] Attempting database insert with submission ID:', window.submissionId);
      
      const { data: insertedData, error } = await supabase
        .from('uploads')
        .insert({
          json_data: data.filter((item: DataItem) => item.id !== 'metadata'),  // Remove metadata from stored data
          submission_id: window.submissionId,  // Use the frontend-generated submission ID
          platform: platform,
          // created_at will be automatically set by Supabase
        });

      if (error) {
        console.error('[FakeBridge] [SUBMISSION_TRACKING] Database insert failed:', error);
        
        // Store error information in window for end page to access
        window.submissionError = {
          message: error.message,
          code: error.code || 'unknown',
          timestamp: new Date().toLocaleString('en-GB', { 
            day: '2-digit', 
            month: '2-digit', 
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit'
          })
        };
        
        throw error;
      }

      console.log(`[FakeBridge] [SUBMISSION_TRACKING] ${platform} data saved successfully to Supabase`);
      console.log('[FakeBridge] [SUBMISSION_TRACKING] Database insert completed with submission ID:', window.submissionId);
      
      // After successful save, exit with submission ID and donation status
      const exitInfo = window.submissionId?.toString() || 'unknown';
      if (!window.submissionId) {
        console.error('[FakeBridge] [SUBMISSION_TRACKING] ERROR: No submission ID available for exit command!');
      }
      
      console.log('[FakeBridge] [SUBMISSION_TRACKING] Preparing exit with frontend submission ID info:', exitInfo);
      console.log('[FakeBridge] [SUBMISSION_TRACKING] User donated successfully, setting donation status to true');
      console.log('[FakeBridge] [SUBMISSION_TRACKING] ✅ SUCCESS: Frontend and database now use the same ID:', window.submissionId);
      
      // Set global donation status for the worker to use
      (globalThis as any).userDonated = true;
      
      this.handleExit({
        __type__: 'CommandSystemExit',
        code: 0,
        info: exitInfo
      });
    } catch (error: unknown) {
      const err = error as Error;
      console.error('[FakeBridge] [SUBMISSION_TRACKING] Error saving to Supabase:', {
        message: err.message,
        key: command.key,
        submissionId: window.submissionId,
        timestamp: new Date().toISOString()
      });
      console.error('Please check:');
      console.error('1. Supabase connection (see previous logs)');
      console.error('2. Database permissions for the uploads table');
      console.error('3. Valid JSON data structure');
      
      // Even on error, try to exit gracefully with whatever submission ID we have
      const exitInfo = window.submissionId?.toString() || 'error';
      console.log('[FakeBridge] [SUBMISSION_TRACKING] Exiting with error, submission ID:', exitInfo);
      this.handleExit({
        __type__: 'CommandSystemExit',
        code: 1,
        info: exitInfo
      });
    }
  }

  handleExit(command: CommandSystemExit): void {
    console.log('[FakeBridge] [SUBMISSION_TRACKING] Handling exit command:', {
      type: command.__type__,
      code: command.code,
      info: command.info,
      windowSubmissionId: window.submissionId,
      timestamp: new Date().toISOString()
    });
    
    // Ensure submission ID consistency
    if (command.info && typeof command.info === 'string' && !window.submissionId) {
      console.log('[FakeBridge] [SUBMISSION_TRACKING] Setting window.submissionId from exit command info');
      const parsedId = parseInt(command.info, 10);
      if (!isNaN(parsedId)) {
        window.submissionId = parsedId;
      }
    }
    
    console.log('[FakeBridge] [SUBMISSION_TRACKING] Final state before exit:', {
      commandInfo: command.info,
      windowSubmissionId: window.submissionId,
      hasSubmissionId: !!(command.info || window.submissionId)
    });
    
    // Exit is handled by the processing engine
  }
}
