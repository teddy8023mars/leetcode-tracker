import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { SolvePanel } from '@/components/SolvePanel';
import { LangProvider } from '@/contexts/LangContext';
import { ThemeProvider } from '@/contexts/ThemeContext';
import { trpc } from '@/lib/trpc';

vi.mock('@monaco-editor/react', () => ({
  default: ({ value, onChange }: { value: string; onChange: (value: string) => void }) => (
    <textarea aria-label="Code editor" value={value} onChange={(event) => onChange(event.target.value)} />
  ),
}));

vi.mock('@/lib/trpc', () => ({
  trpc: {
    auth: { me: { useQuery: vi.fn() } },
    problems: { solutions: { useQuery: vi.fn() } },
    judge: {
      runExamples: { useMutation: vi.fn() },
      run: { useMutation: vi.fn() },
      runSql: { useMutation: vi.fn() },
      listSubmissions: { useQuery: vi.fn() },
      getSubmission: { useQuery: vi.fn() },
    },
    useUtils: vi.fn(),
  },
}));

const runExamplesMutate = vi.fn();
const submitMutate = vi.fn();

function mutation(data: unknown = undefined) {
  return { mutate: vi.fn(), data, isPending: false, isError: false, error: null };
}

function renderPanel() {
  return render(
    <ThemeProvider>
      <LangProvider>
        <SolvePanel
          problemId={704}
          titleSlug="binary-search"
          category="algorithms"
          exampleTestcases={'[-1,0,3,5,9,12]\n9'}
          codeSnippets={[{
            lang: 'Python3',
            langSlug: 'python3',
            code: 'class Solution:\n    def search(self, nums, target):\n        return 4',
          }]}
        />
      </LangProvider>
    </ThemeProvider>,
  );
}

describe('SolvePanel run and submit actions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.localStorage.clear();
    (trpc.auth.me.useQuery as unknown as ReturnType<typeof vi.fn>).mockReturnValue({ data: { id: 1 } });
    (trpc.problems.solutions.useQuery as unknown as ReturnType<typeof vi.fn>).mockReturnValue({ data: [] });
    (trpc.judge.runExamples.useMutation as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
      ...mutation(), mutate: runExamplesMutate,
    });
    (trpc.judge.run.useMutation as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
      ...mutation(), mutate: submitMutate,
    });
    (trpc.judge.runSql.useMutation as unknown as ReturnType<typeof vi.fn>).mockReturnValue(mutation());
    (trpc.judge.listSubmissions.useQuery as unknown as ReturnType<typeof vi.fn>).mockReturnValue({ data: [], isLoading: false });
    (trpc.judge.getSubmission.useQuery as unknown as ReturnType<typeof vi.fn>).mockReturnValue({ data: null, isLoading: false });
    (trpc.useUtils as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
      judge: { listSubmissions: { invalidate: vi.fn() } },
      progress: { invalidate: vi.fn() },
    });
  });

  afterEach(cleanup);

  it('offers separate Run and Submit buttons that call different actions', async () => {
    renderPanel();

    await userEvent.click(screen.getByRole('button', { name: /^Run/ }));
    expect(runExamplesMutate).toHaveBeenCalledWith({
      problemId: 704,
      language: 'python',
      code: expect.stringContaining('def search'),
    });
    expect(submitMutate).not.toHaveBeenCalled();

    await userEvent.click(screen.getByRole('button', { name: /^Submit/ }));
    expect(submitMutate).toHaveBeenCalledWith({
      problemId: 704,
      language: 'python',
      code: expect.stringContaining('def search'),
    });
  });

  it('uses Command+Enter to run and Command+Shift+Enter to submit', () => {
    renderPanel();

    fireEvent.keyDown(window, { key: 'Enter', metaKey: true });
    expect(runExamplesMutate).toHaveBeenCalledOnce();
    expect(submitMutate).not.toHaveBeenCalled();

    fireEvent.keyDown(window, { key: 'Enter', metaKey: true, shiftKey: true });
    expect(submitMutate).toHaveBeenCalledOnce();
  });

  it('shows print output for the active example case', () => {
    (trpc.judge.runExamples.useMutation as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
      ...mutation({
        mode: 'run',
        verdict: 'accepted',
        passedCount: 1,
        totalCount: 1,
        runtimeMs: 2,
        cases: [{
          i: 0,
          ok: true,
          input: [[-1, 0, 3, 5, 9, 12], 9],
          expected: 4,
          actual: 4,
          error: null,
          stdout: 'nums = [-1, 0, 3, 5, 9, 12]\n',
        }],
        firstFail: null,
        stderr: '',
        compileStderr: null,
      }),
      mutate: runExamplesMutate,
    });

    renderPanel();

    expect(screen.getByText('Input')).toBeInTheDocument();
    expect(screen.getByText('Expected')).toBeInTheDocument();
    expect(screen.getByText('✅ Actual')).toBeInTheDocument();
    expect(screen.getByText('Debug output')).toBeInTheDocument();
    expect(screen.getByText('nums = [-1, 0, 3, 5, 9, 12]')).toBeInTheDocument();
  });

  it('keeps the first failing input and expectation visible for full submissions', async () => {
    (trpc.judge.run.useMutation as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
      ...mutation({
        verdict: 'wrong_answer',
        passedCount: 0,
        totalCount: 2,
        runtimeMs: 2,
        cases: [{ i: 0, ok: false, actual: null, error: null }],
        firstFail: {
          i: 0,
          input: [[-1, 0, 3, 5, 9, 12], 9],
          expected: 4,
          actual: null,
        },
        stderr: '',
        compileStderr: null,
      }),
      mutate: submitMutate,
    });

    renderPanel();
    await userEvent.click(screen.getByRole('button', { name: /^Submit/ }));

    expect(screen.getAllByText('Input').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Expected').length).toBeGreaterThan(0);
    expect(screen.getByText('4')).toBeInTheDocument();
  });
});
