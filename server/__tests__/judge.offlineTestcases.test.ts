import { afterEach, describe, expect, it, vi } from 'vitest';

import { buildOfficialExampleSuite, generateTestcaseSuite } from '../judge/testcaseGenerator';

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('offline testcase generation', () => {
  it('builds a runnable suite from official examples without an API key', async () => {
    vi.stubEnv('BUILT_IN_FORGE_API_KEY', '');
    vi.stubEnv('DEEPSEEK_API_KEY', '');

    const suite = await generateTestcaseSuite({
      titleSlug: 'two-sum',
      titleEn: 'Two Sum',
      contentEn: `
        <p>You may return the answer in any order.</p>
        <p><strong class="example">Example 1:</strong></p>
        <pre><strong>Input:</strong> nums = [2,7,11,15], target = 9
        <strong>Output:</strong> [0,1]</pre>
        <p><strong class="example">Example 2:</strong></p>
        <div class="example-block">
          <p><strong>Input:</strong> <span class="example-io">nums = [3,2,4], target = 6</span></p>
          <p><strong>Output:</strong> <span class="example-io">[1,2]</span></p>
        </div>
      `,
      contentZh: null,
      difficulty: 'Easy',
      codeSnippetsJson: [{
        langSlug: 'python3',
        code: 'class Solution:\n    def twoSum(self, nums: List[int], target: int) -> List[int]:\n        pass',
      }],
      exampleTestcases: '[2,7,11,15]\n9\n[3,2,4]\n6',
    });

    expect(suite).toMatchObject({
      methodName: 'twoSum',
      source: 'official-examples',
      comparison: 'unordered',
      cases: [
        { input: [[2, 7, 11, 15], 9], expected: [0, 1] },
        { input: [[3, 2, 4], 6], expected: [1, 2] },
      ],
    });
  });

  it('marks void methods as in-place so their mutated input is judged', async () => {
    vi.stubEnv('BUILT_IN_FORGE_API_KEY', '');
    vi.stubEnv('DEEPSEEK_API_KEY', '');

    const suite = await generateTestcaseSuite({
      titleSlug: 'reverse-string',
      titleEn: 'Reverse String',
      contentEn: `
        <p>Reverse the input array in-place.</p>
        <pre><strong>Input:</strong> s = ["h","e","l","l","o"]
        <strong>Output:</strong> ["o","l","l","e","h"]</pre>
      `,
      contentZh: null,
      difficulty: 'Easy',
      codeSnippetsJson: [{
        langSlug: 'python3',
        code: 'class Solution:\n    def reverseString(self, s: List[str]) -> None:\n        pass',
      }],
      exampleTestcases: '["h","e","l","l","o"]',
    });

    expect(suite.resultFromArg).toBe(0);
    expect(suite.cases[0]).toEqual({
      input: [["h", "e", "l", "l", "o"]],
      expected: ["o", "l", "l", "e", "h"],
    });
  });

  it('uses the returned value when LeetCode also displays a mutated array', async () => {
    vi.stubEnv('BUILT_IN_FORGE_API_KEY', '');
    vi.stubEnv('DEEPSEEK_API_KEY', '');

    const suite = await generateTestcaseSuite({
      titleSlug: 'remove-element',
      titleEn: 'Remove Element',
      contentEn: `
        <pre><strong>Input:</strong> nums = [3,2,2,3], val = 3
        <strong>Output:</strong> 2, nums = [2,2,_,_]</pre>
        <pre><strong>Input:</strong> nums = [0,1,2,2,3,0,4,2], val = 2
        <strong>Output:</strong> 5, nums = [0,1,4,0,3,_,_,_]</pre>
      `,
      contentZh: null,
      difficulty: 'Easy',
      codeSnippetsJson: [{
        langSlug: 'python3',
        code: 'class Solution:\n    def removeElement(self, nums: List[int], val: int) -> int:\n        pass',
      }],
      exampleTestcases: '[3,2,2,3]\n3\n[0,1,2,2,3,0,4,2]\n2',
    });

    expect(suite.validator).toBe('remove-element');
    expect(suite.cases).toEqual([
      { input: [[3, 2, 2, 3], 3], expected: 2 },
      { input: [[0, 1, 2, 2, 3, 0, 4, 2], 2], expected: 5 },
    ]);
  });

  it('builds an operation-sequence suite for class design problems', async () => {
    vi.stubEnv('BUILT_IN_FORGE_API_KEY', '');
    vi.stubEnv('DEEPSEEK_API_KEY', '');

    const suite = await generateTestcaseSuite({
      titleSlug: 'implement-stack-using-queues',
      titleEn: 'Implement Stack using Queues',
      contentEn: `
        <pre><strong>Input</strong>
        ["MyStack","push","push","top","pop","empty"]
        [[],[1],[2],[],[],[]]
        <strong>Output</strong>
        [null,null,null,2,2,false]</pre>
      `,
      contentZh: null,
      difficulty: 'Easy',
      codeSnippetsJson: [{
        langSlug: 'python3',
        code: 'class MyStack:\n    def __init__(self): pass\n    def push(self, x: int) -> None: pass\n    def pop(self) -> int: pass',
      }],
      exampleTestcases: '["MyStack","push","push","top","pop","empty"]\n[[],[1],[2],[],[],[]]',
    });

    expect(suite).toMatchObject({
      methodName: '__operations__',
      className: 'MyStack',
      source: 'official-examples',
      cases: [{
        input: [
          ['MyStack', 'push', 'push', 'top', 'pop', 'empty'],
          [[], [1], [2], [], [], []],
        ],
        expected: [null, null, null, 2, 2, false],
      }],
    });
  });

  it('keeps every design example and marks tree-valued constructor arguments', async () => {
    vi.stubEnv('BUILT_IN_FORGE_API_KEY', '');
    vi.stubEnv('DEEPSEEK_API_KEY', '');

    const suite = await generateTestcaseSuite({
      titleSlug: 'find-elements-in-a-contaminated-binary-tree',
      titleEn: 'Find Elements in a Contaminated Binary Tree',
      contentEn: `
        <pre><strong>Input</strong>
        ["FindElements","find","find"]
        [[[-1,null,-1]],[1],[2]]
        <strong>Output</strong>
        [null,false,true]</pre>
        <pre><strong>Input</strong>
        ["FindElements","find","find"]
        [[[-1,-1,-1]],[1],[5]]
        <strong>Output</strong>
        [null,true,false]</pre>
      `,
      contentZh: null,
      difficulty: 'Medium',
      codeSnippetsJson: [{
        langSlug: 'python3',
        code: 'class FindElements:\n    def __init__(self, root: Optional[TreeNode]): pass\n    def find(self, target: int) -> bool: pass',
      }],
      exampleTestcases: '["FindElements","find","find"]\n[[[-1,null,-1]],[1],[2]]\n["FindElements","find","find"]\n[[[-1,-1,-1]],[1],[5]]',
    });

    expect(suite.inputAdapter).toBe('design-binary-tree');
    expect(suite.cases).toEqual([
      {
        input: [
          ['FindElements', 'find', 'find'],
          [[[-1, null, -1]], [1], [2]],
        ],
        expected: [null, false, true],
      },
      {
        input: [
          ['FindElements', 'find', 'find'],
          [[[-1, -1, -1]], [1], [5]],
        ],
        expected: [null, true, false],
      },
    ]);
  });

  it('marks CBTInserter tree constructor arguments for local conversion', async () => {
    vi.stubEnv('BUILT_IN_FORGE_API_KEY', '');
    vi.stubEnv('DEEPSEEK_API_KEY', '');

    const suite = await generateTestcaseSuite({
      titleSlug: 'complete-binary-tree-inserter',
      titleEn: 'Complete Binary Tree Inserter',
      contentEn: `
        <pre><strong>Input</strong>
        ["CBTInserter","insert","get_root"]
        [[[1,2]],[3],[]]
        <strong>Output</strong>
        [null,1,[1,2,3]]</pre>
      `,
      contentZh: null,
      difficulty: 'Medium',
      codeSnippetsJson: [{
        langSlug: 'python3',
        code: 'class CBTInserter:\n    def __init__(self, root: Optional[TreeNode]): pass\n    def insert(self, val: int) -> int: pass\n    def get_root(self) -> Optional[TreeNode]: pass',
      }],
      exampleTestcases: '["CBTInserter","insert","get_root"]\n[[[1,2]],[3],[]]',
    });

    expect(suite.inputAdapter).toBe('design-binary-tree');
  });

  it('marks PeekingIterator list input for the local Iterator wrapper', async () => {
    vi.stubEnv('BUILT_IN_FORGE_API_KEY', '');
    vi.stubEnv('DEEPSEEK_API_KEY', '');

    const suite = await generateTestcaseSuite({
      titleSlug: 'peeking-iterator',
      titleEn: 'Peeking Iterator',
      contentEn: `
        <pre><strong>Input</strong>
        ["PeekingIterator","next","peek","next","hasNext"]
        [[[1,2,3]],[],[],[],[]]
        <strong>Output</strong>
        [null,1,2,2,true]</pre>
      `,
      contentZh: null,
      difficulty: 'Medium',
      codeSnippetsJson: [{
        langSlug: 'python3',
        code: 'class PeekingIterator:\n    def __init__(self, iterator: Iterator): pass\n    def peek(self) -> int: pass',
      }],
      exampleTestcases: '["PeekingIterator","next","peek","next","hasNext"]\n[[[1,2,3]],[],[],[],[]]',
    });

    expect(suite.inputAdapter).toBe('design-iterator');
  });

  it('uses membership validation for nondeterministic getRandom results', async () => {
    vi.stubEnv('BUILT_IN_FORGE_API_KEY', '');
    vi.stubEnv('DEEPSEEK_API_KEY', '');

    const suite = await generateTestcaseSuite({
      titleSlug: 'insert-delete-getrandom-o1',
      titleEn: 'Insert Delete GetRandom O(1)',
      contentEn: `
        <pre><strong>Input</strong>
        ["RandomizedSet","insert","insert","getRandom"]
        [[],[1],[2],[]]
        <strong>Output</strong>
        [null,true,true,2]</pre>
      `,
      contentZh: null,
      difficulty: 'Medium',
      codeSnippetsJson: [{
        langSlug: 'python3',
        code: 'class RandomizedSet:\n    def __init__(self): pass\n    def insert(self, val: int) -> bool: pass\n    def getRandom(self) -> int: pass',
      }],
      exampleTestcases: '["RandomizedSet","insert","insert","getRandom"]\n[[],[1],[2],[]]',
    });

    expect(suite.validator).toBe('randomized-container');
  });

  it.each([
    ['remove-duplicates-from-sorted-array', 'remove-duplicates', '[1,1,2]', '2, nums = [1,2,_]'],
    ['remove-duplicates-from-sorted-array-ii', 'remove-duplicates-ii', '[1,1,1,2,2,3]', '5, nums = [1,1,2,2,3,_]'],
  ])('validates the mutated prefix for %s', async (titleSlug, validator, input, output) => {
    vi.stubEnv('BUILT_IN_FORGE_API_KEY', '');
    vi.stubEnv('DEEPSEEK_API_KEY', '');

    const suite = await generateTestcaseSuite({
      titleSlug,
      titleEn: titleSlug,
      contentEn: `<pre><strong>Input:</strong> nums = ${input}\n<strong>Output:</strong> ${output}</pre>`,
      contentZh: null,
      difficulty: 'Medium',
      codeSnippetsJson: [{
        langSlug: 'python3',
        code: 'class Solution:\n    def removeDuplicates(self, nums: List[int]) -> int:\n        pass',
      }],
      exampleTestcases: input,
    });

    expect(suite.validator).toBe(validator);
  });

  it('uses the aligned design example from the statement when stored inputs are incomplete', () => {
    const suite = buildOfficialExampleSuite({
      titleSlug: 'design-linked-list',
      titleEn: 'Design Linked List',
      contentEn: `
        <pre><strong>Input</strong>
        ["MyLinkedList","addAtHead","addAtTail","addAtIndex","get","deleteAtIndex","get"]
        [[],[1],[3],[1,2],[1],[1],[1]]
        <strong>Output</strong>
        [null,null,null,null,2,null,3]</pre>
      `,
      contentZh: null,
      difficulty: 'Medium',
      codeSnippetsJson: [{
        langSlug: 'python3',
        code: 'class MyLinkedList:\n    def __init__(self): pass\n    def get(self, index: int) -> int: pass',
      }],
      exampleTestcases: '["MyLinkedList","addAtHead","deleteAtIndex","addAtTail","get"]\n[[],[1],[0],[2],[0]]',
    });

    expect(suite).toMatchObject({
      methodName: '__operations__',
      className: 'MyLinkedList',
      cases: [{
        input: [
          ['MyLinkedList', 'addAtHead', 'addAtTail', 'addAtIndex', 'get', 'deleteAtIndex', 'get'],
          [[], [1], [3], [1, 2], [1], [1], [1]],
        ],
        expected: [null, null, null, null, 2, null, 3],
      }],
    });
  });

  it('builds cyclic linked-list cases from LeetCode list and position inputs', async () => {
    vi.stubEnv('BUILT_IN_FORGE_API_KEY', '');
    vi.stubEnv('DEEPSEEK_API_KEY', '');

    const suite = await generateTestcaseSuite({
      titleSlug: 'linked-list-cycle-ii',
      titleEn: 'Linked List Cycle II',
      contentEn: '<p>Return the node where the cycle begins.</p>',
      contentZh: null,
      difficulty: 'Medium',
      codeSnippetsJson: [{
        langSlug: 'python3',
        code: 'class Solution:\n    def detectCycle(self, head: Optional[ListNode]) -> Optional[ListNode]:\n        pass',
      }],
      exampleTestcases: '[3,2,0,-4]\n1\n[1,2]\n0\n[1]\n-1',
    });

    expect(suite).toMatchObject({
      methodName: 'detectCycle',
      inputAdapter: 'linked-list-cycle',
      resultAdapter: 'linked-list-node-index',
      cases: [
        { input: [[3, 2, 0, -4], 1], expected: 1 },
        { input: [[1, 2], 0], expected: 0 },
        { input: [[1], -1], expected: -1 },
      ],
    });
  });

  it('builds boolean cycle-detection cases from list and position inputs', async () => {
    vi.stubEnv('BUILT_IN_FORGE_API_KEY', '');
    vi.stubEnv('DEEPSEEK_API_KEY', '');

    const suite = await generateTestcaseSuite({
      titleSlug: 'linked-list-cycle',
      titleEn: 'Linked List Cycle',
      contentEn: '<p>Return true if there is a cycle in the linked list.</p>',
      contentZh: null,
      difficulty: 'Easy',
      codeSnippetsJson: [{
        langSlug: 'python3',
        code: 'class Solution:\n    def hasCycle(self, head: Optional[ListNode]) -> bool:\n        pass',
      }],
      exampleTestcases: '[3,2,0,-4]\n1\n[1]\n-1',
    });

    expect(suite).toMatchObject({
      methodName: 'hasCycle',
      inputAdapter: 'linked-list-cycle',
      cases: [
        { input: [[3, 2, 0, -4], 1], expected: true },
        { input: [[1], -1], expected: false },
      ],
    });
  });

  it('marks lowest-common-ancestor inputs as references into one binary tree', async () => {
    vi.stubEnv('BUILT_IN_FORGE_API_KEY', '');
    vi.stubEnv('DEEPSEEK_API_KEY', '');

    const suite = await generateTestcaseSuite({
      titleSlug: 'lowest-common-ancestor-of-a-binary-search-tree',
      titleEn: 'Lowest Common Ancestor of a Binary Search Tree',
      contentEn: `
        <pre><strong>Input:</strong> root = [6,2,8,0,4,7,9,null,null,3,5], p = 2, q = 8
        <strong>Output:</strong> 6</pre>
      `,
      contentZh: null,
      difficulty: 'Medium',
      codeSnippetsJson: [{
        langSlug: 'python3',
        code: 'class Solution:\n    def lowestCommonAncestor(self, root: TreeNode, p: TreeNode, q: TreeNode) -> TreeNode:\n        pass',
      }],
      exampleTestcases: '[6,2,8,0,4,7,9,null,null,3,5]\n2\n8',
    });

    expect(suite).toMatchObject({
      methodName: 'lowestCommonAncestor',
      inputAdapter: 'binary-tree-node-refs',
      resultAdapter: 'tree-node-value',
      cases: [{
        input: [[6, 2, 8, 0, 4, 7, 9, null, null, 3, 5], 2, 8],
        expected: 6,
      }],
    });
  });

  it('uses a property validator when multiple balanced BST shapes are valid', async () => {
    vi.stubEnv('BUILT_IN_FORGE_API_KEY', '');
    vi.stubEnv('DEEPSEEK_API_KEY', '');

    const suite = await generateTestcaseSuite({
      titleSlug: 'convert-sorted-array-to-binary-search-tree',
      titleEn: 'Convert Sorted Array to Binary Search Tree',
      contentEn: `
        <p>Return a height-balanced binary search tree.</p>
        <pre><strong>Input:</strong> nums = [-10,-3,0,5,9]
        <strong>Output:</strong> [0,-3,9,-10,null,5]</pre>
      `,
      contentZh: null,
      difficulty: 'Easy',
      codeSnippetsJson: [{
        langSlug: 'python3',
        code: 'class Solution:\n    def sortedArrayToBST(self, nums: List[int]) -> Optional[TreeNode]:\n        pass',
      }],
      exampleTestcases: '[-10,-3,0,5,9]',
    });

    expect(suite.validator).toBe('balanced-bst-from-sorted-array');
  });

  it('uses a property validator when BST deletion has multiple valid shapes', async () => {
    vi.stubEnv('BUILT_IN_FORGE_API_KEY', '');
    vi.stubEnv('DEEPSEEK_API_KEY', '');

    const suite = await generateTestcaseSuite({
      titleSlug: 'delete-node-in-a-bst',
      titleEn: 'Delete Node in a BST',
      contentEn: `
        <pre><strong>Input:</strong> root = [5,3,6,2,4,null,7], key = 3
        <strong>Output:</strong> [5,4,6,2,null,null,7]</pre>
      `,
      contentZh: null,
      difficulty: 'Medium',
      codeSnippetsJson: [{
        langSlug: 'python3',
        code: 'class Solution:\n    def deleteNode(self, root: Optional[TreeNode], key: int) -> Optional[TreeNode]:\n        pass',
      }],
      exampleTestcases: '[5,3,6,2,4,null,7]\n3',
    });

    expect(suite.validator).toBe('bst-delete');
  });

  it('uses a property validator when BST insertion allows any valid shape', async () => {
    vi.stubEnv('BUILT_IN_FORGE_API_KEY', '');
    vi.stubEnv('DEEPSEEK_API_KEY', '');

    const suite = await generateTestcaseSuite({
      titleSlug: 'insert-into-a-binary-search-tree',
      titleEn: 'Insert into a Binary Search Tree',
      contentEn: `
        <p>There may exist multiple valid ways for the insertion. You can return any of them.</p>
        <pre><strong>Input:</strong> root = [4,2,7,1,3], val = 5
        <strong>Output:</strong> [4,2,7,1,3,5]</pre>
      `,
      contentZh: null,
      difficulty: 'Medium',
      codeSnippetsJson: [{
        langSlug: 'python3',
        code: 'class Solution:\n    def insertIntoBST(self, root: Optional[TreeNode], val: int) -> Optional[TreeNode]:\n        pass',
      }],
      exampleTestcases: '[4,2,7,1,3]\n5',
    });

    expect(suite.validator).toBe('bst-insert');
  });

  it('uses nested order-insensitive comparison for combinations of unordered values', async () => {
    vi.stubEnv('BUILT_IN_FORGE_API_KEY', '');
    vi.stubEnv('DEEPSEEK_API_KEY', '');

    const suite = await generateTestcaseSuite({
      titleSlug: '3sum',
      titleEn: '3Sum',
      contentEn: `
        <p>The order of the output and the order of the triplets does not matter.</p>
        <pre><strong>Input:</strong> nums = [-1,0,1,2,-1,-4]
        <strong>Output:</strong> [[-1,-1,2],[-1,0,1]]</pre>
      `,
      contentZh: null,
      difficulty: 'Medium',
      codeSnippetsJson: [{
        langSlug: 'python3',
        code: 'class Solution:\n    def threeSum(self, nums: List[int]) -> List[List[int]]:\n        pass',
      }],
      exampleTestcases: '[-1,0,1,2,-1,-4]',
    });

    expect(suite.comparison).toBe('deep-unordered');
  });

  it.each([
    {
      titleSlug: 'palindrome-partitioning',
      titleEn: 'Palindrome Partitioning',
      method: 'partition',
      input: '"aab"',
      output: '[["a","a","b"],["aa","b"]]',
      signature: 's: str',
    },
    {
      titleSlug: 'merge-intervals',
      titleEn: 'Merge Intervals',
      method: 'merge',
      input: '[[1,3],[2,6],[8,10],[15,18]]',
      output: '[[1,6],[8,10],[15,18]]',
      signature: 'intervals: List[List[int]]',
    },
  ])('ignores only outer result order for $titleSlug', async ({ titleSlug, titleEn, method, input, output, signature }) => {
    vi.stubEnv('BUILT_IN_FORGE_API_KEY', '');
    vi.stubEnv('DEEPSEEK_API_KEY', '');

    const suite = await generateTestcaseSuite({
      titleSlug,
      titleEn,
      contentEn: `<pre><strong>Input:</strong> value = ${input}\n<strong>Output:</strong> ${output}</pre>`,
      contentZh: null,
      difficulty: 'Medium',
      codeSnippetsJson: [{
        langSlug: 'python3',
        code: `class Solution:\n    def ${method}(self, ${signature}):\n        pass`,
      }],
      exampleTestcases: input,
    });

    expect(suite.comparison).toBe('unordered');
  });

  it('does not shift later outputs onto inputs when an earlier output is unparsable', () => {
    const suite = buildOfficialExampleSuite({
      titleSlug: 'diagram-output-fixture',
      titleEn: 'Diagram Output Fixture',
      contentEn: `
        <pre><strong>Input:</strong> value = 1
        <strong>Output:</strong> impossible diagram</pre>
        <pre><strong>Input:</strong> value = 2
        <strong>Output:</strong> 20</pre>
        <p>Historical output:</p>
        <strong>Output:</strong> 999
      `,
      contentZh: null,
      difficulty: 'Easy',
      codeSnippetsJson: [{
        langSlug: 'python3',
        code: 'class Solution:\n    def solve(self, value: int) -> int:\n        pass',
      }],
      exampleTestcases: '1\n2',
    });

    expect(suite).toBeNull();
  });
});
