import { z } from 'zod';
import { LIQUIDSLR_REPO_RAW, LIQUIDSLR_GITHUB_API, COMPANY_SLUG_MAP, COMPANIES } from './constants';

let _fetch: typeof globalThis.fetch = globalThis.fetch.bind(globalThis);
export function __setFetchForLiquidslr(fn: typeof globalThis.fetch | undefined) {
  _fetch = fn ?? globalThis.fetch.bind(globalThis);
}

const DifficultyInput = z
  .string()
  .transform((s) => {
    const v = s.trim().toLowerCase();
    if (v === 'easy') return 'Easy';
    if (v === 'medium') return 'Medium';
    if (v === 'hard') return 'Hard';
    return s;
  })
  .pipe(z.enum(['Easy', 'Medium', 'Hard']));

const RowSchema = z.object({
  difficulty: DifficultyInput,
  title: z.string().min(1),
  frequency: z.coerce.number().min(0).max(100),
  acceptanceRate: z.coerce.number().min(0).max(100).optional(),
  titleSlug: z.string().min(1),
});

export type CompanyCsvRow = z.infer<typeof RowSchema>;

function parseCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = '';
  let inQuote = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') {
      inQuote = !inQuote;
      continue;
    }
    if (c === ',' && !inQuote) {
      out.push(cur);
      cur = '';
      continue;
    }
    cur += c;
  }
  out.push(cur);
  return out;
}

function slugFromLink(link: string): string {
  const m = link.match(/\/problems\/([^/?#]+)/);
  return m ? m[1] : '';
}

export function parseCompanyCsv(csv: string): CompanyCsvRow[] {
  const lines = csv.split(/\r?\n/).filter((l) => l.trim());
  if (lines.length < 2) return [];
  const header = parseCsvLine(lines[0]).map((h) => h.trim().toLowerCase());
  const idx = (name: string) =>
    header.findIndex((h) => h.replace(/\s+/g, '') === name.replace(/\s+/g, '').toLowerCase());
  const di = idx('Difficulty');
  const ti = idx('Title');
  const fi = idx('Frequency');
  const ai = idx('Acceptance Rate');
  const li = idx('Link');

  const rows: CompanyCsvRow[] = [];
  let failures = 0;
  for (let i = 1; i < lines.length; i++) {
    const cells = parseCsvLine(lines[i]);
    const candidate = {
      difficulty: cells[di]?.trim(),
      title: cells[ti]?.trim(),
      frequency: cells[fi]?.trim(),
      acceptanceRate: cells[ai]?.trim(),
      titleSlug: slugFromLink(cells[li]?.trim() ?? ''),
    };
    const parsed = RowSchema.safeParse(candidate);
    if (parsed.success) rows.push(parsed.data);
    else failures++;
  }
  const total = lines.length - 1;
  if (total > 0 && failures / total > 0.5) {
    throw new Error(
      `liquidslr CSV failure rate ${Math.round((failures * 100) / total)}% — rejecting whole CSV`,
    );
  }
  return rows;
}

const TIMEFRAME_LABEL: Record<'30d' | '3m' | '6m' | '1y' | 'all', string> = {
  '30d': '1. Thirty Days',
  '3m': '2. Three Months',
  '6m': '3. Six Months',
  '1y': '4. More Than Six Months',
  'all': '5. All',
} as const;

export async function fetchCompanyCsv(
  directoryName: string,
  timeframe: '30d' | '3m' | '6m' | '1y' | 'all',
): Promise<CompanyCsvRow[]> {
  const url = `${LIQUIDSLR_REPO_RAW}/${encodeURIComponent(directoryName)}/${encodeURIComponent(TIMEFRAME_LABEL[timeframe])}.csv`;
  const res = await _fetch(url);
  if (!res.ok) {
    if (res.status === 404) return [];
    throw new Error(`liquidslr fetch ${res.status} for ${directoryName}/${timeframe}`);
  }
  const text = await res.text();
  return parseCompanyCsv(text);
}

export async function getLiquidslrLatestCommit(): Promise<string | null> {
  try {
    const res = await _fetch(LIQUIDSLR_GITHUB_API, {
      headers: { accept: 'application/vnd.github+json' },
    });
    if (!res.ok) return null;
    const arr = (await res.json()) as Array<{ sha?: string }>;
    return arr?.[0]?.sha ?? null;
  } catch {
    return null;
  }
}

export function knownCompanyDirNames(): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const c of COMPANIES) {
    for (const [dirName, slug] of Object.entries(COMPANY_SLUG_MAP)) {
      if (slug === c.slug && !seen.has(c.slug)) {
        out.push(dirName);
        seen.add(c.slug);
        break;
      }
    }
  }
  return out;
}
