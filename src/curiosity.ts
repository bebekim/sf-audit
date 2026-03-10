/**
 * Curiosity engine — watches query outputs and generates follow-up questions.
 *
 * Not recursive. Observes each baseline result as it arrives,
 * generates questions that the agent can pursue in Phase 2.
 * Tracks understanding confidence across five areas until sufficient.
 */
import {
  CuriosityState,
  CuriosityQuestion,
  CuriosityObservation,
  UnderstandingModel,
  BaselineResults,
} from './types.js';

const DEFAULT_BUDGET = 30;

const SUFFICIENCY_THRESHOLDS = {
  identity: 0.6,
  adoption: 0.4,
  fit: 0.5,
  health: 0.3,
  dependency: 0.3,
};

export function createCuriosityState(budget = DEFAULT_BUDGET): CuriosityState {
  return {
    questions: [],
    observations: [],
    understanding: {
      identity: { description: 'Unknown organisation', confidence: 0 },
      adoption: { description: 'Unknown adoption level', confidence: 0 },
      fit: { description: 'Unknown CRM fit', confidence: 0 },
      health: { description: 'Unknown data health', confidence: 0 },
      dependency: { description: 'Unknown dependencies', confidence: 0 },
    },
    questionsAsked: 0,
    budget,
  };
}

function addQuestion(
  state: CuriosityState,
  question: Omit<CuriosityQuestion, 'id'>,
): void {
  const id = `CQ-${state.questions.length + 1}`;
  state.questions.push({ ...question, id });
}

function addObservation(
  state: CuriosityState,
  obs: Omit<CuriosityObservation, 'timestamp'>,
): void {
  state.observations.push({
    ...obs,
    timestamp: new Date().toISOString(),
  });
}

/**
 * Observe orientation results and generate follow-up questions.
 */
export function observeOrientation(
  state: CuriosityState,
  results: BaselineResults,
): void {
  const o = results.orientation;
  if (!o) return;

  // Custom objects with records deserve investigation
  for (const [name, count] of Object.entries(o.customObjectCounts)) {
    if (count > 100) {
      addQuestion(state, {
        query: name,
        queryType: 'describe',
        priority: 80,
        trigger: `${name} has ${count} records — what IS this object?`,
        category: 'identity',
      });
    }
  }

  // If custom objects have more records than standard, flag misfit
  const customTotal = Object.values(o.customObjectCounts).reduce(
    (a, b) => a + b,
    0,
  );
  const standardTotal = Object.values(o.standardObjectCounts).reduce(
    (a, b) => a + b,
    0,
  );

  if (customTotal > standardTotal) {
    addObservation(state, {
      questionId: null,
      section: 'orientation',
      observation: `Custom objects hold more records (${customTotal}) than standard objects (${standardTotal})`,
      inference:
        'Primary operations may be running on custom objects, not standard CRM',
    });
    state.understanding.identity.confidence = Math.min(
      state.understanding.identity.confidence + 0.2,
      1,
    );
    state.understanding.fit.confidence = Math.min(
      state.understanding.fit.confidence + 0.2,
      1,
    );
  }

  // Many packages = integration complexity
  if (o.packages.length > 5) {
    addObservation(state, {
      questionId: null,
      section: 'orientation',
      observation: `${o.packages.length} installed packages`,
      inference: 'High integration surface area',
    });
    state.understanding.dependency.confidence = Math.min(
      state.understanding.dependency.confidence + 0.3,
      1,
    );
  }

  // Storage usage check
  if (o.storageUsedPercent !== null && o.storageUsedPercent > 80) {
    addObservation(state, {
      questionId: null,
      section: 'orientation',
      observation: `Storage ${o.storageUsedPercent.toFixed(0)}% used`,
      inference: 'Approaching storage limits — cost pressure incoming',
    });
  }
}

/**
 * Observe adoption results.
 */
export function observeAdoption(
  state: CuriosityState,
  results: BaselineResults,
): void {
  const a = results.adoption;
  if (!a) return;

  if (a.creationConcentration > 60) {
    // One person is doing everything — who and what?
    if (a.topCreatorContact) {
      addQuestion(state, {
        query: `SELECT CreatedById, COUNT(Id) cnt FROM ${
          Object.keys(results.orientation?.customObjectCounts ?? {})
            .filter(
              (k) =>
                (results.orientation?.customObjectCounts[k] ?? 0) > 0,
            )
            .slice(0, 3)
            .join(', ') || 'Contact'
        } WHERE CreatedDate > LAST_N_MONTHS:6 GROUP BY CreatedById ORDER BY COUNT(Id) DESC LIMIT 5`,
        queryType: 'soql',
        priority: 70,
        trigger: `Top creator has ${a.creationConcentration.toFixed(0)}% concentration — what do they create?`,
        category: 'adoption',
      });
    }

    addObservation(state, {
      questionId: null,
      section: 'adoption',
      observation: `${a.creationConcentration.toFixed(0)}% creation concentration on one user`,
      inference: 'Single point of failure — system depends on one person',
    });
    state.understanding.adoption.confidence = Math.min(
      state.understanding.adoption.confidence + 0.3,
      1,
    );
  }

  if (a.adminGone) {
    addObservation(state, {
      questionId: null,
      section: 'adoption',
      observation: 'No admin setup changes in 6+ months',
      inference:
        'The person who built/maintains the system may have left',
    });
    state.understanding.adoption.confidence = Math.min(
      state.understanding.adoption.confidence + 0.2,
      1,
    );
  }
}

/**
 * Observe customisation results.
 */
export function observeCustomisation(
  state: CuriosityState,
  results: BaselineResults,
): void {
  const c = results.customisation;
  if (!c) return;

  // Investigate high-record custom objects further
  for (const detail of c.customObjectDetails) {
    if (detail.recordCount > 500 && detail.customFieldCount > 10) {
      addQuestion(state, {
        query: `SELECT COUNT(Id) FROM ${detail.name} WHERE CreatedDate > LAST_N_MONTHS:6`,
        queryType: 'soql',
        priority: 60,
        trigger: `${detail.name} has ${detail.recordCount} records and ${detail.customFieldCount} fields — is it actively growing?`,
        category: 'fit',
      });
    }
  }

  if (c.emptyCustomObjects > 3) {
    addObservation(state, {
      questionId: null,
      section: 'customisation',
      observation: `${c.emptyCustomObjects} custom objects with zero records`,
      inference: 'Abandoned build — someone built them but they were never adopted',
    });
  }

  if (c.staleAutomations > 3) {
    addObservation(state, {
      questionId: null,
      section: 'customisation',
      observation: `${c.staleAutomations} automations not modified in 12+ months`,
      inference: 'Technical debt — may be broken, nobody maintaining',
    });
  }

  state.understanding.fit.confidence = Math.min(
    state.understanding.fit.confidence + 0.2,
    1,
  );
}

/**
 * Observe data health results.
 */
export function observeDataHealth(
  state: CuriosityState,
  results: BaselineResults,
): void {
  const d = results.dataHealth;
  if (!d) return;

  if (d.neverModifiedRate > 50) {
    addObservation(state, {
      questionId: null,
      section: 'data-health',
      observation: `${d.neverModifiedRate.toFixed(0)}% of contacts never modified after creation`,
      inference: 'Data graveyard — contacts created and forgotten',
    });
  }

  if (d.opportunityBurstiness > 50) {
    addObservation(state, {
      questionId: null,
      section: 'data-health',
      observation: 'Donation entry is bursty — batch dumps on specific days',
      inference: 'CRM is not system of record — data entered from elsewhere',
    });
  }

  state.understanding.health.confidence = Math.min(
    state.understanding.health.confidence + 0.3,
    1,
  );
}

/**
 * Check if understanding is sufficient to stop exploring.
 */
export function isSufficient(state: CuriosityState): boolean {
  const u = state.understanding;
  return (
    u.identity.confidence >= SUFFICIENCY_THRESHOLDS.identity &&
    u.adoption.confidence >= SUFFICIENCY_THRESHOLDS.adoption &&
    u.fit.confidence >= SUFFICIENCY_THRESHOLDS.fit &&
    u.health.confidence >= SUFFICIENCY_THRESHOLDS.health &&
    u.dependency.confidence >= SUFFICIENCY_THRESHOLDS.dependency
  );
}

/**
 * Get the next question to pursue (highest priority first).
 */
export function nextQuestion(
  state: CuriosityState,
): CuriosityQuestion | null {
  if (state.questionsAsked >= state.budget) return null;
  if (state.questions.length === 0) return null;

  // Sort by priority descending, take the first
  state.questions.sort((a, b) => b.priority - a.priority);
  const question = state.questions.shift()!;
  state.questionsAsked++;
  return question;
}

/**
 * Record the result of pursuing a question.
 */
export function recordAnswer(
  state: CuriosityState,
  questionId: string,
  observation: string,
  inference: string,
  confidenceUpdates: Partial<Record<keyof UnderstandingModel, number>>,
): void {
  addObservation(state, {
    questionId,
    section: 'curiosity',
    observation,
    inference,
  });

  for (const [area, delta] of Object.entries(confidenceUpdates)) {
    const key = area as keyof UnderstandingModel;
    state.understanding[key].confidence = Math.min(
      state.understanding[key].confidence + delta,
      1,
    );
  }
}
