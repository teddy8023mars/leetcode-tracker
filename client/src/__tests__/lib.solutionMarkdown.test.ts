import { describe, it, expect } from 'vitest';
import { stripPythonSolutions } from '@/lib/solutionMarkdown';

const DOCS_STYLE = `### 方法一：左连接

说明文字。

<!-- tabs:start -->

#### Python3

\`\`\`python
import pandas as pd
def f(): ...
\`\`\`

#### MySQL

\`\`\`sql
SELECT 1;
\`\`\`

<!-- tabs:end -->`;

describe('lib/solutionMarkdown stripPythonSolutions', () => {
  it('removes the Python tab (header + fence) and keeps the SQL solution', () => {
    const out = stripPythonSolutions(DOCS_STYLE);
    expect(out).not.toContain('```python');
    expect(out).not.toContain('Python3');
    expect(out).not.toContain('pandas');
    expect(out).toContain('```sql');
    expect(out).toContain('SELECT 1;');
    expect(out).toContain('### 方法一：左连接');
  });

  it('removes a Pandas-labelled tab too', () => {
    const md = '#### Pandas\n\n```python\nx = 1\n```\n\n#### MySQL\n\n```sql\nSELECT 2;\n```';
    const out = stripPythonSolutions(md);
    expect(out).not.toContain('x = 1');
    expect(out).toContain('SELECT 2;');
  });

  it('removes an unlabelled python fence but never touches sql fences', () => {
    const md = 'intro\n\n```python\ny = 2\n```\n\n```sql\nSELECT 3;\n```';
    const out = stripPythonSolutions(md);
    expect(out).not.toContain('y = 2');
    expect(out).toContain('SELECT 3;');
    expect(out).toContain('intro');
  });

  it('returns markdown unchanged when there is no python', () => {
    const md = '### 方法一\n\n```sql\nSELECT 4;\n```';
    expect(stripPythonSolutions(md)).toBe(md);
  });
});
