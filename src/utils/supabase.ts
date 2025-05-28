import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.REACT_APP_SUPABASE_URL;
const supabaseKey = process.env.REACT_APP_SUPABASE_ANON_KEY;

// Log partial information for debugging
if (supabaseUrl) {
  console.log('Supabase URL:', supabaseUrl);
} else {
  console.error('Supabase URL is missing!');
}

if (supabaseKey) {
  // Don't log the full key for security, just the first few characters
  console.log('Supabase Key (first 10 chars):', supabaseKey.substring(0, 10) + '...');
} else {
  console.error('Supabase Key is missing!');
}

if (!supabaseUrl || !supabaseKey) {
    console.error('Please check that you have a .env.local file in the root directory');
    console.error('The file should contain REACT_APP_SUPABASE_URL and REACT_APP_SUPABASE_ANON_KEY');
    throw new Error('Missing Supabase environment variables. Make sure .env.local contains REACT_APP_SUPABASE_URL and REACT_APP_SUPABASE_ANON_KEY');
}

export const supabase = createClient(supabaseUrl, supabaseKey);

// Test the connection
const testConnection = async () => {
    try {
        await supabase.from('uploads').select('count', { count: 'exact', head: true });
        console.log('Successfully connected to Supabase');
    } catch (error: unknown) {
        const err = error as Error;
        console.error('Error connecting to Supabase:', err.message);
        console.error('Please verify your environment variables and database permissions');
    }
};

testConnection();
