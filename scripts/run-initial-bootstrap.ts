import 'dotenv/config';
import { runSync } from '../server/sync';

(async () => {
  const r = await runSync('initial-bootstrap');
  console.log(JSON.stringify(r, null, 2));
  process.exit(r.status === 'success' ? 0 : 1);
})();
