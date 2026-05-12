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

async function runPython(userCode: string, suite: typeof TWO_SUM_SUITE, timeoutMs = 5000) {
  const source = buildHarness({ language: "python", userCode });
  const stdin = JSON.stringify(suite);
  const run = await runUserCode({ language: "python", source, stdin, timeoutMs });
  return { run, parsed: parseHarnessOutput(run.stdout) };
}

describe("judge end-to-end (python)", () => {
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
