/**
 * doocs/leetcode database solutions interleave Pandas and MySQL tabs:
 *   #### Python3        (or #### Pandas)
 *   ```python ... ```
 *   #### MySQL
 *   ```sql ... ```
 * For SQL problems we drop the Python variants entirely.
 */
export function stripPythonSolutions(markdown: string): string {
  return (
    markdown
      // Header + its python fence
      .replace(/####\s*(?:Python3?|Pandas)\s*\r?\n+```python[^\n]*\n[\s\S]*?```[ \t]*\r?\n?/gi, '')
      // Any leftover bare python fences
      .replace(/```python[^\n]*\n[\s\S]*?```[ \t]*\r?\n?/gi, '')
      // Collapse the blank runs left behind
      .replace(/\n{3,}/g, '\n\n')
      .trim()
  );
}
