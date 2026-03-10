/**
 * Phase 4c: Load transformed records into PostgreSQL.
 *
 * Uses raw SQL via postgres.js (no Drizzle dependency in sf-audit).
 * The caller provides a connection string; we handle transactions,
 * two-pass insert, and audit logging.
 *
 * sf-audit stays database-agnostic at the library level — this module
 * only builds SQL strings and delegates execution to a provided
 * query function. The actual database driver lives in the caller
 * (nanoclaw-audit webapp or nc-crm CLI).
 */
import { TransformResult, LoadResult, MigrationExecutionResult } from './types.js';
import { IdMap } from './transform.js';

/**
 * Interface for the database adapter provided by the caller.
 * Keeps sf-audit free of any database driver dependency.
 */
export interface DatabaseAdapter {
  /** Execute a SQL query with parameters. Returns inserted row count. */
  execute(sql: string, params: unknown[]): Promise<number>;
  /** Begin a transaction. */
  begin(): Promise<void>;
  /** Commit the current transaction. */
  commit(): Promise<void>;
  /** Rollback the current transaction. */
  rollback(): Promise<void>;
  /** Log an audit entry. */
  audit(entry: {
    table: string;
    recordId: string;
    action: 'INSERT' | 'UPDATE';
    by: string;
  }): Promise<void>;
}

/**
 * Fields that are lookup remaps — need to be set in pass 2
 * when the referenced records may not exist yet.
 */
function isOptionalLookup(
  result: TransformResult,
  fieldName: string,
): boolean {
  // Any field ending in _id that's nullable is a candidate for pass 2
  return fieldName.endsWith('_id') && fieldName !== 'id';
}

/**
 * Insert records for one table, splitting into required (pass 1)
 * and optional relationship fields (pass 2).
 */
async function loadTable(
  db: DatabaseAdapter,
  result: TransformResult,
  performer: string,
): Promise<LoadResult> {
  const loadResult: LoadResult = {
    table: result.pgTable,
    inserted: 0,
    updated: 0,
    errors: [],
  };

  if (result.records.length === 0) return loadResult;

  // Identify required vs optional fields from first record
  const sampleRecord = result.records[0];
  const allFields = Object.keys(sampleRecord);
  const requiredFields = allFields.filter(
    (f) => !isOptionalLookup(result, f) || f === 'id',
  );
  const optionalLookupFields = allFields.filter(
    (f) => isOptionalLookup(result, f),
  );

  // Pass 1: Insert with required fields only
  for (const record of result.records) {
    const fields = requiredFields.filter((f) => record[f] !== null || f === 'id');
    const columns = fields.join(', ');
    const placeholders = fields.map((_, i) => `$${i + 1}`).join(', ');
    const values = fields.map((f) => record[f]);

    try {
      await db.execute(
        `INSERT INTO ${result.pgTable} (${columns}) VALUES (${placeholders})`,
        values,
      );
      await db.audit({
        table: result.pgTable,
        recordId: String(record['id']),
        action: 'INSERT',
        by: performer,
      });
      loadResult.inserted++;
    } catch (err) {
      loadResult.errors.push(
        `INSERT ${result.pgTable} ${record['id']}: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  // Pass 2: Update optional lookup fields
  if (optionalLookupFields.length > 0) {
    for (const record of result.records) {
      const updates: string[] = [];
      const values: unknown[] = [];
      let paramIdx = 1;

      for (const field of optionalLookupFields) {
        if (record[field] !== null && record[field] !== undefined) {
          updates.push(`${field} = $${paramIdx}`);
          values.push(record[field]);
          paramIdx++;
        }
      }

      if (updates.length === 0) continue;

      values.push(record['id']);
      try {
        await db.execute(
          `UPDATE ${result.pgTable} SET ${updates.join(', ')} WHERE id = $${paramIdx}`,
          values,
        );
        await db.audit({
          table: result.pgTable,
          recordId: String(record['id']),
          action: 'UPDATE',
          by: performer,
        });
        loadResult.updated++;
      } catch (err) {
        loadResult.errors.push(
          `UPDATE ${result.pgTable} ${record['id']}: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }
  }

  return loadResult;
}

/**
 * Load all transformed results into PostgreSQL.
 * Wraps everything in a transaction — all or nothing.
 */
export async function load(
  db: DatabaseAdapter,
  results: TransformResult[],
  idMap: IdMap,
  performer: string,
): Promise<MigrationExecutionResult> {
  const execution: MigrationExecutionResult = {
    timestamp: new Date().toISOString(),
    extraction: [],
    transforms: results,
    loads: [],
    totalRecordsMigrated: 0,
    idMappingCount: idMap.size,
    success: false,
    errors: [],
  };

  try {
    await db.begin();

    for (const result of results) {
      if (result.pgTable === '' || result.records.length === 0) continue;

      const loadResult = await loadTable(db, result, performer);
      execution.loads.push(loadResult);
      execution.totalRecordsMigrated += loadResult.inserted;

      if (loadResult.errors.length > 0) {
        execution.errors.push(...loadResult.errors);
      }
    }

    if (execution.errors.length > 0) {
      await db.rollback();
      execution.success = false;
    } else {
      await db.commit();
      execution.success = true;
    }
  } catch (err) {
    try {
      await db.rollback();
    } catch {
      // rollback failed — already in bad state
    }
    execution.success = false;
    execution.errors.push(
      `Transaction failed: ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  return execution;
}
