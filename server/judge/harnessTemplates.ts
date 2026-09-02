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
import math, heapq, bisect, itertools, functools, re, string, random, copy

class ListNode:
    def __init__(self, val=0, next=None):
        self.val = val
        self.next = next

class TreeNode:
    def __init__(self, val=0, left=None, right=None):
        self.val = val
        self.left = left
        self.right = right

class Iterator:
    def __init__(self, values):
        self.values = list(values)
        self.index = 0
    def next(self):
        value = self.values[self.index]
        self.index += 1
        return value
    def hasNext(self):
        return self.index < len(self.values)

def _list_to_linked(arr):
    if not arr: return None
    head = ListNode(arr[0])
    cur = head
    for v in arr[1:]:
        cur.next = ListNode(v)
        cur = cur.next
    return head

def _list_to_cycle(arr, position):
    if not arr:
        return None, []
    nodes = [ListNode(value) for value in arr]
    for index in range(len(nodes) - 1):
        nodes[index].next = nodes[index + 1]
    if isinstance(position, int) and 0 <= position < len(nodes):
        nodes[-1].next = nodes[position]
    return nodes[0], nodes

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

def _is_tree_node(value):
    return value is not None and all(hasattr(value, attr) for attr in ("val", "left", "right"))

def _is_list_node(value):
    return value is not None and hasattr(value, "val") and hasattr(value, "next") and not _is_tree_node(value)

def _find_tree_node(root, value):
    if root is None:
        return None
    q = deque([root])
    while q:
        node = q.popleft()
        if node.val == value:
            return node
        if node.left:
            q.append(node.left)
        if node.right:
            q.append(node.right)
    return None

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

Solution = _user_ns.get("Solution")

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
comparison = suite.get("comparison", "exact")
result_from_arg = suite.get("resultFromArg")
class_name = suite.get("className")
input_adapter = suite.get("inputAdapter")
result_adapter = suite.get("resultAdapter")
validator = suite.get("validator")
if class_name:
    if class_name not in _user_ns:
        print(json.dumps({"i": -1, "ok": False, "actual": None, "elapsedMs": 0,
                          "error": "Your code must define a class named '" + class_name + "'."}))
        print(json.dumps({"summary": True, "passed": 0, "total": 0, "fatal": True}))
        sys.exit(0)
elif Solution is None:
    print(json.dumps({"i": -1, "ok": False, "actual": None, "elapsedMs": 0,
                      "error": "Your code must define a class named 'Solution'."}))
    print(json.dumps({"summary": True, "passed": 0, "total": 0, "fatal": True}))
    sys.exit(0)
if not method_name:
    print(json.dumps({"i": -1, "ok": False, "actual": None, "elapsedMs": 0,
                      "error": "harness: methodName missing in suite"}))
    print(json.dumps({"summary": True, "passed": 0, "total": 0, "fatal": True}))
    sys.exit(0)

def norm(x):
    if x is None and _convert_mode in ('linked', 'nested_linked'):
        return []
    if x is None and _convert_mode in ('tree', 'nested_tree'):
        return []
    if _is_tree_node(x):
        return _tree_to_list(x)
    if _is_list_node(x):
        return _linked_to_list(x)
    if isinstance(x, tuple):
        return [norm(e) for e in x]
    if isinstance(x, list):
        return [norm(e) for e in x]
    return x

def _stable_key(x):
    try:
        return json.dumps(x, sort_keys=True, separators=(",", ":"))
    except Exception:
        return repr(x)

def _unordered_norm(x):
    if isinstance(x, list):
        return sorted(x, key=_stable_key)
    return x

def _deep_unordered_norm(x):
    if isinstance(x, list):
        return sorted([_deep_unordered_norm(item) for item in x], key=_stable_key)
    if isinstance(x, dict):
        return {key: _deep_unordered_norm(value) for key, value in x.items()}
    return x

def _deep_equal(actual, expected):
    if isinstance(actual, (int, float)) and not isinstance(actual, bool) and isinstance(expected, (int, float)) and not isinstance(expected, bool):
        if isinstance(actual, float) or isinstance(expected, float):
            return math.isclose(actual, expected, rel_tol=1e-5, abs_tol=1e-5)
        return actual == expected
    if isinstance(actual, list) and isinstance(expected, list):
        return len(actual) == len(expected) and all(_deep_equal(a, e) for a, e in zip(actual, expected))
    if isinstance(actual, dict) and isinstance(expected, dict):
        return actual.keys() == expected.keys() and all(_deep_equal(actual[k], expected[k]) for k in actual)
    return actual == expected

def answers_equal(actual, expected):
    if comparison == "unordered":
        return _deep_equal(_unordered_norm(actual), _unordered_norm(expected))
    if comparison == "deep-unordered":
        return _deep_equal(_deep_unordered_norm(actual), _deep_unordered_norm(expected))
    return _deep_equal(actual, expected)

def _tree_inorder(root):
    if root is None:
        return []
    return _tree_inorder(root.left) + [root.val] + _tree_inorder(root.right)

def _balanced_height(root):
    if root is None:
        return 0
    left_height = _balanced_height(root.left)
    right_height = _balanced_height(root.right)
    if left_height < 0 or right_height < 0 or abs(left_height - right_height) > 1:
        return -1
    return max(left_height, right_height) + 1

def validate_semantic(actual, args, original_args, expected):
    if validator == "remove-element":
        if isinstance(actual, bool) or not isinstance(actual, int) or len(args) < 2 or len(original_args) < 2:
            return False
        nums = args[0]
        original_nums = original_args[0]
        value = original_args[1]
        if not isinstance(nums, list) or not isinstance(original_nums, list) or actual < 0 or actual > len(nums):
            return False
        expected_values = [item for item in original_nums if item != value]
        return actual == expected and _deep_equal(
            sorted(nums[:actual], key=_stable_key),
            sorted(expected_values, key=_stable_key),
        )
    if validator in ("remove-duplicates", "remove-duplicates-ii"):
        if isinstance(actual, bool) or not isinstance(actual, int) or not args or not original_args:
            return False
        nums = args[0]
        original_nums = original_args[0]
        if not isinstance(nums, list) or not isinstance(original_nums, list) or actual < 0 or actual > len(nums):
            return False
        allowed = 1 if validator == "remove-duplicates" else 2
        seen_counts = {}
        expected_prefix = []
        for item in original_nums:
            count = seen_counts.get(item, 0)
            if count < allowed:
                expected_prefix.append(item)
            seen_counts[item] = count + 1
        return actual == expected and _deep_equal(nums[:actual], expected_prefix)
    if validator == "balanced-bst-from-sorted-array":
        if not original_args or not isinstance(original_args[0], list):
            return False
        values = original_args[0]
        if not values:
            return actual is None
        return _is_tree_node(actual) and _tree_inorder(actual) == values and _balanced_height(actual) >= 0
    if validator == "bst-delete":
        if len(original_args) < 2:
            return False
        if original_args[0] is None:
            return actual is None
        if not _is_tree_node(original_args[0]):
            return False
        expected_values = _tree_inorder(original_args[0])
        key = original_args[1]
        if key in expected_values:
            expected_values.remove(key)
        if not expected_values:
            return actual is None
        return _is_tree_node(actual) and _tree_inorder(actual) == expected_values
    if validator == "bst-insert":
        if len(original_args) < 2:
            return False
        original_root = original_args[0]
        if original_root is not None and not _is_tree_node(original_root):
            return False
        expected_values = _tree_inorder(original_root)
        expected_values.append(original_args[1])
        expected_values.sort()
        return _is_tree_node(actual) and _tree_inorder(actual) == expected_values
    return answers_equal(norm(actual), expected)

def validate_design_results(operations, operation_args, results, expected):
    if validator != "randomized-container":
        return answers_equal(norm(results), expected)
    if not isinstance(expected, list) or len(results) != len(expected):
        return False
    counts = {}
    for operation, call_args, actual_value, expected_value in zip(operations, operation_args, results, expected):
        if operation == class_name:
            counts = {}
            if actual_value is not None:
                return False
            continue
        if operation == "getRandom":
            if counts.get(actual_value, 0) <= 0:
                return False
            continue
        if not _deep_equal(actual_value, expected_value):
            return False
        if not isinstance(call_args, list):
            call_args = [call_args]
        if operation == "insert" and call_args:
            value = call_args[0]
            if class_name == "RandomizedCollection" or actual_value is True:
                counts[value] = counts.get(value, 0) + 1
        elif operation == "remove" and call_args and actual_value is True:
            value = call_args[0]
            counts[value] = max(0, counts.get(value, 0) - 1)
    return True

# Auto-detect if args need ListNode/TreeNode conversion using a probe call
_convert_mode = 'raw'  # 'raw', 'linked', 'tree', 'nested_linked', 'nested_tree'
_first_case_args = cases[0].get("input") or cases[0].get("args") or [] if cases else []
if not class_name and not input_adapter and isinstance(_first_case_args, list) and any(isinstance(a, list) for a in _first_case_args):
    _probe_inst = Solution()
    _probe_method = getattr(_probe_inst, method_name, None)
    if _probe_method:
        try:
            # A probe must never mutate the real testcase before the measured run.
            _probe_method(*copy.deepcopy(_first_case_args))
        except AttributeError as _probe_error:
            # Only retry when raw arrays clearly failed because the solution expects
            # LeetCode node objects. A normal user TypeError is a code error, not a
            # signal to reinterpret every array as a tree.
            _probe_error_text = str(_probe_error)
            _node_attribute_error = (
                "'list' object has no attribute" in _probe_error_text
                and any("'" + attr + "'" in _probe_error_text for attr in ('val', 'next', 'left', 'right'))
            )
            if _node_attribute_error:
                # Try flat linked: each list arg -> ListNode
                _linked_args = [_list_to_linked(a) if isinstance(a, list) else a for a in _first_case_args]
                try:
                    _probe_inst2 = Solution()
                    getattr(_probe_inst2, method_name)(*_linked_args)
                    _convert_mode = 'linked'
                except (TypeError, AttributeError):
                    # Try nested linked: list of lists -> list of ListNodes
                    _nested_args = [
                        [_list_to_linked(sub) if isinstance(sub, list) else sub for sub in a] if isinstance(a, list) and any(isinstance(sub, list) for sub in a) else (_list_to_linked(a) if isinstance(a, list) else a)
                        for a in _first_case_args
                    ]
                    try:
                        _probe_inst3 = Solution()
                        getattr(_probe_inst3, method_name)(*_nested_args)
                        _convert_mode = 'nested_linked'
                    except (TypeError, AttributeError):
                        _convert_mode = 'tree'
        except Exception:
            pass

def _convert_one(a):
    if not isinstance(a, list):
        return a
    if _convert_mode == 'linked':
        return _list_to_linked(a)
    if _convert_mode == 'tree':
        return _list_to_tree(a)
    if _convert_mode == 'nested_linked':
        if any(isinstance(sub, list) for sub in a):
            return [_list_to_linked(sub) if isinstance(sub, list) else sub for sub in a]
        return _list_to_linked(a)
    if _convert_mode == 'nested_tree':
        if any(isinstance(sub, list) for sub in a):
            return [_list_to_tree(sub) if isinstance(sub, list) else sub for sub in a]
        return _list_to_tree(a)
    return a

def _convert_args(args):
    if _convert_mode == 'raw':
        return args
    return [_convert_one(a) for a in args]

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
    if class_name:
        expected = c.get("expected")
        t0 = time.time()
        try:
            operations = args[0]
            operation_args = args[1]
            if not isinstance(operations, list) or not isinstance(operation_args, list) or len(operations) != len(operation_args):
                raise ValueError("operation suite must contain equally-sized operation and argument arrays")
            instance = None
            results = []
            target_class = _user_ns[class_name]
            for operation, call_args in zip(operations, operation_args):
                if not isinstance(call_args, list):
                    call_args = [call_args]
                if operation == class_name:
                    if input_adapter == "design-binary-tree" and call_args and isinstance(call_args[0], list):
                        call_args = [_list_to_tree(call_args[0]), *call_args[1:]]
                    elif input_adapter == "design-iterator" and call_args and isinstance(call_args[0], list):
                        call_args = [Iterator(call_args[0]), *call_args[1:]]
                    instance = target_class(*call_args)
                    results.append(None)
                else:
                    if instance is None:
                        raise ValueError("constructor operation must run first")
                    results.append(getattr(instance, operation)(*call_args))
            actual_norm = norm(results)
            elapsed_ms = int((time.time() - t0) * 1000)
            ok = validate_design_results(operations, operation_args, results, expected)
            if ok:
                passed += 1
            print(json.dumps({"i": i, "ok": ok, "actual": actual_norm, "elapsedMs": elapsed_ms, "error": None}))
        except Exception as e:
            elapsed_ms = int((time.time() - t0) * 1000)
            print(json.dumps({"i": i, "ok": False, "actual": None, "elapsedMs": elapsed_ms,
                              "error": str(e) + "\\n" + traceback.format_exc()[-1500:]}))
        continue
    adapter_nodes = None
    if input_adapter == "linked-list-cycle":
        if len(args) != 2 or not isinstance(args[0], list) or not isinstance(args[1], int):
            print(json.dumps({"i": i, "ok": False, "actual": None, "elapsedMs": 0,
                              "error": "cycle input must be [values, position]"}))
            continue
        head, adapter_nodes = _list_to_cycle(args[0], args[1])
        args = [head]
    elif input_adapter == "binary-tree-node-refs":
        if len(args) < 2 or not isinstance(args[0], list):
            print(json.dumps({"i": i, "ok": False, "actual": None, "elapsedMs": 0,
                              "error": "tree-node reference input must be [tree, value, ...]"}))
            continue
        root = _list_to_tree(args[0])
        referenced_nodes = [_find_tree_node(root, value) for value in args[1:]]
        if any(node is None for node in referenced_nodes):
            print(json.dumps({"i": i, "ok": False, "actual": None, "elapsedMs": 0,
                              "error": "tree-node reference value was not found in the tree"}))
            continue
        args = [root, *referenced_nodes]
    else:
        args = _convert_args(args)
    expected = c.get("expected")
    original_args = copy.deepcopy(args)
    inst = Solution()
    method = getattr(inst, method_name, None)
    if method is None:
        print(json.dumps({"i": i, "ok": False, "actual": None, "elapsedMs": 0,
                          "error": "Solution has no method '" + method_name + "'"}))
        continue
    t0 = time.time()
    try:
        actual = method(*args)
        if result_adapter == "linked-list-node-index":
            actual = adapter_nodes.index(actual) if actual in adapter_nodes else -1
        elif result_adapter == "tree-node-value":
            actual = actual.val if _is_tree_node(actual) else None
        elif isinstance(result_from_arg, int) and 0 <= result_from_arg < len(args):
            actual = args[result_from_arg]
        elapsed_ms = int((time.time() - t0) * 1000)
    except Exception as e:
        elapsed_ms = int((time.time() - t0) * 1000)
        print(json.dumps({"i": i, "ok": False, "actual": None, "elapsedMs": elapsed_ms,
                          "error": str(e) + "\\n" + traceback.format_exc()[-1500:]}))
        continue
    actual_norm = norm(actual)
    ok = validate_semantic(actual, args, original_args, expected) if validator else answers_equal(actual_norm, expected)
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
