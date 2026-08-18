export type TagRef = { name: string; slug: string };

export type TaggedProblem = {
  topicTagsJson?: TagRef[] | null;
  sqlTagsJson?: TagRef[] | null;
};

function allTagsOf(p: TaggedProblem): TagRef[] {
  return [...(p.topicTagsJson ?? []), ...(p.sqlTagsJson ?? [])];
}

/** Distinct tags across topic + SQL tag arrays, with usage counts, most common first. */
export function collectTagOptions(items: TaggedProblem[]): Array<TagRef & { count: number }> {
  const tagCount = new Map<string, { name: string; count: number }>();
  for (const p of items) {
    for (const t of allTagsOf(p)) {
      const existing = tagCount.get(t.slug);
      if (existing) existing.count++;
      else tagCount.set(t.slug, { name: t.name, count: 1 });
    }
  }
  return Array.from(tagCount.entries())
    .sort((a, b) => b[1].count - a[1].count)
    .map(([slug, { name, count }]) => ({ slug, name, count }));
}

export function problemHasTag(p: TaggedProblem, slug: string): boolean {
  return allTagsOf(p).some(t => t.slug === slug);
}

export const TAG_ZH: Record<string, string> = {
  'array': '数组', 'string': '字符串', 'hash-table': '哈希表',
  'dynamic-programming': '动态规划', 'two-pointers': '双指针',
  'depth-first-search': '深度优先搜索', 'tree': '树',
  'binary-tree': '二叉树', 'breadth-first-search': '广度优先搜索',
  'linked-list': '链表', 'math': '数学', 'matrix': '矩阵',
  'divide-and-conquer': '分治', 'sorting': '排序', 'stack': '栈',
  'binary-search': '二分查找', 'backtracking': '回溯',
  'recursion': '递归', 'greedy': '贪心', 'bit-manipulation': '位运算',
  'sliding-window': '滑动窗口', 'heap-priority-queue': '堆（优先队列）',
  'design': '设计', 'trie': '字典树', 'binary-search-tree': '二叉搜索树',
  'monotonic-stack': '单调栈', 'simulation': '模拟',
  'union-find': '并查集', 'graph-theory': '图论', 'counting': '计数',
  'prefix-sum': '前缀和', 'merge-sort': '归并排序',
  'memoization': '记忆化搜索', 'topological-sort': '拓扑排序',
  'quickselect': '快速选择', 'queue': '队列', 'graph': '图',
  'monotonic-queue': '单调队列', 'string-matching': '字符串匹配',
  'combinatorics': '组合数学', 'doubly-linked-list': '双向链表',
  'geometry': '几何', 'iterator': '迭代器', 'counting-sort': '计数排序',
  'data-stream': '数据流', 'bucket-sort': '桶排序',
  'randomized': '随机化', 'shortest-path': '最短路径',
  'number-theory': '数论', 'bitmask': '状态压缩',
  'ordered-set': '有序集合', 'line-sweep': '扫描线',
  'enumeration': '枚举', 'interactive': '交互',
  'hash-function': '哈希函数', 'rolling-hash': '滚动哈希',
  'brainteaser': '脑筋急转弯', 'database': '数据库',
  'concurrency': '多线程', 'probability-and-statistics': '概率与统计',
  'suffix-array': '后缀数组', 'segment-tree': '线段树',
  'binary-indexed-tree': '树状数组', 'game-theory': '博弈论',
  // App-generated SQL topics (sqlTagsJson)
  'sql-select': '基础查询', 'sql-join': '连接',
  'sql-aggregate': '聚合与分组', 'sql-subquery': '子查询与CTE',
  'sql-window': '窗口函数', 'sql-string': '字符串函数',
  'sql-date': '日期函数', 'sql-modify': '数据修改',
  'sql-function': '自定义函数',
};

export function tagDisplayName(tag: TagRef, lang: string): string {
  return lang === 'zh' ? (TAG_ZH[tag.slug] ?? tag.name) : tag.name;
}
