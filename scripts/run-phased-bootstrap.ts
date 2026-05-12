import 'dotenv/config';
import { runSync } from '../server/sync';

(async () => {
  console.log('--- Phase 1: daily-sync-lists ---');
  const r1 = await runSync('daily-sync-lists');
  console.log('Phase 1 done:', r1);

  console.log('--- Phase 2: daily-sync-companies ---');
  const r2 = await runSync('daily-sync-companies');
  console.log('Phase 2 done:', r2);

  console.log('--- Phase 3: daily-sync-meta ---');
  const r3 = await runSync('daily-sync-meta');
  console.log('Phase 3 done:', r3);

  process.exit(0);
})();
