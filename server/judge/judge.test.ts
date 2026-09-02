import { describe, it, expect } from "vitest";
import { runUserCode } from "./sandboxRunner";
import { buildHarness, parseHarnessOutput } from "./harnessTemplates";

const TWO_SUM_SUITE = {
  methodName: "twoSum",
  cases: [
    { input: [[2, 7, 11, 15], 9], expected: [0, 1] },
    { input: [[3, 2, 4], 6], expected: [1, 2] },
    { input: [[3, 3], 6], expected: [0, 1] },
    { input: [[-1, -2, -3, -4, -5], -8], expected: [2, 4] },
  ],
};

async function runPython(userCode: string, suite: {
  methodName: string;
  cases: Array<{ input: unknown[]; expected: unknown }>;
  comparison?: "exact" | "unordered" | "deep-unordered";
  resultFromArg?: number;
  className?: string;
  inputAdapter?: "linked-list-cycle" | "binary-tree-node-refs" | "design-binary-tree" | "design-iterator";
  resultAdapter?: "linked-list-node-index" | "tree-node-value";
  validator?:
    | "remove-element"
    | "remove-duplicates"
    | "remove-duplicates-ii"
    | "balanced-bst-from-sorted-array"
    | "bst-delete"
    | "bst-insert"
    | "randomized-container";
}, timeoutMs = 5000) {
  const source = buildHarness({ language: "python", userCode });
  const stdin = JSON.stringify(suite);
  const run = await runUserCode({ language: "python", source, stdin, timeoutMs });
  return { run, parsed: parseHarnessOutput(run.stdout) };
}

describe("judge end-to-end (python)", () => {
  it("accepts an equivalent answer when the problem allows any order", async () => {
    const code = `
class Solution:
    def twoSum(self, nums, target):
        return [1, 0]
`;
    const { parsed } = await runPython(code, {
      methodName: "twoSum",
      comparison: "unordered",
      cases: [{ input: [[2, 7], 9], expected: [0, 1] }],
    });

    expect(parsed.summary?.passed).toBe(1);
    expect(parsed.cases[0]?.ok).toBe(true);
  });

  it("does not erase meaningful order inside each returned item", async () => {
    const buggy = `
class Solution:
    def permute(self, nums):
        return [[1, 2], [1, 2]]
`;
    const { parsed } = await runPython(buggy, {
      methodName: "permute",
      comparison: "unordered",
      cases: [{ input: [[1, 2]], expected: [[1, 2], [2, 1]] }],
    });

    expect(parsed.summary?.passed).toBe(0);
    expect(parsed.cases[0]?.ok).toBe(false);
  });

  it("accepts equivalent combinations when values inside each combination are reordered", async () => {
    const code = `
class Solution:
    def threeSum(self, nums):
        return [[1, 0, -1], [2, -1, -1]]
`;
    const { parsed } = await runPython(code, {
      methodName: "threeSum",
      comparison: "deep-unordered",
      cases: [{
        input: [[-1, 0, 1, 2, -1, -4]],
        expected: [[-1, -1, 2], [-1, 0, 1]],
      }],
    });

    expect(parsed.summary?.passed).toBe(1);
    expect(parsed.cases[0]?.ok).toBe(true);
  });

  it("accepts numerically equivalent floating-point output", async () => {
    const code = `
class Solution:
    def probability(self):
        return 0.1 + 0.2
`;
    const { parsed } = await runPython(code, {
      methodName: "probability",
      cases: [{ input: [], expected: 0.3 }],
    });

    expect(parsed.summary?.passed).toBe(1);
    expect(parsed.cases[0]?.ok).toBe(true);
  });

  it("judges in-place problems by the mutated argument", async () => {
    const code = `
class Solution:
    def reverseString(self, chars):
        chars.reverse()
`;
    const { parsed } = await runPython(code, {
      methodName: "reverseString",
      resultFromArg: 0,
      cases: [{ input: [["h", "e", "l", "l", "o"]], expected: ["o", "l", "l", "e", "h"] }],
    });

    expect(parsed.summary?.passed).toBe(1);
    expect(parsed.cases[0]?.actual).toEqual(["o", "l", "l", "e", "h"]);
  });

  it("replays class operations for design problems", async () => {
    const code = `
class MyStack:
    def __init__(self):
        self.items = []
    def push(self, value):
        self.items.append(value)
    def pop(self):
        return self.items.pop()
    def top(self):
        return self.items[-1]
    def empty(self):
        return len(self.items) == 0
`;
    const { parsed } = await runPython(code, {
      methodName: "__operations__",
      className: "MyStack",
      cases: [{
        input: [
          ["MyStack", "push", "push", "top", "pop", "empty"],
          [[], [1], [2], [], [], []],
        ],
        expected: [null, null, null, 2, 2, false],
      }],
    });

    expect(parsed.summary?.passed).toBe(1);
    expect(parsed.cases[0]?.actual).toEqual([null, null, null, 2, 2, false]);
  });

  it("converts a design class constructor's serialized tree into TreeNode", async () => {
    const code = `
class BSTIterator:
    def __init__(self, root):
        self.stack = []
        while root:
            self.stack.append(root)
            root = root.left
    def next(self):
        node = self.stack.pop()
        current = node.right
        while current:
            self.stack.append(current)
            current = current.left
        return node.val
    def hasNext(self):
        return bool(self.stack)
`;
    const { parsed } = await runPython(code, {
      methodName: "__operations__",
      className: "BSTIterator",
      inputAdapter: "design-binary-tree",
      cases: [{
        input: [
          ["BSTIterator", "next", "next", "hasNext"],
          [[[7, 3, 15, null, null, 9, 20]], [], [], []],
        ],
        expected: [null, 3, 7, true],
      }],
    });

    expect(parsed.summary?.passed).toBe(1);
    expect(parsed.cases[0]?.actual).toEqual([null, 3, 7, true]);
  });

  it("wraps PeekingIterator constructor input in LeetCode's Iterator interface", async () => {
    const code = `
class PeekingIterator:
    def __init__(self, iterator):
        self.iterator = iterator
        self.buffer = iterator.next() if iterator.hasNext() else None
    def peek(self):
        return self.buffer
    def next(self):
        value = self.buffer
        self.buffer = self.iterator.next() if self.iterator.hasNext() else None
        return value
    def hasNext(self):
        return self.buffer is not None
`;
    const { parsed } = await runPython(code, {
      methodName: "__operations__",
      className: "PeekingIterator",
      inputAdapter: "design-iterator",
      cases: [{
        input: [
          ["PeekingIterator", "next", "peek", "next", "hasNext"],
          [[[1, 2, 3]], [], [], [], []],
        ],
        expected: [null, 1, 2, 2, true],
      }],
    });

    expect(parsed.summary?.passed).toBe(1);
    expect(parsed.cases[0]?.actual).toEqual([null, 1, 2, 2, true]);
  });

  it("accepts any currently stored value returned by getRandom", async () => {
    const code = `
class RandomizedSet:
    def __init__(self):
        self.values = set()
    def insert(self, value):
        missing = value not in self.values
        self.values.add(value)
        return missing
    def getRandom(self):
        return min(self.values)
`;
    const { parsed } = await runPython(code, {
      methodName: "__operations__",
      className: "RandomizedSet",
      validator: "randomized-container",
      cases: [{
        input: [
          ["RandomizedSet", "insert", "insert", "getRandom"],
          [[], [1], [2], []],
        ],
        expected: [null, true, true, 2],
      }],
    });

    expect(parsed.summary?.passed).toBe(1);
    expect(parsed.cases[0]?.actual).toEqual([null, true, true, 1]);
  });

  it("constructs cyclic lists and compares the returned node index", async () => {
    const code = `
class Solution:
    def detectCycle(self, head):
        slow = fast = head
        while fast and fast.next:
            slow = slow.next
            fast = fast.next.next
            if slow is fast:
                slow = head
                while slow is not fast:
                    slow = slow.next
                    fast = fast.next
                return slow
        return None
`;
    const { parsed } = await runPython(code, {
      methodName: "detectCycle",
      inputAdapter: "linked-list-cycle",
      resultAdapter: "linked-list-node-index",
      cases: [
        { input: [[3, 2, 0, -4], 1], expected: 1 },
        { input: [[1], -1], expected: -1 },
      ],
    });

    expect(parsed.summary?.passed).toBe(2);
    expect(parsed.cases.map((item) => item.actual)).toEqual([1, -1]);
  });

  it("maps LCA value inputs to nodes in the same binary tree", async () => {
    const code = `
class Solution:
    def lowestCommonAncestor(self, root, p, q):
        if root is None or root is p or root is q:
            return root
        left = self.lowestCommonAncestor(root.left, p, q)
        right = self.lowestCommonAncestor(root.right, p, q)
        return root if left and right else left or right
`;
    const { parsed } = await runPython(code, {
      methodName: "lowestCommonAncestor",
      inputAdapter: "binary-tree-node-refs",
      resultAdapter: "tree-node-value",
      cases: [{
        input: [[3, 5, 1, 6, 2, 0, 8, null, null, 7, 4], 5, 1],
        expected: 3,
      }],
    });

    expect(parsed.summary?.passed).toBe(1);
    expect(parsed.cases[0]?.actual).toBe(3);
  });

  it("rejects removeElement code that returns k without updating nums", async () => {
    const buggy = `
class Solution:
    def removeElement(self, nums, val):
        return sum(value != val for value in nums)
`;
    const { parsed } = await runPython(buggy, {
      methodName: "removeElement",
      validator: "remove-element",
      cases: [{ input: [[3, 2, 2, 3], 3], expected: 2 }],
    });

    expect(parsed.summary?.passed).toBe(0);
    expect(parsed.cases[0]?.ok).toBe(false);
  });

  it("accepts removeElement code with the right k and equivalent prefix", async () => {
    const code = `
class Solution:
    def removeElement(self, nums, val):
        kept = [value for value in nums if value != val]
        nums[:len(kept)] = reversed(kept)
        return len(kept)
`;
    const { parsed } = await runPython(code, {
      methodName: "removeElement",
      validator: "remove-element",
      cases: [{ input: [[3, 2, 2, 3], 3], expected: 2 }],
    });

    expect(parsed.summary?.passed).toBe(1);
    expect(parsed.cases[0]?.ok).toBe(true);
  });

  it.each([
    {
      validator: 'remove-duplicates' as const,
      input: [1, 1, 2],
      expected: 2,
      body: 'return len(set(nums))',
    },
    {
      validator: 'remove-duplicates-ii' as const,
      input: [1, 1, 1, 2, 2, 3],
      expected: 5,
      body: 'return sum(min(2, nums.count(value)) for value in set(nums))',
    },
  ])('rejects $validator code that returns k without updating nums', async ({ validator, input, expected, body }) => {
    const buggy = `
class Solution:
    def removeDuplicates(self, nums):
        ${body}
`;
    const { parsed } = await runPython(buggy, {
      methodName: "removeDuplicates",
      validator,
      cases: [{ input: [input], expected }],
    });

    expect(parsed.summary?.passed).toBe(0);
    expect(parsed.cases[0]?.ok).toBe(false);
  });

  it.each([
    { validator: 'remove-duplicates' as const, input: [1, 1, 2], expected: 2, limit: 1 },
    { validator: 'remove-duplicates-ii' as const, input: [1, 1, 1, 2, 2, 3], expected: 5, limit: 2 },
  ])('accepts $validator code that writes the required prefix', async ({ validator, input, expected, limit }) => {
    const code = `
class Solution:
    def removeDuplicates(self, nums):
        write = 0
        for value in nums:
            if write < ${limit} or value != nums[write - ${limit}]:
                nums[write] = value
                write += 1
        return write
`;
    const { parsed } = await runPython(code, {
      methodName: "removeDuplicates",
      validator,
      cases: [{ input: [input], expected }],
    });

    expect(parsed.summary?.passed).toBe(1);
    expect(parsed.cases[0]?.ok).toBe(true);
  });

  it("accepts a different valid balanced BST shape", async () => {
    const code = `
class Solution:
    def sortedArrayToBST(self, nums):
        if not nums:
            return None
        middle = (len(nums) - 1) // 2
        root = TreeNode(nums[middle])
        root.left = self.sortedArrayToBST(nums[:middle])
        root.right = self.sortedArrayToBST(nums[middle + 1:])
        return root
`;
    const { parsed } = await runPython(code, {
      methodName: "sortedArrayToBST",
      validator: "balanced-bst-from-sorted-array",
      cases: [{ input: [[-10, -3, 0, 5, 9]], expected: [0, -3, 9, -10, null, 5] }],
    });

    expect(parsed.summary?.passed).toBe(1);
    expect(parsed.cases[0]?.ok).toBe(true);
  });

  it("normalizes a compatible TreeNode class defined by the submitted code", async () => {
    const code = `
class CustomTreeNode:
    def __init__(self, val=0, left=None, right=None):
        self.val = val
        self.left = left
        self.right = right

class Solution:
    def buildTree(self, values):
        return CustomTreeNode(values[0], CustomTreeNode(values[1]), CustomTreeNode(values[2]))
`;
    const { parsed } = await runPython(code, {
      methodName: "buildTree",
      cases: [{ input: [[1, 2, 3]], expected: [1, 2, 3] }],
    });

    expect(parsed.summary?.passed).toBe(1);
    expect(parsed.cases[0]?.actual).toEqual([1, 2, 3]);
  });

  it("rejects a BST that contains the values but is not height-balanced", async () => {
    const buggy = `
class Solution:
    def sortedArrayToBST(self, nums):
        root = None
        for value in reversed(nums):
            root = TreeNode(value, None, root)
        return root
`;
    const { parsed } = await runPython(buggy, {
      methodName: "sortedArrayToBST",
      validator: "balanced-bst-from-sorted-array",
      cases: [{ input: [[-10, -3, 0, 5, 9]], expected: [0, -3, 9, -10, null, 5] }],
    });

    expect(parsed.summary?.passed).toBe(0);
    expect(parsed.cases[0]?.ok).toBe(false);
  });

  it("accepts predecessor-based BST deletion when the sample uses a successor", async () => {
    const code = `
class Solution:
    def deleteNode(self, root, key):
        if root is None:
            return None
        if key < root.val:
            root.left = self.deleteNode(root.left, key)
        elif key > root.val:
            root.right = self.deleteNode(root.right, key)
        elif root.left is None:
            return root.right
        elif root.right is None:
            return root.left
        else:
            predecessor = root.left
            while predecessor.right:
                predecessor = predecessor.right
            root.val = predecessor.val
            root.left = self.deleteNode(root.left, predecessor.val)
        return root
`;
    const { parsed } = await runPython(code, {
      methodName: "deleteNode",
      validator: "bst-delete",
      cases: [
        {
          input: [[5, 3, 6, 2, 4, null, 7], 3],
          expected: [5, 4, 6, 2, null, null, 7],
        },
        { input: [[], 0], expected: [] },
      ],
    });

    expect(parsed.summary?.passed).toBe(2);
    expect(parsed.cases.every((item) => item.ok)).toBe(true);
  });

  it("accepts a rebuilt valid BST after insertion", async () => {
    const code = `
class Solution:
    def insertIntoBST(self, root, val):
        values = []
        def visit(node):
            if node:
                visit(node.left)
                values.append(node.val)
                visit(node.right)
        visit(root)
        values.append(val)
        values.sort()
        def build(items):
            if not items:
                return None
            middle = (len(items) - 1) // 2
            return TreeNode(items[middle], build(items[:middle]), build(items[middle + 1:]))
        return build(values)
`;
    const { parsed } = await runPython(code, {
      methodName: "insertIntoBST",
      validator: "bst-insert",
      cases: [{
        input: [[4, 2, 7, 1, 3], 5],
        expected: [4, 2, 7, 1, 3, 5],
      }],
    });

    expect(parsed.summary?.passed).toBe(1);
    expect(parsed.cases[0]?.ok).toBe(true);
  });

  it("accepts a correct hash-map Two Sum solution", async () => {
    const code = `
class Solution:
    def twoSum(self, nums, target):
        seen = {}
        for i, x in enumerate(nums):
            if target - x in seen:
                return [seen[target - x], i]
            seen[x] = i
        return []
`;
    const { run, parsed } = await runPython(code, TWO_SUM_SUITE);
    expect(run.ok, "sandbox run.ok with stderr=" + run.stderr).toBe(true);
    expect(parsed.summary).toBeTruthy();
    expect(parsed.summary?.passed).toBe(TWO_SUM_SUITE.cases.length);
    expect(parsed.summary?.total).toBe(TWO_SUM_SUITE.cases.length);
    expect(parsed.cases.every((c) => c.ok)).toBe(true);
  });

  it("reports wrong_answer for an obviously buggy solution", async () => {
    const buggy = `
class Solution:
    def twoSum(self, nums, target):
        return [0, 0]
`;
    const { parsed } = await runPython(buggy, TWO_SUM_SUITE);
    expect(parsed.summary?.passed).toBe(0);
    expect(parsed.cases.length).toBeGreaterThan(0);
    expect(parsed.cases[0].ok).toBe(false);
  });

  it("preserves user TypeErrors instead of retrying array inputs as tree nodes", async () => {
    const buggy = `
class Solution:
    def twoSum(self, nums, target):
        seen = {}
        for i, x in enumerate(nums):
            if target - x in seen:
                return seen[[target - x], i]
            seen[x] = i
        return []
`;
    const { parsed } = await runPython(buggy, TWO_SUM_SUITE);
    expect(parsed.summary?.passed).toBe(0);
    expect(parsed.cases[0]?.error).toMatch(/unhashable type/i);
    expect(parsed.cases[0]?.error).not.toMatch(/TreeNode/);
  });

  it("captures syntax errors gracefully", async () => {
    const broken = `
class Solution
    def twoSum(self, nums, target):
        return [0, 1]
`;
    const { parsed } = await runPython(broken, TWO_SUM_SUITE);
    expect(parsed.summary?.fatal).toBe(true);
    expect(parsed.cases[0]?.error).toMatch(/compile|syntax|invalid/i);
  });

  // Regression: dev server inherits PYTHONHOME=cpython3.13 from sandbox runtime.
  // Sandbox runner must scrub it before spawning user-code python (3.11) or the
  // mismatched stdlib will fail with "SRE module mismatch".
  it("runs even when PYTHONHOME points to a different Python version", async () => {
    const prevHome = process.env.PYTHONHOME;
    const prevPath = process.env.PYTHONPATH;
    process.env.PYTHONHOME = "/home/ubuntu/.local/share/uv/python/cpython-3.13.13-linux-x86_64-gnu";
    process.env.PYTHONPATH = process.env.PYTHONHOME + "/lib/python3.13";
    try {
      const code = `
class Solution:
    def twoSum(self, nums, target):
        seen = {}
        for i, x in enumerate(nums):
            if target - x in seen:
                return [seen[target - x], i]
            seen[x] = i
        return []
`;
      const { run, parsed } = await runPython(code, TWO_SUM_SUITE);
      expect(run.ok, "with PYTHONHOME pollution: " + run.stderr).toBe(true);
      expect(parsed.summary?.passed).toBe(TWO_SUM_SUITE.cases.length);
    } finally {
      if (prevHome === undefined) delete process.env.PYTHONHOME; else process.env.PYTHONHOME = prevHome;
      if (prevPath === undefined) delete process.env.PYTHONPATH; else process.env.PYTHONPATH = prevPath;
    }
  });

  // Regression: LeetCode-style code uses `List` annotation without `from typing import List`.
  // The harness must pre-seed standard imports into the user namespace.
  it("runs LeetCode-style code that references List/defaultdict/heapq without explicit imports", async () => {
    const code = `
class Solution:
    def twoSum(self, nums: List[int], target: int) -> List[int]:
        # Use defaultdict + heapq just to confirm those names are importable.
        seen: Dict[int, int] = {}
        _ = heapq.nsmallest(1, nums) if nums else []
        _bag = defaultdict(int)
        _bag["x"] += 1
        for i, x in enumerate(nums):
            if target - x in seen:
                return [seen[target - x], i]
            seen[x] = i
        return []
`;
    const { run, parsed } = await runPython(code, TWO_SUM_SUITE);
    expect(run.ok, "sandbox failed with stderr=" + run.stderr).toBe(true);
    expect(parsed.summary?.fatal).toBeFalsy();
    expect(parsed.summary?.passed).toBe(TWO_SUM_SUITE.cases.length);
  });

  it("kills infinite loop with timeout", async () => {
    const tle = `
class Solution:
    def twoSum(self, nums, target):
        while True:
            pass
        return [0, 1]
`;
    const { run } = await runPython(tle, TWO_SUM_SUITE, 1500);
    expect(run.ok).toBe(false);
    expect(run.reason).toBe("timeout");
    expect(run.timeMs).toBeGreaterThanOrEqual(1400);
    expect(run.timeMs).toBeLessThan(2500);
  });
});
