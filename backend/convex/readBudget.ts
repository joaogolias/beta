import { getDocumentSize, type Value } from 'convex/values';
import { fail } from './alphabetDomain';

// Leave headroom for indexes, ownership lookups, stats and one last document.
export const PAGE_READ_BYTES = 2 * 1024 * 1024;
export const LIBRARY_READ_BYTES = 6 * 1024 * 1024;
export const SESSION_READ_BYTES = 6 * 1024 * 1024;
// Faces include examples as text as well as structured facts; allow one complete
// maximum-size card while bounding the sum stored by a single session mutation.
export const SESSION_SNAPSHOT_BYTES = 650_000;

export class ReadBudget {
  private remaining: number;
  constructor(
    bytes: number,
    private readonly error: string,
  ) {
    this.remaining = bytes;
  }
  consume(document: Record<string, Value>) {
    this.remaining -= getDocumentSize(document);
    if (this.remaining < 0) fail('VALIDATION', this.error);
  }
}

/** Bound reads before another document is fetched; never return a partial set. */
export async function readWithinBudget<T extends Record<string, Value>>(
  query: AsyncIterable<T>,
  limit: number,
  budget: ReadBudget,
): Promise<T[]> {
  const rows: T[] = [];
  for await (const row of query) {
    budget.consume(row);
    rows.push(row);
    if (rows.length >= limit) break;
  }
  return rows;
}
