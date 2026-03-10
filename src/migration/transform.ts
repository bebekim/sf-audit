/**
 * Phase 4b: Transform Salesforce records into NanoClaw format.
 *
 * Builds SF ID → PG UUID map. Applies field mappings, type coercion,
 * and relationship remapping. Does not touch the database.
 */
import { randomUUID } from 'node:crypto';
import {
  MigrationPlan,
  ObjectMapping,
  FieldMapping,
  IdMapping,
  TransformResult,
} from './types.js';

/**
 * Global ID mapping: SF 18-char ID → PG UUID.
 * Populated during transform, consumed during load.
 */
export class IdMap {
  private map = new Map<string, string>();

  /** Get or create a PG UUID for a Salesforce ID. */
  resolve(sfId: string, objectType: string): string {
    const existing = this.map.get(sfId);
    if (existing) return existing;
    const pgId = randomUUID();
    this.map.set(sfId, pgId);
    return pgId;
  }

  /** Look up an existing mapping. Returns undefined if not mapped. */
  lookup(sfId: string): string | undefined {
    return this.map.get(sfId);
  }

  /** Get all mappings for export. */
  entries(): IdMapping[] {
    return Array.from(this.map.entries()).map(([sfId, pgId]) => ({
      sfId,
      pgId,
      objectType: '', // filled at call site
    }));
  }

  get size(): number {
    return this.map.size;
  }
}

function transformValue(
  value: unknown,
  fieldMapping: FieldMapping,
  idMap: IdMap,
): unknown {
  if (value === null || value === undefined) return null;

  switch (fieldMapping.transform) {
    case 'direct':
      return value;

    case 'lookup_remap': {
      const sfId = String(value);
      const pgId = idMap.lookup(sfId);
      if (!pgId) return null; // referenced record not yet mapped
      return pgId;
    }

    case 'date_convert': {
      // SF dates: "2024-01-15" or "2024-01-15T10:30:00.000+0000"
      const str = String(value);
      if (fieldMapping.pgType === 'date') {
        return str.slice(0, 10); // YYYY-MM-DD
      }
      return new Date(str).toISOString(); // timestamptz
    }

    case 'picklist_to_enum':
      return String(value).toLowerCase().trim();

    case 'currency_convert':
      return Number(value);

    case 'skip':
      return undefined; // signal to exclude this field
  }
}

/**
 * Transform a single object's records according to its mapping.
 */
function transformObject(
  records: Record<string, unknown>[],
  mapping: ObjectMapping,
  idMap: IdMap,
): TransformResult {
  const transformed: Record<string, unknown>[] = [];
  const skippedFields: string[] = [];
  const warnings: string[] = [];

  for (const record of records) {
    const sfId = record['Id'] as string;
    if (!sfId) {
      warnings.push(`Record missing Id in ${mapping.sfObject}`);
      continue;
    }

    const pgId = idMap.resolve(sfId, mapping.sfObject);
    const row: Record<string, unknown> = { id: pgId };

    for (const fieldMapping of mapping.fields) {
      const value = record[fieldMapping.sfField];
      const transformed = transformValue(value, fieldMapping, idMap);

      if (transformed === undefined) {
        if (!skippedFields.includes(fieldMapping.sfField)) {
          skippedFields.push(fieldMapping.sfField);
        }
        continue;
      }

      row[fieldMapping.pgField] = transformed;
    }

    transformed.push(row);
  }

  return {
    object: mapping.sfObject,
    pgTable: mapping.pgTable,
    records: transformed,
    idMappings: records
      .filter((r) => r['Id'])
      .map((r) => ({
        sfId: r['Id'] as string,
        pgId: idMap.lookup(r['Id'] as string) ?? '',
        objectType: mapping.sfObject,
      })),
    skippedFields,
    warnings,
  };
}

/**
 * Transform all extracted records according to the migration plan.
 *
 * @param extractedData Map of SF object name → raw records
 * @param plan The migration plan with field mappings
 * @returns Transformed results + shared ID map
 */
export function transform(
  extractedData: Map<string, Record<string, unknown>[]>,
  plan: MigrationPlan,
): { results: TransformResult[]; idMap: IdMap } {
  const idMap = new IdMap();
  const results: TransformResult[] = [];

  const activeMappings = plan.objectMappings.filter(
    (m) => m.mappingType !== 'skip',
  );

  // Process in insertion order so parent IDs exist before children reference them
  for (const level of plan.insertionOrder) {
    for (const objectName of level) {
      const mapping = activeMappings.find((m) => m.sfObject === objectName);
      if (!mapping) continue;

      const records = extractedData.get(objectName);
      if (!records || records.length === 0) continue;

      results.push(transformObject(records, mapping, idMap));
    }
  }

  // Process any remaining objects not in insertion order
  for (const mapping of activeMappings) {
    if (results.some((r) => r.object === mapping.sfObject)) continue;

    const records = extractedData.get(mapping.sfObject);
    if (!records || records.length === 0) continue;

    results.push(transformObject(records, mapping, idMap));
  }

  return { results, idMap };
}
