import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';

const supabase = createClient(
  process.env.SUPABASE_URL || 'http://localhost:54321',
  process.env.SUPABASE_ANON_KEY || 'dummy'
);

async function run() {
  // Just to see the methods
  console.log(Object.keys(supabase.auth));
}
run();
