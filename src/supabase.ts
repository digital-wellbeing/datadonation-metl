import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.REACT_APP_SUPABASE_URL
const supabaseAnonKey = process.env.REACT_APP_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseAnonKey) {
  console.error('Missing Supabase environment variables')
  console.error('Please create a .env.local file with REACT_APP_SUPABASE_URL and REACT_APP_SUPABASE_ANON_KEY variables')
  throw new Error('Supabase URL or Anon Key is missing in environment variables.')
}

// 5 minutes = 300 seconds = 300,000 milliseconds
const FIVE_MINUTES_MS = 300000

const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
  },
  global: {
    // Set 5-minute timeout for all requests
    fetch: (url, options) => {
      return fetch(url, {
        ...options,
        signal: AbortSignal.timeout(FIVE_MINUTES_MS),
      })
    }
  }
})

export default supabase