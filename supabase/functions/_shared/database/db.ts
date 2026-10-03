import postgres from 'https://deno.land/x/postgresjs@v3.4.4/mod.js';

let sql: postgres.Sql | null = null;

export function getDb() {
  if (sql) return sql;
  
  // Hosted Supabase uses SUPABASE_DB_URL for direct connections
  const dbUrl = Deno.env.get('SUPABASE_DB_URL') || Deno.env.get('DB_URL');
  if (!dbUrl) {
    throw new Error('Database connection string not configured (missing SUPABASE_DB_URL or DB_URL)');
  }

  sql = postgres(dbUrl, {
    prepare: false, // Required for transaction pooler compatibility (if ever used)
    max: 10, // Bounded pool for Edge Functions
  });

  return sql;
}
