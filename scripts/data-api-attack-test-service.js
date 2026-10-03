
const URL = 'https://hooemticmycoqhoccdsn.supabase.co/rest/v1';
const SERVICE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imhvb2VtdGljbXljb3Fob2NjZHNuIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc5MDg1NjM2MCwiZXhwIjoyMTA2NDMyMzYwfQ.pX1nlIOpFTFFKYr7KQgL8zzi9OQFolENz2WnqZLPlA4';

async function run() {
  const headers = { 'apikey': SERVICE_KEY, 'Authorization': `Bearer ${SERVICE_KEY}`, 'Content-Type': 'application/json' };
  
  // GET (SELECT)
  const getRes = await fetch(`${URL}/runtime_checkins?select=*&limit=1`, { headers });
  const getText = await getRes.text();
  console.log(`[SERVICE] SELECT runtime_checkins -> Status: ${getRes.status} (Body: ${getText})`);
}

run();
