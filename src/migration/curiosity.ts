/**
 * Phase 2: Migration-specific curiosity engine.
 *
 * Observes discovery results and generates targeted questions about
 * data quality, schema mapping, and migration feasibility.
 * Follows the same pattern as the audit curiosity engine but with
 * different understanding areas and thresholds.
 */
import {
  MigrationCuriosityState,
  MigrationCuriosityQuestion,
  MigrationCuriosityObservation,
  MigrationUnderstandingModel,
  DiscoveryResult,
} from './types.js';

const DEFAULT_BUDGET = 20;

const SUFFICIENCY_THRESHOLDS: Record<keyof MigrationUnderstandingModel, number> = {
  schema: 0.6,
  quality: 0.5,
  mapping: 0.6,
  relationships: 0.5,
  volume: 0.3,
};

export function createMigrationCuriosityState(
  budget = DEFAULT_BUDGET,
): MigrationCuriosityState {
  return {
    questions: [],
    observations: [],
    understanding: {
      schema: { description: 'Unknown schema structure', confidence: 0 },
      quality: { description: 'Unknown data quality', confidence: 0 },
      mapping: { description: 'Unknown field mappings', confidence: 0 },
      relationships: { description: 'Unknown relationship state', confidence: 0 },
      volume: { description: 'Unknown data volume', confidence: 0 },
    },
    questionsAsked: 0,
    budget,
  };
}

function addQuestion(
  state: MigrationCuriosityState,
  question: Omit<MigrationCuriosityQuestion, 'id'>,
): void {
  const id = `MQ-${state.questions.length + 1}`;
  state.questions.push({ ...question, id });
}

function addObservation(
  state: MigrationCuriosityState,
  obs: Omit<MigrationCuriosityObservation, 'timestamp'>,
): void {
  state.observations.push({
    ...obs,
    timestamp: new Date().toISOString(),
  });
}

/**
 * Observe discovery results and generate migration-specific questions.
 */
export function observeDiscovery(
  state: MigrationCuriosityState,
  discovery: DiscoveryResult,
): void {
  const totalRecords = discovery.objects.reduce((s, o) => s + o.recordCount, 0);

  // Volume observations
  addObservation(state, {
    questionId: null,
    area: 'volume',
    observation: `${discovery.objects.length} objects with ${totalRecords} total records`,
    inference: totalRecords > 50000
      ? 'Large migration — will need batching and progress tracking'
      : 'Manageable migration volume',
  });
  state.understanding.volume.confidence = Math.min(
    state.understanding.volume.confidence + 0.4,
    1,
  );

  // Custom objects with >100 records — what IS this?
  for (const obj of discovery.objects) {
    if (obj.custom && obj.recordCount > 100) {
      addQuestion(state, {
        query: obj.name,
        queryType: 'describe',
        priority: 80,
        trigger: `${obj.name} has ${obj.recordCount} records — need to understand what it is to map it`,
        area: 'schema',
      });
    }
  }

  // Lookup fields with many distinct targets
  for (const obj of discovery.objects) {
    for (const field of obj.fields) {
      if (field.referenceTo.length > 1) {
        addQuestion(state, {
          query: `SELECT ${field.name}, COUNT(Id) FROM ${obj.name} GROUP BY ${field.name} LIMIT 20`,
          queryType: 'soql',
          priority: 70,
          trigger: `${obj.name}.${field.name} is polymorphic (references ${field.referenceTo.join(', ')})`,
          area: 'relationships',
        });
      }
    }
  }

  // NPSP Relationships object — check data quality
  const relObj = discovery.objects.find(
    (o) => o.name === 'npe4__Relationship__c',
  );
  if (relObj) {
    addQuestion(state, {
      query: `SELECT npe4__Type__c, COUNT(Id) FROM npe4__Relationship__c GROUP BY npe4__Type__c ORDER BY COUNT(Id) DESC LIMIT 20`,
      queryType: 'soql',
      priority: 90,
      trigger: `npe4__Relationship__c exists with ${relObj.recordCount} records — what types are in use?`,
      area: 'quality',
    });
    state.understanding.relationships.confidence += 0.2;
  }

  // Picklist fields with many values — misspellings?
  for (const obj of discovery.objects) {
    for (const field of obj.fields) {
      if (field.picklistValues.length > 20) {
        addQuestion(state, {
          query: `SELECT ${field.name}, COUNT(Id) FROM ${obj.name} GROUP BY ${field.name} ORDER BY COUNT(Id) DESC LIMIT 30`,
          queryType: 'soql',
          priority: 60,
          trigger: `${obj.name}.${field.name} has ${field.picklistValues.length} picklist values — check for duplicates`,
          area: 'quality',
        });
      }
    }
  }

  // Fields with high null rate (>50% null)
  for (const obj of discovery.objects) {
    const nullableFields = obj.fields.filter(
      (f) => f.nillable && f.type !== 'reference' && !f.name.startsWith('System'),
    );
    if (nullableFields.length > obj.fields.length * 0.7) {
      addObservation(state, {
        questionId: null,
        area: 'quality',
        observation: `${obj.name}: ${nullableFields.length}/${obj.fields.length} fields are nullable`,
        inference: 'Sparse data — many fields may be unused',
      });
    }
  }

  // Large objects — do we need all records?
  for (const obj of discovery.objects) {
    if (obj.recordCount > 10000) {
      addQuestion(state, {
        query: `SELECT COUNT(Id) FROM ${obj.name} WHERE CreatedDate > LAST_N_YEARS:2`,
        queryType: 'soql',
        priority: 50,
        trigger: `${obj.name} has ${obj.recordCount} records — can we filter by recency?`,
        area: 'volume',
      });
    }
  }

  // Circular dependencies
  if (discovery.circularDependencies.length > 0) {
    addObservation(state, {
      questionId: null,
      area: 'relationships',
      observation: `Circular required dependencies detected: ${discovery.circularDependencies.map((c) => c.join(' → ')).join('; ')}`,
      inference: 'Migration blocked unless these are broken into two passes',
    });
  }

  // Update schema confidence based on known vs unknown objects
  const knownRatio = 1 - discovery.unmappedObjects.length / Math.max(discovery.objects.length, 1);
  state.understanding.schema.confidence = Math.min(
    state.understanding.schema.confidence + knownRatio * 0.4,
    1,
  );
  state.understanding.mapping.confidence = Math.min(
    state.understanding.mapping.confidence + knownRatio * 0.3,
    1,
  );
}

/**
 * Check if understanding is sufficient to proceed to planning.
 */
export function isMigrationSufficient(state: MigrationCuriosityState): boolean {
  const u = state.understanding;
  return (
    u.schema.confidence >= SUFFICIENCY_THRESHOLDS.schema &&
    u.quality.confidence >= SUFFICIENCY_THRESHOLDS.quality &&
    u.mapping.confidence >= SUFFICIENCY_THRESHOLDS.mapping &&
    u.relationships.confidence >= SUFFICIENCY_THRESHOLDS.relationships &&
    u.volume.confidence >= SUFFICIENCY_THRESHOLDS.volume
  );
}

/**
 * Get the next question to pursue (highest priority first).
 */
export function nextMigrationQuestion(
  state: MigrationCuriosityState,
): MigrationCuriosityQuestion | null {
  if (state.questionsAsked >= state.budget) return null;
  if (state.questions.length === 0) return null;

  state.questions.sort((a, b) => b.priority - a.priority);
  const question = state.questions.shift()!;
  state.questionsAsked++;
  return question;
}

/**
 * Record the result of pursuing a question.
 */
export function recordMigrationAnswer(
  state: MigrationCuriosityState,
  questionId: string,
  observation: string,
  inference: string,
  confidenceUpdates: Partial<Record<keyof MigrationUnderstandingModel, number>>,
): void {
  addObservation(state, {
    questionId,
    area: 'curiosity',
    observation,
    inference,
  });

  for (const [area, delta] of Object.entries(confidenceUpdates)) {
    const key = area as keyof MigrationUnderstandingModel;
    state.understanding[key].confidence = Math.min(
      state.understanding[key].confidence + delta,
      1,
    );
  }
}
