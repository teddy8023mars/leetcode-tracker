import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../sync/aiGeneration', () => ({
  generateAiSolution: vi.fn().mockResolvedValue({
    id: 1,
    problemId: 1,
    language: 'en',
    approachMarkdown: '#',
    complexityMarkdown: 'O(1)',
    pythonCode: '',
    javaCode: '',
    cppCode: '',
    pitfallsMarkdown: null,
    generatedAt: new Date(),
    modelVersion: 'test',
  }),
}));

import { taskAiPregenerate } from '../sync/aiPregenerate';
import * as db from '../db';
import { generateAiSolution } from '../sync/aiGeneration';

describe('sync/taskAiPregenerate', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.mocked(generateAiSolution).mockResolvedValue({
      id: 1,
      problemId: 1,
      language: 'en',
      approachMarkdown: '#',
      complexityMarkdown: 'O(1)',
      pythonCode: '',
      javaCode: '',
      cppCode: '',
      pitfallsMarkdown: null,
      generatedAt: new Date(),
      modelVersion: 'test',
    });
  });

  it('returns zero counts when DB unavailable', async () => {
    vi.spyOn(db, 'getDb').mockResolvedValue(null);
    const result = await taskAiPregenerate();
    expect(result.itemsProcessed).toBe(0);
    expect(result.itemsSucceeded).toBe(0);
    expect(result.itemsFailed).toBe(0);
  });

  it('calls generateAiSolution for problems missing AI solutions', async () => {
    const mockDb = {
      execute: vi.fn().mockResolvedValue([{ id: 1 }]),
      update: vi.fn().mockReturnValue({ set: vi.fn().mockReturnValue({ where: vi.fn().mockReturnValue({ catch: vi.fn() }) }) }),
    };
    vi.spyOn(db, 'getDb').mockResolvedValue(mockDb as never);

    const result = await taskAiPregenerate();

    expect(generateAiSolution).toHaveBeenCalledWith(1, expect.any(String));
    expect(result.itemsSucceeded).toBeGreaterThan(0);
    expect(result.itemsFailed).toBe(0);
  });

  it('counts failures without throwing when generateAiSolution rejects', async () => {
    const mockDb = {
      execute: vi.fn().mockResolvedValue([{ id: 1 }]),
      update: vi.fn().mockReturnValue({ set: vi.fn().mockReturnValue({ where: vi.fn().mockReturnValue({ catch: vi.fn() }) }) }),
    };
    vi.spyOn(db, 'getDb').mockResolvedValue(mockDb as never);
    vi.mocked(generateAiSolution).mockRejectedValue(new Error('LLM timeout'));

    const result = await taskAiPregenerate();

    expect(result.itemsFailed).toBeGreaterThan(0);
    expect(result.itemsSucceeded).toBe(0);
  });
});
