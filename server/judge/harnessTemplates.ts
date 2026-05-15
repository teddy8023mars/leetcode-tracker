/**
 * Harness templates wrap a user-written `Solution` class into a runnable program.
 *
 * Protocol (language-agnostic):
 *   - stdin: a JSON object {methodName, cases:[{input:[..], expected:any}, ...]}
 *     where `input` is a list of positional arguments for `Solution.<methodName>`.
 *   - stdout: one JSON object per line for each case, in order:
 *       {"i":<idx>, "ok":<bool>, "actual":<any>, "elapsedMs":<number>, "error":<string|null>}
 *     Trailing summary line: {"summary":true, "passed":N, "total":M}
 *
 * V1: Python is fully supported. Java/C++ harnesses emit a graceful
 *     "not supported" message; the frontend hides those languages.
 */

import type { SupportedLanguage } from "./sandboxRunner";

export interface BuildHarnessOpts {
  language: SupportedLanguage;
  /** Raw user source code, expected to define a `Solution` class with the expected method. */
  userCode: string;
}

const PYTHON_HARNESS = `
import sys, json, traceback, time
# Pre-seed the same standard names LeetCode injects, so users can write
# def twoSum(self, nums: List[int], target: int) -> List[int]: without an explicit import.
from typing import List, Dict, Set, Tuple, Optional, Deque, Any, Union, Callable, Iterable, Iterator
from collections import defaultdict, Counter, deque, OrderedDict
import math, heapq, bisect, itertools, functools, re, string, random

class ListNode:
    def __init__(self, val=0, next=None):
        self.val = val
        self.next = next

class TreeNode:
    def __init__(self, val=0, left=None, right=None):
        self.val = val
        self.left = left
        self.right = right

def _list_to_linked(arr):
    if not arr: return None
    head = ListNode(arr[0])
    cur = head
    for v in arr[1:]:
        cur.next = ListNode(v)
        cur = cur.next
    return head

def _linked_to_list(node):
    res = []
    while node:
        res.append(node.val)
        node = node.next
    return res

def _list_to_tree(arr):
    if not arr or arr[0] is None: return None
    root = TreeNode(arr[0])
    q = deque([root])
    i = 1
    while q and i < len(arr):
        node = q.popleft()
        if i < len(arr) and arr[i] is not None:
            node.left = TreeNode(arr[i])
            q.append(node.left)
        i += 1
        if i < len(arr) and arr[i] is not None:
            node.right = TreeNode(arr[i])
            q.append(node.right)
        i += 1
    return root

def _tree_to_list(root):
    if not root: return []
    res, q = [], deque([root])
    while q:
        node = q.popleft()
        if node:
            res.append(node.val)
            q.append(node.left)
            q.append(node.right)
        else:
            res.append(None)
    while res and res[-1] is None: res.pop()
    return res

USER_CODE = __USER_CODE__

# Execute user code in a namespace that already contains the imports above.
_user_ns = dict(globals())
_user_ns["__name__"] = "__user__"
try:
    exec(compile(USER_CODE, "<user>", "exec"), _user_ns)
except Exception as e:
    print(json.dumps({"i": -1, "ok": False, "actual": None, "elapsedMs": 0,
                      "error": "compile/import error: " + str(e) + "\\n" + traceback.format_exc()}))
    print(json.dumps({"summary": True, "passed": 0, "total": 0, "fatal": True}))
    sys.exit(0)

if "Solution" not in _user_ns:
    print(json.dumps({"i": -1, "ok": False, "actual": None, "elapsedMs": 0,
                      "error": "Your code must define a class named 'Solution'."}))
    print(json.dumps({"summary": True, "passed": 0, "total": 0, "fatal": True}))
    sys.exit(0)

Solution = _user_ns["Solution"]

raw = sys.stdin.read()
try:
    suite = json.loads(raw)
except Exception as e:
    print(json.dumps({"i": -1, "ok": False, "actual": None, "elapsedMs": 0,
                      "error": "harness: bad suite json: " + str(e)}))
    print(json.dumps({"summary": True, "passed": 0, "total": 0, "fatal": True}))
    sys.exit(0)

method_name = suite.get("methodName")
cases = suite.get("cases", [])
if not method_name:
    print(json.dumps({"i": -1, "ok": False, "actual": None, "elapsedMs": 0,
                      "error": "harness: methodName missing in suite"}))
    print(json.dumps({"summary": True, "passed": 0, "total": 0, "fatal": True}))
    sys.exit(0)

def norm(x):
    if isinstance(x, ListNode):
        return _linked_to_list(x)
    if isinstance(x, TreeNode):
        return _tree_to_list(x)
    if isinstance(x, tuple):
        return [norm(e) for e in x]
    if isinstance(x, list):
        return [norm(e) for e in x]
    return x

# Auto-detect if args need ListNode/TreeNode conversion using a probe call
_convert_mode = 'raw'  # 'raw', 'linked', 'tree'
_first_case_args = cases[0].get("input") or cases[0].get("args") or [] if cases else []
if isinstance(_first_case_args, list) and any(isinstance(a, list) for a in _first_case_args):
    _probe_inst = Solution()
    _probe_method = getattr(_probe_inst, method_name, None)
    if _probe_method:
        try:
            _probe_method(*_first_case_args)
        except (TypeError, AttributeError):
            _linked_args = [_list_to_linked(a) if isinstance(a, list) else a for a in _first_case_args]
            try:
                _probe_inst2 = Solution()
                _probe_method2 = getattr(_probe_inst2, method_name)
                _probe_method2(*_linked_args)
                _convert_mode = 'linked'
            except (TypeError, AttributeError):
                _convert_mode = 'tree'
        except Exception:
            pass

def _convert_args(args):
    if _convert_mode == 'linked':
        return [_list_to_linked(a) if isinstance(a, list) else a for a in args]
    if _convert_mode == 'tree':
        return [_list_to_tree(a) if isinstance(a, list) else a for a in args]
    return args

passed = 0
total = len(cases)
for i, c in enumerate(cases):
    args = c.get("input")
    if args is None:
        args = c.get("args", [])
    if args is None:
        args = []
    if not isinstance(args, list):
        args = [args]
    args = _convert_args(args)
    expected = c.get("expected")
    inst = Solution()
    method = getattr(inst, method_name, None)
    if method is None:
        print(json.dumps({"i": i, "ok": False, "actual": None, "elapsedMs": 0,
                          "error": "Solution has no method '" + method_name + "'"}))
        continue
    t0 = time.time()
    try:
        actual = method(*args)
        elapsed_ms = int((time.time() - t0) * 1000)
    except Exception as e:
        elapsed_ms = int((time.time() - t0) * 1000)
        print(json.dumps({"i": i, "ok": False, "actual": None, "elapsedMs": elapsed_ms,
                          "error": str(e) + "\\n" + traceback.format_exc()[-1500:]}))
        continue
    actual_norm = norm(actual)
    ok = actual_norm == expected
    if ok:
        passed += 1
    try:
        actual_serialized = json.dumps(actual_norm)
        actual_out = actual_norm
        if len(actual_serialized) > 4000:
            actual_out = actual_serialized[:4000] + "...[truncated]"
    except Exception:
        actual_out = repr(actual_norm)[:4000]
    print(json.dumps({"i": i, "ok": ok, "actual": actual_out, "elapsedMs": elapsed_ms, "error": None}))

print(json.dumps({"summary": True, "passed": passed, "total": total}))
`;

const JAVA_STUB = `
public class Main {
  public static void main(String[] args) {
    System.out.println("{\\"i\\":-1,\\"ok\\":false,\\"actual\\":null,\\"elapsedMs\\":0,\\"error\\":\\"Java judging not yet supported. Please submit Python.\\"}");
    System.out.println("{\\"summary\\":true,\\"passed\\":0,\\"total\\":0,\\"fatal\\":true}");
  }
}
`;

const CPP_STUB = `
#include <iostream>
int main() {
  std::cout << "{\\"i\\":-1,\\"ok\\":false,\\"actual\\":null,\\"elapsedMs\\":0,\\"error\\":\\"C++ judging not yet supported. Please submit Python.\\"}" << std::endl;
  std::cout << "{\\"summary\\":true,\\"passed\\":0,\\"total\\":0,\\"fatal\\":true}" << std::endl;
  return 0;
}
`;

/**
 * Build the full source-code program that wraps the user's Solution class.
 * For Python we embed the user code as a JSON-escaped string literal so we can
 * `exec()` it inside a controlled namespace (Python and JSON share enough escape
 * grammar that this is safe). For Java/C++ we emit a stub program that reports
 * "not yet supported" — the harness contract still produces valid judge protocol output.
 */
export function buildHarness({ language, userCode }: BuildHarnessOpts): string {
  if (language === "python") {
    const encoded = JSON.stringify(userCode);
    return PYTHON_HARNESS.replace("__USER_CODE__", encoded);
  }
  if (language === "java") {
    return JAVA_STUB;
  }
  if (language === "cpp") {
    return CPP_STUB;
  }
  throw new Error(`Unsupported language: ${language}`);
}

export interface CaseLine {
  i: number;
  ok: boolean;
  actual: unknown;
  elapsedMs: number;
  error: string | null;
}
export interface SummaryLine {
  summary: true;
  passed: number;
  total: number;
  fatal?: boolean;
}

export interface ParsedHarnessOutput {
  cases: CaseLine[];
  summary: SummaryLine | null;
  /** Lines that failed to parse — kept for debugging. */
  parseErrors: string[];
}

/**
 * Parse the harness stdout into structured case results + summary.
 * Tolerates non-JSON lines (e.g. user `print()` statements) and surfaces them in parseErrors.
 */
export function parseHarnessOutput(stdout: string): ParsedHarnessOutput {
  const cases: CaseLine[] = [];
  let summary: SummaryLine | null = null;
  const parseErrors: string[] = [];
  const lines = stdout.split(/\r?\n/);
  for (const raw of lines) {
    const line = raw.trim();
    if (!line) continue;
    if (!line.startsWith("{")) {
      parseErrors.push(line.length > 200 ? line.slice(0, 200) + "…" : line);
      continue;
    }
    try {
      const obj = JSON.parse(line);
      if (obj && obj.summary === true) {
        summary = obj as SummaryLine;
      } else if (typeof obj?.i === "number") {
        cases.push(obj as CaseLine);
      } else {
        parseErrors.push(line.slice(0, 200));
      }
    } catch {
      parseErrors.push(line.slice(0, 200));
    }
  }
  return { cases, summary, parseErrors };
}
