import { describe, expect, it, vi } from "vitest";
import type { Request, Response } from "express";

import { appRouter } from "../routers";
import * as repository from "../roadmaps/repository";
import { roadmapsRouter } from "../routers/roadmaps";

const callerContext = {
  user: null,
  req: {} as Request,
  res: {} as Response,
};

describe("routers/roadmaps", () => {
  it("loads one roadmap batch and projects it for the local user", async () => {
    vi.spyOn(repository, "loadRoadmapProblemStates").mockResolvedValue([
      {
        id: 7,
        frontendId: 704,
        titleSlug: "binary-search",
        titleEn: "Binary Search",
        titleZh: "二分查找",
        difficulty: "Easy",
        status: "done",
      },
    ]);
    const caller = roadmapsRouter.createCaller(callerContext);

    const result = await caller.getBySlug({ slug: "code-thinking" });

    expect(result.slug).toBe("code-thinking");
    expect(result.sections[0].items[1]).toMatchObject({
      frontendId: 704,
      mapping: "mapped",
      localProblem: { status: "done" },
    });
    expect(repository.loadRoadmapProblemStates).toHaveBeenCalledWith(
      expect.arrayContaining([704]),
      1
    );
  });

  it("rejects an unknown roadmap slug", async () => {
    const caller = roadmapsRouter.createCaller(callerContext);

    await expect(caller.getBySlug({ slug: "unknown" })).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
  });

  it("registers roadmaps on the application router", () => {
    const caller = appRouter.createCaller(callerContext);

    expect(caller.roadmaps).toBeDefined();
  });
});
