import 'dotenv/config';
import { fetchListProblems, fetchQuestionDetailEn } from '../server/sync/leetcode';
import { fetchCompanyCsv, knownCompanyDirNames } from '../server/sync/liquidslr';
import { probeLeetcodeCn } from '../server/sync';

(async () => {
  console.log('--- probeLeetcodeCn ---');
  try {
    console.log(await probeLeetcodeCn());
  } catch (e) {
    console.log('probe error:', (e as Error).message);
  }

  console.log('--- fetchListProblems(top-100-liked) ---');
  try {
    const items = await fetchListProblems('top-100-liked');
    console.log('count =', items.length, 'first =', items[0]);
  } catch (e) {
    console.log('error:', (e as Error).message);
  }

  console.log('--- fetchQuestionDetailEn(two-sum) ---');
  try {
    const en = await fetchQuestionDetailEn('two-sum');
    console.log('have content?', !!en?.contentEn, 'length =', en?.contentEn?.length);
  } catch (e) {
    console.log('error:', (e as Error).message);
  }

  console.log('--- knownCompanyDirNames ---');
  console.log(knownCompanyDirNames().slice(0, 5), '...');

  console.log('--- fetchCompanyCsv(Google, all) ---');
  try {
    const rows = await fetchCompanyCsv('Google', 'all');
    console.log('rows =', rows.length, 'first =', rows[0]);
  } catch (e) {
    console.log('error:', (e as Error).message);
  }
})();
