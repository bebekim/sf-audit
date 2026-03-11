/**
 * Phase 1: Schema discovery — deterministic, no agent needed.
 *
 * Describes all objects with records, builds the relationship DAG,
 * classifies relationships, and produces the insertion order.
 */
import { SalesforceClient, runQuery, countFrom, type QueryError } from '../audit/index.js';
import { buildGraph, detectCircularDependencies } from './graph.js';
import {
  DiscoveryResult,
  ObjectDiscovery,
  ObjectRelationship,
  FieldDiscovery,
} from './types.js';

/** Objects that are metadata/infrastructure, not user data. */
const SKIP_SUFFIXES = ['__History', '__Tag', '__mdt', '__Settings__c'];
const SKIP_LABELS = ['DEPRECATED'];
const SKIP_PREFIXES = [
  'npsp__Trigger_Handler__c',
  'npsp__Error__c',
  'npsp__Schedulable__c',
  'npsp__GetStartedCompletionChecklistState__c',
  'npsp__Custom_Column_Header__c',
];

/** Known NanoClaw table mappings for standard/NPSP objects. */
const KNOWN_MAPPINGS = new Set([
  'Contact',
  'Account',
  'Opportunity',
  'Campaign',
  'CampaignMember',
  'npe5__Affiliation__c',
  'npe4__Relationship__c',
  'npe03__Recurring_Donation__c',
  'Task',
  'Event',
  'Note',
  'ContentDocument',
]);

function shouldSkipObject(name: string, label: string): boolean {
  if (SKIP_SUFFIXES.some((s) => name.includes(s))) return true;
  if (SKIP_LABELS.some((l) => label.includes(l))) return true;
  if (SKIP_PREFIXES.includes(name)) return true;
  return false;
}

/**
 * Run full schema discovery against a Salesforce org.
 */
export async function discover(
  client: SalesforceClient,
  errors: QueryError[],
): Promise<DiscoveryResult | null> {
  // Step 1: Get all objects
  let globalDescribe;
  try {
    globalDescribe = await client.describeGlobal();
  } catch (err) {
    errors.push({
      queryId: 'M-DISC-01',
      category: 'migration-discovery',
      error: err instanceof Error ? err.message : String(err),
      timestamp: new Date().toISOString(),
    });
    return null;
  }

  const queryableObjects = globalDescribe.sobjects.filter((o) => o.queryable);
  const candidates = queryableObjects.filter(
    (o) => !shouldSkipObject(o.name, o.label),
  );

  // Step 2: Count records for each candidate
  const objectsWithRecords: Array<{
    name: string;
    label: string;
    custom: boolean;
    recordCount: number;
  }> = [];

  for (const obj of candidates) {
    const result = await runQuery(
      client,
      `M-DISC-COUNT-${obj.name}`,
      'migration-discovery',
      `SELECT COUNT(Id) FROM ${obj.name}`,
      errors,
    );
    const count = countFrom(result);
    if (count !== null && count > 0) {
      objectsWithRecords.push({
        name: obj.name,
        label: obj.label,
        custom: obj.custom,
        recordCount: count,
      });
    }
  }

  // Step 3: Describe each object with records
  const objects: ObjectDiscovery[] = [];

  for (const obj of objectsWithRecords) {
    let describe;
    try {
      describe = await client.describeObject(obj.name);
    } catch (err) {
      errors.push({
        queryId: `M-DISC-DESC-${obj.name}`,
        category: 'migration-discovery',
        error: err instanceof Error ? err.message : String(err),
        timestamp: new Date().toISOString(),
      });
      continue;
    }

    const fields: FieldDiscovery[] = describe.fields.map((f) => ({
      name: f.name,
      label: f.label,
      type: f.type,
      custom: f.custom,
      nillable: f.nillable,
      referenceTo: f.referenceTo ?? [],
      picklistValues: (f.picklistValues ?? [])
        .filter((p) => p.active)
        .map((p) => p.value),
    }));

    const relationships: ObjectRelationship[] = describe.fields
      .filter((f) => f.type === 'reference' && f.referenceTo?.length)
      .map((f) => ({
        field: f.name,
        referenceTo: f.referenceTo![0], // primary reference target
        required: !f.nillable,
      }));

    objects.push({
      name: obj.name,
      label: describe.label,
      custom: obj.custom,
      recordCount: obj.recordCount,
      fields,
      relationships,
    });
  }

  // Step 4: Build graph and sort
  const graph = buildGraph(objects);
  const circularDependencies = detectCircularDependencies(
    graph.nodes,
    graph.edges,
  );

  // Step 5: Identify unmapped objects
  const unmappedObjects = objects
    .filter((o) => o.custom && !KNOWN_MAPPINGS.has(o.name))
    .map((o) => o.name);

  return {
    timestamp: new Date().toISOString(),
    objects,
    graph,
    insertionOrder: graph.levels,
    circularDependencies,
    unmappedObjects,
  };
}
