export const PROCESSING_STAGES = [
  { minimum: 0, key: 'validating' },
  { minimum: 25, key: 'reading' },
  { minimum: 70, key: 'identifying' },
  { minimum: 85, key: 'building' },
  { minimum: 95, key: 'finalizing' },
] as const;

export function activeProcessingStage(progress: number): number {
  const bounded = Math.min(100, Math.max(0, progress));
  let active = 0;
  PROCESSING_STAGES.forEach((stage, index) => {
    if (bounded >= stage.minimum) active = index;
  });
  return active;
}
