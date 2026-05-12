import { listProblemsQuery, buildListSql } from '../server/db';

(async () => {
  console.log('--- buildListSql for listSlug=top-100-liked ---');
  const built = buildListSql({ filters: { listSlug: 'top-100-liked' }, limit: 50 });
  console.log('SQL :', built.sql);
  console.log('PRMS:', built.params);

  console.log('\n--- run listProblemsQuery({listSlug}) ---');
  try {
    const r1 = await listProblemsQuery({ filters: { listSlug: 'top-100-liked' }, limit: 50 });
    console.log('items.len =', (r1.items as unknown[]).length);
    console.log('first =', (r1.items as Array<{ id: number; titleSlug: string }>)[0]);
  } catch (e) {
    console.error('list-by-slug failed:', e);
  }

  console.log('\n--- run listProblemsQuery({companySlug:google}) ---');
  try {
    const r2 = await listProblemsQuery({ filters: { companySlug: 'google' }, limit: 50 });
    console.log('items.len =', (r2.items as unknown[]).length);
  } catch (e) {
    console.error('list-by-company failed:', e);
  }

  console.log('\n--- run listProblemsQuery({}) [no filter] ---');
  try {
    const r3 = await listProblemsQuery({ filters: {}, limit: 5 });
    console.log('items.len =', (r3.items as unknown[]).length);
    console.log('first =', (r3.items as Array<{ id: number }>)[0]);
  } catch (e) {
    console.error('list-no-filter failed:', e);
  }
  process.exit(0);
})();
