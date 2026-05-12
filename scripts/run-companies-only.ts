import 'dotenv/config';
import * as db from '../server/db';
import { fetchCompanyCsv, knownCompanyDirNames } from '../server/sync/liquidslr';
import { COMPANY_SLUG_MAP } from '../server/sync/constants';

(async () => {
  const dirs = knownCompanyDirNames();
  const skipSet = new Set((process.env.SKIP_COMPANIES ?? '').split(',').filter(Boolean));
  let total = 0,
    failed = 0;
  for (const dir of dirs) {
    if (skipSet.has(dir)) {
      console.log(`${dir}: skipped (already loaded)`);
      continue;
    }
    try {
      const rows = await fetchCompanyCsv(dir, 'all');
      console.log(`${dir}: ${rows.length} rows`);
      for (const row of rows) {
        let p = await db.getProblemBySlug(row.titleSlug);
        if (!p) {
          await db.upsertProblem({
            frontendId: -1,
            titleSlug: row.titleSlug,
            titleEn: row.title,
            difficulty: row.difficulty,
            paidOnly: false,
          });
          p = await db.getProblemBySlug(row.titleSlug);
        }
        if (p) {
          await db.upsertCompanyTag({
            problemId: p.id,
            companySlug: COMPANY_SLUG_MAP[dir] ?? dir.toLowerCase(),
            companyName: dir,
            frequency: String(row.frequency),
            timeframe: 'all',
            source: 'liquidslr',
          });
          total++;
        }
      }
    } catch (e) {
      failed++;
      console.log(`${dir}: ERROR — ${(e as Error).message}`);
    }
  }
  console.log(`\nDone. tags=${total} dirsFailed=${failed}/${dirs.length}`);
  process.exit(0);
})();
