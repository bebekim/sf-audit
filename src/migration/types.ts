/**
 * Migration-specific type definitions.
 *
 * Covers all four phases: discovery, curiosity, planning, and execution.
 */

// ---------------------------------------------------------------------------
// Phase 1: Discovery
// ---------------------------------------------------------------------------

export interface ObjectRelationship {
  field: string;
  referenceTo: string;
  required: boolean; // MasterDetail or non-nillable Lookup
}

export interface ObjectDiscovery {
  name: string;
  label: string;
  custom: boolean;
  recordCount: number;
  fields: FieldDiscovery[];
  relationships: ObjectRelationship[];
}

export interface FieldDiscovery {
  name: string;
  label: string;
  type: string;
  custom: boolean;
  nillable: boolean;
  referenceTo: string[];
  picklistValues: string[];
}

export interface DependencyGraph {
  nodes: string[];
  edges: Array<{ from: string; to: string; required: boolean }>;
  levels: string[][]; // topological sort result
}

export interface DiscoveryResult {
  timestamp: string;
  objects: ObjectDiscovery[];
  graph: DependencyGraph;
  insertionOrder: string[][];
  circularDependencies: string[][];
  unmappedObjects: string[];
}

// ---------------------------------------------------------------------------
// Phase 2: Migration Curiosity
// ---------------------------------------------------------------------------

export interface MigrationUnderstandingModel {
  schema: { description: string; confidence: number };
  quality: { description: string; confidence: number };
  mapping: { description: string; confidence: number };
  relationships: { description: string; confidence: number };
  volume: { description: string; confidence: number };
}

export interface MigrationCuriosityQuestion {
  id: string;
  query: string;
  queryType: 'soql' | 'describe' | 'tooling';
  priority: number;
  trigger: string;
  area: keyof MigrationUnderstandingModel;
}

export interface MigrationCuriosityObservation {
  questionId: string | null;
  area: string;
  observation: string;
  inference: string;
  timestamp: string;
}

export interface MigrationCuriosityState {
  questions: MigrationCuriosityQuestion[];
  observations: MigrationCuriosityObservation[];
  understanding: MigrationUnderstandingModel;
  questionsAsked: number;
  budget: number;
}

// ---------------------------------------------------------------------------
// Phase 3: Migration Plan
// ---------------------------------------------------------------------------

export type TransformType =
  | 'direct'
  | 'lookup_remap'
  | 'picklist_to_enum'
  | 'date_convert'
  | 'currency_convert'
  | 'skip';

export type ObjectMappingType =
  | 'direct'
  | 'filtered'
  | 'custom_new_table'
  | 'custom_tags'
  | 'custom_jsonb'
  | 'skip';

export interface FieldMapping {
  sfField: string;
  sfType: string;
  pgField: string;
  pgType: string;
  transform: TransformType;
  nullable: boolean;
  notes: string;
}

export interface ObjectMapping {
  sfObject: string;
  pgTable: string;
  mappingType: ObjectMappingType;
  filter?: string; // e.g. "StageName = 'Closed Won'"
  fields: FieldMapping[];
  notes: string;
}

export interface MigrationPlan {
  timestamp: string;
  discoveryFile: string;
  objectMappings: ObjectMapping[];
  insertionOrder: string[][];
  estimatedRecords: number;
  warnings: string[];
}

// ---------------------------------------------------------------------------
// Phase 4: Execution
// ---------------------------------------------------------------------------

export interface ExtractionResult {
  object: string;
  recordCount: number;
  filePath: string;
  paginationCalls: number;
}

export interface IdMapping {
  sfId: string;
  pgId: string;
  objectType: string;
}

export interface TransformResult {
  object: string;
  pgTable: string;
  records: Record<string, unknown>[];
  idMappings: IdMapping[];
  skippedFields: string[];
  warnings: string[];
}

export interface LoadResult {
  table: string;
  inserted: number;
  updated: number; // pass 2 relationship updates
  errors: string[];
}

export interface MigrationExecutionResult {
  timestamp: string;
  extraction: ExtractionResult[];
  transforms: TransformResult[];
  loads: LoadResult[];
  totalRecordsMigrated: number;
  idMappingCount: number;
  success: boolean;
  errors: string[];
}
