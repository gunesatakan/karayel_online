export const RESOURCE_EXTRACTION_DURATION_MS = 5000;

export function advanceResourceExtraction(
  remainingMs: number | undefined,
  deltaMs: number,
  durationMs = RESOURCE_EXTRACTION_DURATION_MS
) {
  const nextRemainingMs = Math.max(0, (remainingMs ?? durationMs) - Math.max(0, deltaMs));
  return {
    remainingMs: nextRemainingMs,
    completed: nextRemainingMs === 0
  };
}
