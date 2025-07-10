import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.REACT_APP_SUPABASE_URL;
const supabaseKey = process.env.REACT_APP_SUPABASE_ANON_KEY;

// Only log errors for missing environment variables, no sensitive data
if (!supabaseUrl || !supabaseKey) {
    console.error('Missing Supabase environment variables. Please check your .env.local file.');
    throw new Error('Missing Supabase environment variables. Make sure .env.local contains REACT_APP_SUPABASE_URL and REACT_APP_SUPABASE_ANON_KEY');
}

// 5 minutes = 300 seconds = 300,000 milliseconds
const FIVE_MINUTES_MS = 300000;

export const supabase = createClient(supabaseUrl, supabaseKey, {
    auth: {
        persistSession: true,
    },
    global: {
        // Set 5-minute timeout for all requests
        fetch: (url, options) => {
            const headers = new Headers(options?.headers || {});
            headers.set('Prefer', 'return=minimal');
            
            return fetch(url, {
                ...options,
                signal: AbortSignal.timeout(FIVE_MINUTES_MS),
                headers: headers
            });
        }
    }
});

// Connection test removed - RLS policies don't allow anonymous SELECT operations
