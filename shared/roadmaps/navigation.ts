export function flattenRoadmapNodes<T>(roadmap: {
  sections: ReadonlyArray<{ items: ReadonlyArray<T> }>;
}): T[] {
  return roadmap.sections.flatMap(section => section.items);
}
