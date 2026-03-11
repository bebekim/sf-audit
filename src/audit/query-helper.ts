/**
 * Query helper — wraps every SOQL call in try/catch.
 *
 * Returns null on failure (not throw). Logs errors to a shared array.
 * This enforces: null = couldn't check, zero = checked and found nothing.
 */
import { SalesforceClient } from './client.js';
import { SFQueryResult, QueryError } from './types.js';

export async function runQuery(
  client: SalesforceClient,
  queryId: string,
  category: string,
  soql: string,
  errors: QueryError[],
): Promise<SFQueryResult | null> {
  try {
    return await client.query(soql);
  } catch (err) {
    errors.push({
      queryId,
      category,
      error: err instanceof Error ? err.message : String(err),
      timestamp: new Date().toISOString(),
    });
    return null;
  }
}

export async function runToolingQuery(
  client: SalesforceClient,
  queryId: string,
  category: string,
  soql: string,
  errors: QueryError[],
): Promise<SFQueryResult | null> {
  try {
    return await client.toolingQuery(soql);
  } catch (err) {
    errors.push({
      queryId,
      category,
      error: err instanceof Error ? err.message : String(err),
      timestamp: new Date().toISOString(),
    });
    return null;
  }
}

/**
 * Extract a single numeric value from a COUNT() query result.
 */
export function countFrom(result: SFQueryResult | null): number | null {
  if (!result || result.records.length === 0) return null;
  const rec = result.records[0];
  // COUNT() results use expr0
  const val = rec['expr0'] ?? rec['cnt'] ?? rec['count'];
  if (val === undefined || val === null) return null;
  return Number(val);
}

/**
 * Extract records as typed array (best-effort cast).
 */
export function recordsFrom<T>(result: SFQueryResult | null): T[] {
  if (!result) return [];
  return result.records as unknown as T[];
}
