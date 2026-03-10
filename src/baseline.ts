/**
 * Baseline orchestrator — runs all query modules with adaptive behaviour.
 *
 * Watches its own error rate. Aborts early on catastrophic failure.
 * Falls back to alternative detection methods when primary ones fail.
 */
import { SalesforceClient } from './client.js';
import { runOrientationQueries } from './queries/orientation.js';
import { runAdoptionQueries } from './queries/adoption.js';
import { runRelationshipQueries } from './queries/relationship.js';
import { runDataHealthQueries } from './queries/data-health.js';
import { runFundraisingQueries } from './queries/fundraising.js';
import { runVolunteerQueries } from './queries/volunteers.js';
import { runCustomisationQueries } from './queries/customisation.js';
import { runIntegrationQueries } from './queries/integration.js';
import { BaselineResults, QueryError } from './types.js';

const ERROR_RATE_ABORT_THRESHOLD = 0.6;

function errorRate(errors: QueryError[], attempted: number): number {
  return attempted > 0 ? errors.length / attempted : 0;
}

export async function runBaseline(
  client: SalesforceClient,
): Promise<BaselineResults> {
  const errors: QueryError[] = [];
  const startErrors = 0;

  // --- Phase 1: Orientation (critical — everything depends on this) ---
  const orientation = await runOrientationQueries(client, errors);

  if (!orientation) {
    return {
      timestamp: new Date().toISOString(),
      apiVersion: 'v59.0',
      orientation: null,
      adoption: null,
      relationship: null,
      dataHealth: null,
      fundraising: null,
      volunteers: null,
      customisation: null,
      integration: null,
      errors,
      queriesAttempted: client.getRequestCount(),
      queriesSucceeded: client.getRequestCount() - errors.length,
      aborted: true,
      abortReason:
        'Orientation failed — cannot access basic org metadata. Check API permissions.',
    };
  }

  // Check if orientation had too many errors on critical fields
  const criticalFieldsMissing =
    (orientation.totalUsers === 0 ? 1 : 0) +
    (orientation.totalContacts === 0 && orientation.totalAccounts === 0
      ? 1
      : 0) +
    (orientation.totalObjects === 0 ? 1 : 0);

  if (criticalFieldsMissing >= 2) {
    return {
      timestamp: new Date().toISOString(),
      apiVersion: 'v59.0',
      orientation,
      adoption: null,
      relationship: null,
      dataHealth: null,
      fundraising: null,
      volunteers: null,
      customisation: null,
      integration: null,
      errors,
      queriesAttempted: client.getRequestCount(),
      queriesSucceeded: client.getRequestCount() - errors.length,
      aborted: true,
      abortReason:
        'Insufficient access — could not read user count, contacts, or object metadata.',
    };
  }

  // --- Phase 2: Run remaining sections, watching error rate ---

  const adoption = await runAdoptionQueries(
    client,
    errors,
    orientation.totalUsers,
  );
  if (errorRate(errors, client.getRequestCount()) > ERROR_RATE_ABORT_THRESHOLD) {
    return buildAbortedResult(
      orientation,
      adoption,
      null,
      null,
      null,
      null,
      null,
      null,
      errors,
      client,
      'Error rate exceeded 60% after adoption queries.',
    );
  }

  const relationship = await runRelationshipQueries(
    client,
    errors,
    orientation.totalContacts,
  );
  if (errorRate(errors, client.getRequestCount()) > ERROR_RATE_ABORT_THRESHOLD) {
    return buildAbortedResult(
      orientation,
      adoption,
      relationship,
      null,
      null,
      null,
      null,
      null,
      errors,
      client,
      'Error rate exceeded 60% after relationship queries.',
    );
  }

  const dataHealth = await runDataHealthQueries(
    client,
    errors,
    orientation.totalContacts,
  );

  const fundraising = await runFundraisingQueries(
    client,
    errors,
    orientation.npspDetected,
  );

  const volunteers = await runVolunteerQueries(
    client,
    errors,
    orientation.v4sDetected,
  );

  const customisation = await runCustomisationQueries(
    client,
    errors,
    orientation.customObjects,
    orientation.customObjectCounts,
  );

  const integration = await runIntegrationQueries(
    client,
    errors,
    orientation.packages,
  );

  return {
    timestamp: new Date().toISOString(),
    apiVersion: 'v59.0',
    orientation,
    adoption,
    relationship,
    dataHealth,
    fundraising,
    volunteers,
    customisation,
    integration,
    errors,
    queriesAttempted: client.getRequestCount(),
    queriesSucceeded: client.getRequestCount() - errors.length,
    aborted: false,
    abortReason: null,
  };
}

function buildAbortedResult(
  orientation: BaselineResults['orientation'],
  adoption: BaselineResults['adoption'],
  relationship: BaselineResults['relationship'],
  dataHealth: BaselineResults['dataHealth'],
  fundraising: BaselineResults['fundraising'],
  volunteers: BaselineResults['volunteers'],
  customisation: BaselineResults['customisation'],
  integration: BaselineResults['integration'],
  errors: QueryError[],
  client: SalesforceClient,
  reason: string,
): BaselineResults {
  return {
    timestamp: new Date().toISOString(),
    apiVersion: 'v59.0',
    orientation,
    adoption,
    relationship,
    dataHealth,
    fundraising,
    volunteers,
    customisation,
    integration,
    errors,
    queriesAttempted: client.getRequestCount(),
    queriesSucceeded: client.getRequestCount() - errors.length,
    aborted: true,
    abortReason: reason,
  };
}
