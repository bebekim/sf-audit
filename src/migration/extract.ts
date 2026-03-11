/**
 * Phase 4a: Extract records from Salesforce via batched SOQL.
 *
 * Follows insertion order (Level 0 first). Handles pagination
 * for large objects. Writes raw JSON per object.
 */
import fs from 'node:fs';
import path from 'node:path';
import { SalesforceClient } from '../audit/client.js';
import { QueryError, SFQueryResult } from '../audit/types.js';
import { runQuery } from '../audit/query-helper.js';
import { MigrationPlan, ObjectMapping, ExtractionResult } from './types.js';

const BATCH_SIZE = 2000;

/**
 * Build a SOQL SELECT for all mapped fields, with optional filter.
 */
function buildQuery(mapping: ObjectMapping): string {
  const fields = mapping.fields.map((f) => f.sfField);
  // Always include Id for remapping
  if (!fields.includes('Id')) fields.unshift('Id');

  let soql = `SELECT ${fields.join(', ')} FROM ${mapping.sfObject}`;
  if (mapping.filter) {
    soql += ` WHERE ${mapping.filter}`;
  }
  return soql;
}

/**
 * Fetch all records for a query, handling pagination.
 */
async function fetchAllRecords(
  client: SalesforceClient,
  soql: string,
  objectName: string,
  errors: QueryError[],
): Promise<Record<string, unknown>[] | null> {
  const allRecords: Record<string, unknown>[] = [];

  const firstResult = await runQuery(
    client,
    `M-EXT-${objectName}`,
    'migration-extract',
    soql,
    errors,
  );
  if (!firstResult) return null;

  allRecords.push(...firstResult.records);

  // Handle pagination via queryMore
  let result: SFQueryResult = firstResult;
  let page = 1;
  while (!result.done) {
    page++;
    const nextResult = await runQuery(
      client,
      `M-EXT-${objectName}-P${page}`,
      'migration-extract',
      soql + ` LIMIT ${BATCH_SIZE} OFFSET ${allRecords.length}`,
      errors,
    );
    if (!nextResult) break;
    allRecords.push(...nextResult.records);
    result = nextResult;
  }

  return allRecords;
}

/**
 * Extract all records from Salesforce following the migration plan.
 * Writes JSON files per object to outputDir.
 */
export async function extract(
  client: SalesforceClient,
  plan: MigrationPlan,
  outputDir: string,
  errors: QueryError[],
): Promise<ExtractionResult[]> {
  fs.mkdirSync(outputDir, { recursive: true });

  const results: ExtractionResult[] = [];
  const activeMappings = plan.objectMappings.filter(
    (m) => m.mappingType !== 'skip',
  );

  // Process in insertion order
  const orderedMappings: ObjectMapping[] = [];
  for (const level of plan.insertionOrder) {
    for (const objectName of level) {
      const mapping = activeMappings.find((m) => m.sfObject === objectName);
      if (mapping) orderedMappings.push(mapping);
    }
  }

  // Include any active mappings not in insertion order
  for (const mapping of activeMappings) {
    if (!orderedMappings.includes(mapping)) {
      orderedMappings.push(mapping);
    }
  }

  for (const mapping of orderedMappings) {
    const soql = buildQuery(mapping);
    const records = await fetchAllRecords(
      client,
      soql,
      mapping.sfObject,
      errors,
    );

    if (records === null) {
      results.push({
        object: mapping.sfObject,
        recordCount: 0,
        filePath: '',
        paginationCalls: 0,
      });
      continue;
    }

    const filePath = path.join(outputDir, `${mapping.sfObject}.json`);
    fs.writeFileSync(filePath, JSON.stringify(records, null, 2));

    const paginationCalls = Math.ceil(records.length / BATCH_SIZE);
    results.push({
      object: mapping.sfObject,
      recordCount: records.length,
      filePath,
      paginationCalls: Math.max(1, paginationCalls),
    });
  }

  return results;
}
