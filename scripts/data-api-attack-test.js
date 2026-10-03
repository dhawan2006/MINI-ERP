const URL = 'https://rmkosqdgltiimdhpmrsk.supabase.co/rest/v1';
const ANON_KEY = 'sb_publishable_5TPDAVONuA2rjU5JYYq0Kg_ZNeIqoBB';

const tables = [
  'activation_requests', 'admin_roles', 'audit_events', 'customers',
  'device_challenges', 'devices', 'license_bindings', 'licenses',
  'lifecycle_requests', 'runtime_checkin_challenges', 'runtime_checkin_requests',
  'runtime_checkins', 'runtime_directive_deliveries', 'runtime_directives'
];

async function run() {
  console.log('--- ANON DATA API ATTACK TESTS ---');
  let success = true;
  for (const table of tables) {
    const headers = { 'apikey': ANON_KEY, 'Authorization': `Bearer ${ANON_KEY}`, 'Content-Type': 'application/json' };
    
    // GET (SELECT)
    const getRes = await fetch(`${URL}/${table}?select=*&limit=1`, { headers });
    const getText = await getRes.text();
    console.log(`[ANON] SELECT ${table} -> Status: ${getRes.status} (Body: ${getText})`);
    if (getRes.status === 200) {
      console.error(`ERROR: ${table} is readable by anon!`);
      success = false;
    }

    // POST (INSERT)
    const postRes = await fetch(`${URL}/${table}`, { method: 'POST', headers, body: JSON.stringify({}) });
    const postText = await postRes.text();
    console.log(`[ANON] INSERT ${table} -> Status: ${postRes.status} (Body: ${postText})`);
    if (postRes.status === 200 || postRes.status === 201) {
      console.error(`ERROR: ${table} is writable by anon!`);
      success = false;
    }

    // PATCH (UPDATE)
    const patchRes = await fetch(`${URL}/${table}?id=eq.1`, { method: 'PATCH', headers, body: JSON.stringify({}) });
    const patchText = await patchRes.text();
    console.log(`[ANON] UPDATE ${table} -> Status: ${patchRes.status} (Body: ${patchText})`);
    if (patchRes.status === 200 || patchRes.status === 204) {
      console.error(`ERROR: ${table} is updatable by anon!`);
      success = false;
    }

    // DELETE
    const deleteRes = await fetch(`${URL}/${table}?id=eq.1`, { method: 'DELETE', headers });
    const deleteText = await deleteRes.text();
    console.log(`[ANON] DELETE ${table} -> Status: ${deleteRes.status} (Body: ${deleteText})`);
    if (deleteRes.status === 200 || deleteRes.status === 204) {
      console.error(`ERROR: ${table} is deletable by anon!`);
      success = false;
    }
  }

  if (success) {
    console.log('\n✅ All Data API Attack tests passed. All sensitive tables are inaccessible.');
  } else {
    console.error('\n❌ Some Data API Attack tests failed!');
    process.exit(1);
  }
}

run();
