import { z } from 'zod';
import { router, publicProcedure } from '../_core/trpc';
import { getAllProblemLists, getProblemListBySlug, countListItems } from '../db';

export const listsRouter = router({
  all: publicProcedure.query(async () => {
    const rows = await getAllProblemLists();
    const counts = await countListItems();
    const map = new Map(counts.map((c) => [c.listId, c.count]));
    return rows.map((r) => ({ ...r, problemCount: map.get(r.id) ?? 0 }));
  }),
  getBySlug: publicProcedure
    .input(z.object({ slug: z.string() }))
    .query(async ({ input }) => {
      const meta = await getProblemListBySlug(input.slug);
      if (!meta) return null;
      const counts = await countListItems();
      const cnt = counts.find((c) => c.listId === meta.id)?.count ?? 0;
      return { ...meta, problemCount: cnt };
    }),
});
