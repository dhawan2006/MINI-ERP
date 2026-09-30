const path = require('path');

function runCheck() {
  const cwd = process.cwd();
  
  console.log(`[Prebuild Check] Validating build path: ${cwd}`);
  
  if (cwd.includes(' ')) {
    if (process.env.MINIPOS_ALLOW_SPACES_IN_BUILD_PATH === '1') {
      console.warn('⚠️ [Prebuild Check] WARNING: Build path contains spaces.');
      console.warn('⚠️ [Prebuild Check] MINIPOS_ALLOW_SPACES_IN_BUILD_PATH override detected.');
      console.warn('⚠️ [Prebuild Check] Native modules (better-sqlite3) may compile incorrectly for cross-platform targets.');
    } else {
      console.error('❌ [Prebuild Check] ERROR: Build path contains spaces.');
      console.error('❌ [Prebuild Check] Native Electron modules fail to rebuild correctly in this environment (node-gyp limitation).');
      console.error('❌ [Prebuild Check] This causes corrupted packaged native dependencies when cross-compiling.');
      console.error('\nRecommended Fixes:');
      console.error('  1. Move the repository to a path without spaces.');
      console.error('  2. Build the application through a CI environment.');
      console.error('\nTo override this check (NOT RECOMMENDED for production artifacts):');
      console.error('  export MINIPOS_ALLOW_SPACES_IN_BUILD_PATH=1\n');
      process.exit(1);
    }
  } else {
    console.log('✅ [Prebuild Check] Build path valid (no spaces detected).');
  }
}

runCheck();
