import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.REACT_APP_SUPABASE_URL;
const supabaseKey = process.env.REACT_APP_SUPABASE_ANON_KEY;

// Only log errors for missing environment variables, no sensitive data
if (!supabaseUrl || !supabaseKey) {
    console.error('Missing Supabase environment variables. Please check your .env.local file.');
    throw new Error('Missing Supabase environment variables. Make sure .env.local contains REACT_APP_SUPABASE_URL and REACT_APP_SUPABASE_ANON_KEY');
}

export const supabase = createClient(supabaseUrl, supabaseKey);

// Test the connection silently
const testConnection = async () => {
    try {
        await supabase.from('uploads').select('count', { count: 'exact', head: true });
        // Connection successful - no need to log in production
    } catch (error: unknown) {
        const err = error as Error;
        console.error('Database connection error. Please verify your configuration.');
        // Don't log detailed error messages that could expose system information
    }
};

testConnection();
