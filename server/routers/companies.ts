import { z } from 'zod';
import { router, publicProcedure } from '../_core/trpc';
import { COMPANIES, type CompanyDef } from '../sync/constants';
import { countCompanyTags } from '../db';

function toRow(c: CompanyDef, count = 0) {
  return { slug: c.slug, nameEn: c.name, region: c.region, problemCount: count };
}

export const companiesRouter = router({
  all: publicProcedure.query(async () => {
    const counts = await countCompanyTags();
    const map = new Map(counts.map((c) => [c.companySlug, c.count]));
    return COMPANIES.map((c) => toRow(c, map.get(c.slug) ?? 0));
  }),
  getBySlug: publicProcedure
    .input(z.object({ slug: z.string() }))
    .query(async ({ input }) => {
      const c = COMPANIES.find((x) => x.slug === input.slug);
      if (!c) return null;
      const counts = await countCompanyTags();
      return toRow(c, counts.find((x) => x.companySlug === input.slug)?.count ?? 0);
    }),
});
