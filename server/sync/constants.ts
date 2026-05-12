export const LEETCODE_US_GRAPHQL = 'https://leetcode.com/graphql';
export const LEETCODE_CN_GRAPHQL = 'https://leetcode.cn/graphql';
export const LIQUIDSLR_REPO_RAW =
  'https://raw.githubusercontent.com/liquidslr/interview-company-wise-problems/main';
export const LIQUIDSLR_GITHUB_API =
  'https://api.github.com/repos/liquidslr/interview-company-wise-problems/commits?per_page=1';

export type CompanyDef = { slug: string; name: string; region: 'us' | 'cn' | 'sea' };

export const COMPANIES: CompanyDef[] = [
  { slug: 'google', name: 'Google', region: 'us' },
  { slug: 'meta', name: 'Meta', region: 'us' },
  { slug: 'amazon', name: 'Amazon', region: 'us' },
  { slug: 'microsoft', name: 'Microsoft', region: 'us' },
  { slug: 'apple', name: 'Apple', region: 'us' },
  { slug: 'netflix', name: 'Netflix', region: 'us' },
  { slug: 'uber', name: 'Uber', region: 'us' },
  { slug: 'airbnb', name: 'Airbnb', region: 'us' },
  { slug: 'linkedin', name: 'LinkedIn', region: 'us' },
  { slug: 'salesforce', name: 'Salesforce', region: 'us' },
  { slug: 'adobe', name: 'Adobe', region: 'us' },
  { slug: 'nvidia', name: 'Nvidia', region: 'us' },
  { slug: 'tesla', name: 'Tesla', region: 'us' },
  { slug: 'bytedance', name: 'ByteDance', region: 'cn' },
  { slug: 'tencent', name: 'Tencent', region: 'cn' },
  { slug: 'alibaba', name: 'Alibaba', region: 'cn' },
  { slug: 'baidu', name: 'Baidu', region: 'cn' },
  { slug: 'meituan', name: 'Meituan', region: 'cn' },
  { slug: 'xiaohongshu', name: 'Xiaohongshu', region: 'cn' },
  { slug: 'didi', name: 'DiDi', region: 'cn' },
  { slug: 'grab', name: 'Grab', region: 'sea' },
  { slug: 'shopee', name: 'Shopee', region: 'sea' },
  { slug: 'sea', name: 'Sea', region: 'sea' },
  { slug: 'tiktok', name: 'TikTok', region: 'sea' },
  { slug: 'lazada', name: 'Lazada', region: 'sea' },
];

export const COMPANY_SLUG_MAP: Record<string, string> = {
  Google: 'google',
  Meta: 'meta',
  Facebook: 'meta',
  Amazon: 'amazon',
  Microsoft: 'microsoft',
  Apple: 'apple',
  Netflix: 'netflix',
  Uber: 'uber',
  Airbnb: 'airbnb',
  LinkedIn: 'linkedin',
  Salesforce: 'salesforce',
  Adobe: 'adobe',
  Nvidia: 'nvidia',
  NVIDIA: 'nvidia',
  Tesla: 'tesla',
  ByteDance: 'bytedance',
  Bytedance: 'bytedance',
  Tencent: 'tencent',
  Alibaba: 'alibaba',
  Baidu: 'baidu',
  Meituan: 'meituan',
  Xiaohongshu: 'xiaohongshu',
  'Xiaohongshu(RedNote)': 'xiaohongshu',
  DiDi: 'didi',
  Didi: 'didi',
  Grab: 'grab',
  Shopee: 'shopee',
  Sea: 'sea',
  TikTok: 'tiktok',
  Tiktok: 'tiktok',
  Lazada: 'lazada',
};
