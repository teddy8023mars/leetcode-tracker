import { LEETCODE_CN_GRAPHQL, LEETCODE_US_GRAPHQL, COMPANY_SLUG_MAP } from './constants';
import { taskAiPregenerate } from './aiPregenerate';
import { registerSyncTasks, type ProgressReporter } from './orchestrator';
import {
  fetchListProblems,
  fetchQuestionDetailEn,
  fetchQuestionDetailZh,
  fetchOfficialSolutionZh,
  gql,
} from './leetcode';
import { fetchCompanyCsv, knownCompanyDirNames } from './liquidslr';
import { translateContentToZh } from './translation';
import * as db from '../db';

let _probeFetch: typeof globalThis.fetch = globalThis.fetch.bind(globalThis);
export function __setProbeFetchForTest(fn: typeof globalThis.fetch | undefined) {
  _probeFetch = fn ?? globalThis.fetch.bind(globalThis);
}

const PROBE_QUERY = `query q($titleSlug:String!){question(titleSlug:$titleSlug){translatedTitle}}`;
const PROBE_SLUGS = ['two-sum', 'add-two-numbers', 'reverse-integer'];

export async function probeLeetcodeCn(): Promise<{ available: boolean; succeeded: number }> {
  let ok = 0;
  for (const slug of PROBE_SLUGS) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 8000);
      const res = await _probeFetch(LEETCODE_CN_GRAPHQL, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ query: PROBE_QUERY, variables: { titleSlug: slug } }),
        signal: controller.signal,
      });
      clearTimeout(timeout);
      if (res.ok) {
        const text = await res.text();
        if (!text.startsWith('{')) continue;
        const json = JSON.parse(text) as { data?: { question?: { translatedTitle?: string } } };
        if (json?.data?.question?.translatedTitle) ok++;
      }
    } catch {
      // ignore individual failures (timeout, network, Cloudflare block)
    }
  }
  return { available: ok >= 2, succeeded: ok };
}

async function taskInitialBootstrap(report: ProgressReporter = () => {}) {
  let processed = 0;
  let ok = 0;
  let failed = 0;

  const lists: { slug: string; titleEn: string; titleZh: string }[] = [
    { slug: 'top-100-liked', titleEn: 'Hot 100', titleZh: '热题 100' },
    { slug: 'top-interview-150', titleEn: 'Top Interview 150', titleZh: '面试经典 150 题' },
    { slug: 'leetcode-75', titleEn: 'LeetCode 75', titleZh: 'LeetCode 75' },
    { slug: 'dynamic-programming', titleEn: 'Dynamic Programming', titleZh: '动态规划' },
    { slug: 'amazon-spring-23-high-frequency', titleEn: 'Amazon High Frequency', titleZh: 'Amazon 高频题' },
    { slug: 'google-spring-23-high-frequency', titleEn: 'Google High Frequency', titleZh: 'Google 高频题' },
    { slug: 'top-sql-50', titleEn: 'SQL 50', titleZh: 'SQL 50' },
  ];
  const skipCn = process.env.BOOTSTRAP_SKIP_CN === '1';
  const skipLlm = process.env.BOOTSTRAP_SKIP_LLM === '1';
  console.log('[bootstrap] probing leetcode.cn...');
  const cnAvailable = skipCn ? false : (await probeLeetcodeCn()).available;
  console.log('[bootstrap] cn available:', cnAvailable, 'skipLlm:', skipLlm);

  // Fetch every list up front: one cheap request each, and it makes the item
  // total known before the slow per-problem loop, so the UI can show a bar.
  type FetchedList = {
    listId: number;
    items: Awaited<ReturnType<typeof fetchListProblems>>;
  };
  const fetchedLists: FetchedList[] = [];
  for (const l of lists) {
    try {
      console.log('[bootstrap] fetching list:', l.slug);
      const items = await fetchListProblems(l.slug);
      console.log('[bootstrap] got', items.length, 'items from', l.slug);
      const listId = await db.upsertProblemList({
        slug: l.slug,
        titleEn: l.titleEn,
        titleZh: l.titleZh,
        source: 'leetcode-list',
      });
      fetchedLists.push({ listId, items });
    } catch {
      failed++;
    }
  }

  const companyDirs = knownCompanyDirNames();
  const total = fetchedLists.reduce((n, f) => n + f.items.length, 0) + companyDirs.length;
  const progress = (phase: string) =>
    report({ processed, succeeded: ok, failed, total, phase });
  progress('problems');

  for (const { listId, items } of fetchedLists) {
    try {
      let pos = 0;
      for (const it of items) {
        await db.upsertProblem({
          frontendId: it.frontendId,
          titleSlug: it.titleSlug,
          titleEn: it.titleEn,
          difficulty: it.difficulty,
          paidOnly: it.paidOnly,
          acRate: String(it.acRate),
          topicTagsJson: it.topicTagsJson,
        });
        const p = await db.getProblemBySlug(it.titleSlug);
        if (p) {
          await db.upsertProblemListItem({ listId, problemId: p.id, position: pos++ });
          try {
            const en = await fetchQuestionDetailEn(it.titleSlug);
            if (en) {
              let zhTitle: string | null = null;
              let zhContent: string | null = null;
              let source: 'leetcode-cn' | 'llm-translated' | null = null;
              if (cnAvailable) {
                const zh = await fetchQuestionDetailZh(it.titleSlug);
                if (zh) {
                  zhTitle = zh.titleZh;
                  zhContent = zh.contentZh;
                  source = 'leetcode-cn';
                }
              }
              if (!zhContent && en.contentEn && !skipLlm) {
                const existing = await db.getProblemBySlug(it.titleSlug);
                if (existing?.contentZh) {
                  zhContent = existing.contentZh;
                  source = existing.contentZhSource as 'leetcode-cn' | 'llm-translated' | null;
                } else {
                  zhContent = await translateContentToZh(en.contentEn);
                  if (zhContent) source = 'llm-translated';
                }
              }
              await db.upsertProblem({
                frontendId: it.frontendId,
                titleSlug: it.titleSlug,
                titleEn: it.titleEn,
                difficulty: it.difficulty,
                paidOnly: it.paidOnly,
                titleZh: zhTitle ?? undefined,
                contentEn: en.contentEn,
                contentZh: zhContent ?? undefined,
                contentZhSource: source ?? undefined,
                hintsJson: en.hintsJson,
                exampleTestcases: en.exampleTestcases ?? undefined,
                topicTagsJson: en.topicTagsJson,
                similarQuestionsJson: en.similarQuestionsJson,
                codeSnippetsJson: en.codeSnippetsJson,
                contentFetchedAt: new Date(),
              });
              if (cnAvailable) {
                const sol = await fetchOfficialSolutionZh(it.titleSlug);
                if (sol) {
                  await db.upsertProblemSolution({
                    problemId: p.id,
                    source: 'leetcode-cn-official',
                    language: 'zh',
                    contentMarkdown: sol,
                  });
                }
              }
            }
            ok++;
          } catch {
            failed++;
          }
          processed++;
          progress('problems');
        }
      }
    } catch {
      failed++;
    }
  }

  for (const dir of companyDirs) {
    try {
      const rows = await fetchCompanyCsv(dir, 'all');
      for (const row of rows) {
        const p = await db.getProblemBySlug(row.titleSlug);
        if (!p) {
          let fid = 0;
          try {
            const data = await gql<{ question: { questionFrontendId: string } | null }>(
              LEETCODE_US_GRAPHQL,
              'query q($titleSlug:String!){question(titleSlug:$titleSlug){questionFrontendId}}',
              { titleSlug: row.titleSlug },
            );
            fid = Number(data.question?.questionFrontendId) || 0;
          } catch { /* skip */ }
          await db.upsertProblem({
            frontendId: fid,
            titleSlug: row.titleSlug,
            titleEn: row.title,
            difficulty: row.difficulty,
            paidOnly: false,
          });
        }
        const fresh = await db.getProblemBySlug(row.titleSlug);
        if (fresh) {
          await db.upsertCompanyTag({
            problemId: fresh.id,
            companySlug: COMPANY_SLUG_MAP[dir] ?? dir.toLowerCase(),
            companyName: dir,
            frequency: String(row.frequency),
            timeframe: 'all',
            source: 'liquidslr',
          });
        }
      }
      ok++;
    } catch {
      failed++;
    }
    processed++;
    progress('companies');
  }
  return { itemsProcessed: processed, itemsSucceeded: ok, itemsFailed: failed };
}

async function taskDailySyncLists() {
  let p = 0;
  let o = 0;
  let f = 0;
  for (const slug of ['top-100-liked', 'top-interview-150']) {
    try {
      const items = await fetchListProblems(slug);
      const list = await db.upsertProblemList({
        slug,
        titleEn: slug,
        titleZh: slug,
        source: 'leetcode-list',
      });
      let pos = 0;
      for (const it of items) {
        await db.upsertProblem({
          frontendId: it.frontendId,
          titleSlug: it.titleSlug,
          titleEn: it.titleEn,
          difficulty: it.difficulty,
          paidOnly: it.paidOnly,
          acRate: String(it.acRate),
        });
        const probe = await db.getProblemBySlug(it.titleSlug);
        if (probe) await db.upsertProblemListItem({ listId: list, problemId: probe.id, position: pos++ });
        o++;
      }
    } catch {
      f++;
    }
    p++;
  }
  return { itemsProcessed: p, itemsSucceeded: o, itemsFailed: f };
}

async function taskDailySyncCompanies() {
  let p = 0;
  let o = 0;
  let f = 0;
  for (const dir of knownCompanyDirNames()) {
    try {
      const rows = await fetchCompanyCsv(dir, 'all');
      for (const row of rows) {
        const fresh = await db.getProblemBySlug(row.titleSlug);
        if (fresh) {
          await db.upsertCompanyTag({
            problemId: fresh.id,
            companySlug: COMPANY_SLUG_MAP[dir] ?? dir.toLowerCase(),
            companyName: dir,
            frequency: String(row.frequency),
            timeframe: 'all',
            source: 'liquidslr',
          });
        }
      }
      o++;
    } catch {
      f++;
    }
    p++;
  }
  return { itemsProcessed: p, itemsSucceeded: o, itemsFailed: f };
}

async function taskDailySyncMeta() {
  return { itemsProcessed: 0, itemsSucceeded: 0, itemsFailed: 0 };
}

async function taskManual(report: ProgressReporter) {
  return await taskInitialBootstrap(report);
}

async function taskProbe() {
  const r = await probeLeetcodeCn();
  return { itemsProcessed: 3, itemsSucceeded: r.succeeded, itemsFailed: 3 - r.succeeded };
}

registerSyncTasks({
  'initial-bootstrap': taskInitialBootstrap,
  'daily-sync-lists': taskDailySyncLists,
  'daily-sync-companies': taskDailySyncCompanies,
  'daily-sync-meta': taskDailySyncMeta,
  manual: taskManual,
  'probe-leetcode-cn': taskProbe,
  'ai-pregenerate': taskAiPregenerate,
});

export { runSync } from './orchestrator';
