import { CommandSystem, CommandSystemDonate, CommandSystemExit, isCommandSystemDonate, isCommandSystemExit } from './framework/types/commands';
import { Bridge } from './framework/types/modules';
import { supabase } from './utils/supabase';

declare global {
  interface Window {
    submissionId: number | undefined;
  }
}

// Generate a random 16-digit submission ID as a number
function generateSubmissionId(): number {
  // Generate a number between 1000_0000_0000_0000 and 9999_9999_9999_9999
  return Math.floor(1000_0000_0000_0000 + Math.random() * 9000_0000_0000_0000);
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
      const isTikTokDonation = command.key.endsWith('-TikTok');
      const isActivityWatchDonation = command.key.endsWith('-ActivityWatch');
      
      // Skip tracking messages that aren't platform donations
      if (!isTikTokDonation && !isActivityWatchDonation) {
        console.log('[FakeBridge] Skipping tracking message:', command.key);
        return;
      }

      const platform = isTikTokDonation ? 'TikTok' : 'ActivityWatch';
      console.log(`[FakeBridge] Processing ${platform} data:`, {
        key: command.key,
        tableName: 'uploads',
        insertData: {
          json_data: data,
          filename: `${command.key}.json`
        }
      });

      // Find the metadata section that contains the original filename
      const metadata = data.find((item: DataItem) => item.id === 'metadata');
      console.log('[FakeBridge] Full data structure:', JSON.stringify(data, null, 2));
      console.log('[FakeBridge] Metadata object:', JSON.stringify(metadata, null, 2));
      
      // Get filename from the DataFrame's split format
      const originalFilename = metadata?.data_frame?.columns?.includes('original_filename') 
        ? metadata.data_frame.data[0][metadata.data_frame.columns.indexOf('original_filename')]
        : 'unknown.json';
      console.log('[FakeBridge] Extracted filename:', originalFilename);

      // Insert into Supabase with detailed error handling
      window.submissionId = generateSubmissionId();
      
      const { data: insertedData, error } = await supabase
        .from('uploads')
        .insert({
          json_data: data.filter((item: DataItem) => item.id !== 'metadata'),  // Remove metadata from stored data
          submission_id: window.submissionId,
          platform: platform,
          // created_at will be automatically set by Supabase
        });

      if (error) {
        throw error;
      }

      console.log(`[FakeBridge] ${platform} data saved successfully to Supabase:`, insertedData);
      
      // After successful save, exit with submission ID
      this.handleExit({
        __type__: 'CommandSystemExit',
        code: 0,
        info: window.submissionId?.toString() || 'unknown'
      });
    } catch (error: unknown) {
      const err = error as Error;
      console.error('[FakeBridge] Error saving to Supabase:', {
        message: err.message,
        key: command.key,
        timestamp: new Date().toISOString()
      });
      console.error('Please check:');
      console.error('1. Supabase connection (see previous logs)');
      console.error('2. Database permissions for the uploads table');
      console.error('3. Valid JSON data structure');
    }
  }

  handleExit(command: CommandSystemExit): void {
    console.log(`[FakeBridge] received exit: ${command.code}=${command.info}`);
  }
}
