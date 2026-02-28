const { importWatched } = require('./importWatched');
const { importSuperList } = require('./importSuperList');
const { importGapList } = require('./importGapList');

function runFullImport() {
  console.log('=== CLAUDIUS Full Import ===\n');

  console.log('[1/3] Importing watched films...');
  const watchedCount = importWatched();

  console.log('\n[2/3] Importing discovery pool (SUPER-LIST)...');
  const discoveryCount = importSuperList();

  console.log('\n[3/3] Importing gap lists into watchlist...');
  const gapCount = importGapList();

  console.log('\n=== Import Complete ===');
  console.log(`  Films: ${watchedCount}`);
  console.log(`  Discovery pool: ${discoveryCount}`);
  console.log(`  Watchlist items: ${gapCount}`);

  return { watchedCount, discoveryCount, gapCount };
}

if (require.main === module) {
  runFullImport();
}

module.exports = { runFullImport };
