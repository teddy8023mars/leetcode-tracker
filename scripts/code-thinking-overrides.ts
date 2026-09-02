export type NodeOverride = {
  kind: "article" | "external" | "leetcode";
  frontendId?: number;
  titleSlug?: string;
  provider?: string;
};

export const CODE_THINKING_OVERRIDES: Record<string, NodeOverride> = {
  "./problems/0376.摆动序列.md": {
    kind: "leetcode",
    frontendId: 376,
    titleSlug: "wiggle-subsequence",
  },
  "./problems/面试题02.07.链表相交.md": {
    kind: "article",
  },
};
