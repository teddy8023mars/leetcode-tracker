export type SM2Input = {
  quality: number;
  repetition: number;
  interval: number;
  easinessFactor: number;
};

export type SM2Output = {
  interval: number;
  repetition: number;
  easinessFactor: number;
};

export function sm2(input: SM2Input): SM2Output {
  const { quality, repetition, interval, easinessFactor } = input;

  let newEF = easinessFactor + (0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02));
  if (newEF < 1.3) newEF = 1.3;

  if (quality < 3) {
    return { interval: 1, repetition: 0, easinessFactor: newEF };
  }

  let newInterval: number;
  if (repetition === 0) {
    newInterval = 1;
  } else if (repetition === 1) {
    newInterval = 3;
  } else {
    newInterval = Math.round(interval * easinessFactor);
  }

  return {
    interval: newInterval,
    repetition: repetition + 1,
    easinessFactor: newEF,
  };
}
