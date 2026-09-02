import { LEETCODE_US_GRAPHQL } from './constants';
import type { Difficulty } from '@shared/problemTypes';

let _fetch: typeof globalThis.fetch = globalThis.fetch.bind(globalThis);
export function __setFetchForTest(fn: typeof globalThis.fetch | undefined) {
  _fetch = fn ?? globalThis.fetch.bind(globalThis);
}

const THROTTLE_MS = 200;
let lastCallAt = 0;
async function throttle() {
  const now = Date.now();
  const wait = Math.max(0, lastCallAt + THROTTLE_MS - now);
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  lastCallAt = Date.now();
}

export async function gql<T>(
  endpoint: string,
  query: string,
  variables: Record<string, unknown>,
): Promise<T> {
  let lastErr: unknown;
  for (let attempt = 1; attempt <= 3; attempt++) {
    await throttle();
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 15000);
      const res = await _fetch(endpoint, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'user-agent': 'Mozilla/5.0 leetcode-tracker',
        },
        body: JSON.stringify({ query, variables }),
        signal: controller.signal,
      });
      clearTimeout(timeout);
      if (!res.ok) {
        if (res.status >= 500 || res.status === 429) {
          lastErr = new Error(`LeetCode HTTP ${res.status}`);
          await new Promise((r) => setTimeout(r, attempt * 100));
          continue;
        }
        throw new Error(`LeetCode HTTP ${res.status}`);
      }
      const text = await res.text();
      if (!text.startsWith('{')) {
        throw new Error('LeetCode returned non-JSON (likely Cloudflare block)');
      }
      const json = JSON.parse(text) as { data: T };
      return json.data;
    } catch (e) {
      lastErr = e;
      await new Promise((r) => setTimeout(r, attempt * 100));
    }
  }
  throw new Error(`RetryExhausted: ${(lastErr as Error)?.message ?? 'unknown'}`);
}

// LeetCode list slugs (e.g. "top-100-liked", "top-interview-150") are study
// plans, not favorites. We fetch them via the studyPlanV2Detail query and flatten
// all sub-groups into a single ordered list. Topic tags + ac-rate are not exposed
// by this endpoint, so we leave them as defaults; the per-question detail fetch
// later enriches them when content is loaded.
const LIST_QUERY = `
query studyPlanDetail($slug: String!) {
  studyPlanV2Detail(planSlug: $slug) {
    name
    slug
    planSubGroups {
      questions {
        titleSlug
        title
        questionFrontendId
        difficulty
        paidOnly
      }
    }
  }
}`;

export type RawListItem = {
  titleSlug: string;
  frontendId: number;
  titleEn: string;
  difficulty: Difficulty;
  paidOnly: boolean;
  acRate: number;
  topicTagsJson: { slug: string; name: string }[];
};

const DIFF_MAP: Record<string, Difficulty> = { EASY: 'Easy', MEDIUM: 'Medium', HARD: 'Hard' };

type RawPlanQuestion = {
  titleSlug: string;
  title: string;
  questionFrontendId: string | number;
  difficulty: string;
  paidOnly?: boolean;
};

type RawPlanResp = {
  studyPlanV2Detail: {
    name: string;
    slug: string;
    planSubGroups: { questions: RawPlanQuestion[] }[];
  } | null;
};

export async function fetchListProblems(listSlug: string): Promise<RawListItem[]> {
  const data = await gql<RawPlanResp>(LEETCODE_US_GRAPHQL, LIST_QUERY, { slug: listSlug });
  const groups = data.studyPlanV2Detail?.planSubGroups ?? [];
  const seen = new Set<string>();
  const out: RawListItem[] = [];
  for (const g of groups) {
    for (const q of g.questions ?? []) {
      if (seen.has(q.titleSlug)) continue;
      seen.add(q.titleSlug);
      out.push({
        titleSlug: q.titleSlug,
        frontendId: Number(q.questionFrontendId),
        titleEn: q.title,
        difficulty: DIFF_MAP[q.difficulty] ?? 'Medium',
        paidOnly: !!q.paidOnly,
        acRate: 0,
        topicTagsJson: [],
      });
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Detail / translation / official-solution queries
// ---------------------------------------------------------------------------

import { LEETCODE_CN_GRAPHQL } from './constants';

const DETAIL_EN_QUERY = `
query questionData($titleSlug: String!) {
  question(titleSlug: $titleSlug) {
    content
    hints
    exampleTestcases
    topicTags { slug name }
    similarQuestions
    codeSnippets { lang langSlug code }
  }
}`;

const DETAIL_ZH_QUERY = `
query questionTranslations($titleSlug: String!) {
  question(titleSlug: $titleSlug) {
    translatedTitle
    translatedContent
  }
}`;

const CATALOG_ENTRY_QUERY = `
query questionCatalogEntry($titleSlug: String!) {
  question(titleSlug: $titleSlug) {
    questionFrontendId
    titleSlug
    title
    translatedTitle
    difficulty
    isPaidOnly
    content
    translatedContent
    hints
    exampleTestcases
    topicTags { slug name }
    similarQuestions
    codeSnippets { lang langSlug code }
  }
}`;

const SOLUTION_ZH_QUERY = `
query solutionArticle($slug: String!) {
  solutionArticle(slug: $slug, orderBy: DEFAULT) {
    content
  }
}`;

export type DetailEn = {
  contentEn: string | null;
  hintsJson: string[];
  exampleTestcases: string | null;
  topicTagsJson: { slug: string; name: string }[];
  similarQuestionsJson: unknown;
  codeSnippetsJson: { lang: string; langSlug: string; code: string }[];
};

type RawQuestionDetail = {
  questionFrontendId?: string | number;
  titleSlug?: string;
  title?: string;
  difficulty?: string;
  isPaidOnly?: boolean;
  content?: string | null;
  hints?: string[];
  exampleTestcases?: string | null;
  topicTags?: { slug: string; name: string }[];
  similarQuestions?: string;
  codeSnippets?: { lang: string; langSlug: string; code: string }[];
  translatedTitle?: string | null;
  translatedContent?: string | null;
};

export type CatalogEntry = {
  frontendId: number;
  titleSlug: string;
  titleEn: string;
  titleZh: string | null;
  difficulty: Difficulty;
  paidOnly: boolean;
  contentEn: string | null;
  contentZh: string | null;
  hintsJson: string[];
  exampleTestcases: string | null;
  topicTagsJson: { slug: string; name: string }[];
  similarQuestionsJson: unknown;
  codeSnippetsJson: { lang: string; langSlug: string; code: string }[];
  contentFetchedAt: Date;
  metaUpdatedAt: Date;
};

export async function fetchQuestionCatalogEntry(titleSlug: string): Promise<CatalogEntry | null> {
  const data = await gql<{ question: RawQuestionDetail | null }>(
    LEETCODE_US_GRAPHQL,
    CATALOG_ENTRY_QUERY,
    { titleSlug },
  );
  const question = data.question;
  if (!question) return null;

  let similarQuestionsJson: unknown = [];
  try {
    similarQuestionsJson = JSON.parse(question.similarQuestions ?? '[]');
  } catch {
    similarQuestionsJson = [];
  }

  const now = new Date();
  return {
    frontendId: Number(question.questionFrontendId),
    titleSlug: question.titleSlug ?? titleSlug,
    titleEn: question.title ?? titleSlug,
    titleZh: question.translatedTitle ?? null,
    difficulty: DIFF_MAP[question.difficulty ?? ''] ?? 'Medium',
    paidOnly: !!question.isPaidOnly,
    contentEn: question.content ?? null,
    contentZh: question.translatedContent ?? null,
    hintsJson: question.hints ?? [],
    exampleTestcases: question.exampleTestcases ?? null,
    topicTagsJson: question.topicTags ?? [],
    similarQuestionsJson,
    codeSnippetsJson: question.codeSnippets ?? [],
    contentFetchedAt: now,
    metaUpdatedAt: now,
  };
}

export async function fetchQuestionDetailEn(titleSlug: string): Promise<DetailEn | null> {
  const data = await gql<{ question: RawQuestionDetail | null }>(
    LEETCODE_US_GRAPHQL,
    DETAIL_EN_QUERY,
    { titleSlug },
  );
  if (!data.question) return null;
  let similar: unknown = [];
  try {
    similar = JSON.parse(data.question.similarQuestions ?? '[]');
  } catch {
    similar = [];
  }
  return {
    contentEn: data.question.content ?? null,
    hintsJson: data.question.hints ?? [],
    exampleTestcases: data.question.exampleTestcases ?? null,
    topicTagsJson: data.question.topicTags ?? [],
    similarQuestionsJson: similar,
    codeSnippetsJson: data.question.codeSnippets ?? [],
  };
}

export type DetailZh = { titleZh: string | null; contentZh: string | null };

export async function fetchQuestionDetailZh(titleSlug: string): Promise<DetailZh | null> {
  const data = await gql<{ question: RawQuestionDetail | null }>(
    LEETCODE_CN_GRAPHQL,
    DETAIL_ZH_QUERY,
    { titleSlug },
  );
  if (!data.question) return null;
  return {
    titleZh: data.question.translatedTitle ?? null,
    contentZh: data.question.translatedContent ?? null,
  };
}

export async function fetchOfficialSolutionZh(titleSlug: string): Promise<string | null> {
  try {
    const data = await gql<{ solutionArticle: { content?: string } | null }>(
      LEETCODE_CN_GRAPHQL,
      SOLUTION_ZH_QUERY,
      { slug: titleSlug },
    );
    return data.solutionArticle?.content ?? null;
  } catch {
    return null;
  }
}
