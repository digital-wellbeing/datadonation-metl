import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.REACT_APP_SUPABASE_URL
const supabaseAnonKey = process.env.REACT_APP_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseAnonKey) {
  console.error('Missing Supabase environment variables')
  console.error('Please create a .env.local file with REACT_APP_SUPABASE_URL and REACT_APP_SUPABASE_ANON_KEY variables')
  throw new Error('Supabase URL or Anon Key is missing in environment variables.')
}

const supabase = createClient(supabaseUrl, supabaseAnonKey)

export default supabase