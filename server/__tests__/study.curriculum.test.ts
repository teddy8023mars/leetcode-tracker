import { describe, expect, it } from 'vitest';

import { CURRICULUM, CurriculumDaySchema, getCurriculumDay } from '../study/curriculum';

describe('daily study curriculum', () => {
  it('contains 60 sequential and valid learning days', () => {
    expect(CURRICULUM).toHaveLength(60);
    CURRICULUM.forEach((day, index) => {
      expect(CurriculumDaySchema.parse(day).index).toBe(index);
      expect(day.hints).toHaveLength(3);
      expect(new Set(day.hints).size).toBe(3);
    });
    expect(new Set(CURRICULUM.map((day) => day.key)).size).toBe(60);
  });

  it('includes one system design exercise in every week', () => {
    for (let week = 0; week < 12; week += 1) {
      const days = CURRICULUM.slice(week * 5, week * 5 + 5);
      expect(days.filter((day) => day.career.type === 'system_design')).toHaveLength(1);
    }
  });

  it('wraps to a review cycle after day 60', () => {
    expect(getCurriculumDay(0).index).toBe(0);
    expect(getCurriculumDay(59).index).toBe(59);
    expect(getCurriculumDay(60).index).toBe(0);
  });
});
