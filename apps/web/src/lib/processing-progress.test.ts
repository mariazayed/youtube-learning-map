import { describe, expect, it } from 'vitest';
import { activeProcessingStage } from './processing-progress';

describe('activeProcessingStage', () => {
  it.each([
    [-1, 0],
    [0, 0],
    [24, 0],
    [25, 1],
    [69, 1],
    [70, 2],
    [85, 3],
    [95, 4],
    [100, 4],
    [200, 4],
  ])('maps backend progress %s to stage %s', (progress, stage) => {
    expect(activeProcessingStage(progress)).toBe(stage);
  });
});
