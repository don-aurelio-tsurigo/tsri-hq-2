export const TRASH_RETENTION_DAYS = 30;
export const REJECTED_RETENTION_DAYS = 14;
/** Empty upload batches (aborted before metadata complete) stay this long. */
export const INCOMPLETE_BATCH_RETENTION_DAYS = 1;
export const TRASH_BATCH_MAX = 200;

const MS_PER_DAY = 24 * 60 * 60 * 1000;

export function trashDaysRemaining(deletedAt: Date, now = new Date()): number {
  const elapsed = Math.floor((now.getTime() - deletedAt.getTime()) / MS_PER_DAY);
  return Math.max(0, TRASH_RETENTION_DAYS - elapsed);
}

export function trashCutoffDate(now = new Date()): Date {
  return new Date(now.getTime() - TRASH_RETENTION_DAYS * MS_PER_DAY);
}

export function rejectedCutoffDate(now = new Date()): Date {
  return new Date(now.getTime() - REJECTED_RETENTION_DAYS * MS_PER_DAY);
}

export function incompleteBatchCutoffDate(now = new Date()): Date {
  return new Date(now.getTime() - INCOMPLETE_BATCH_RETENTION_DAYS * MS_PER_DAY);
}
