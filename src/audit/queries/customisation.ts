/**
 * Customisation queries — "Frankenstein Config" detection.
 *
 * Discovers: custom object bloat, empty objects, field counts,
 * automation complexity, stale workflows.
 */
import { SalesforceClient } from '../client.js';
import { runQuery, runToolingQuery, countFrom } from '../query-helper.js';
import {
  CustomisationResults,
  CustomObjectDetail,
  QueryError,
} from '../types.js';

export async function runCustomisationQueries(
  client: SalesforceClient,
  errors: QueryError[],
  customObjects: Array<{ name: string; label: string }>,
  customObjectCounts: Record<string, number>,
): Promise<CustomisationResults | null> {
  // Build details for each custom object
  const customObjectDetails: CustomObjectDetail[] = [];
  let totalCustomFields = 0;
  let maxCustomFieldsOnObject: { objectName: string; count: number } | null =
    null;

  for (const obj of customObjects) {
    let customFieldCount = 0;
    try {
      const describe = await client.describeObject(obj.name);
      customFieldCount = describe.fields.filter((f) => f.custom).length;
    } catch (err) {
      errors.push({
        queryId: `Q-CUS-01-${obj.name}`,
        category: 'customisation',
        error: err instanceof Error ? err.message : String(err),
        timestamp: new Date().toISOString(),
      });
    }

    const detail: CustomObjectDetail = {
      name: obj.name,
      label: obj.label,
      recordCount: customObjectCounts[obj.name] ?? 0,
      customFieldCount,
    };
    customObjectDetails.push(detail);
    totalCustomFields += customFieldCount;

    if (
      !maxCustomFieldsOnObject ||
      customFieldCount > maxCustomFieldsOnObject.count
    ) {
      maxCustomFieldsOnObject = {
        objectName: obj.name,
        count: customFieldCount,
      };
    }
  }

  // Also count custom fields on standard objects
  for (const stdObj of ['Contact', 'Account', 'Opportunity']) {
    try {
      const describe = await client.describeObject(stdObj);
      const stdCustomCount = describe.fields.filter((f) => f.custom).length;
      totalCustomFields += stdCustomCount;
      if (
        !maxCustomFieldsOnObject ||
        stdCustomCount > maxCustomFieldsOnObject.count
      ) {
        maxCustomFieldsOnObject = {
          objectName: stdObj,
          count: stdCustomCount,
        };
      }
    } catch (err) {
      errors.push({
        queryId: `Q-CUS-01-${stdObj}`,
        category: 'customisation',
        error: err instanceof Error ? err.message : String(err),
        timestamp: new Date().toISOString(),
      });
    }
  }

  const emptyCustomObjects = customObjectDetails.filter(
    (d) => d.recordCount === 0,
  ).length;

  // Q-CUS-02: Active flows
  const flowResult = await runToolingQuery(
    client,
    'Q-CUS-02',
    'customisation',
    `SELECT COUNT(Id) FROM Flow WHERE Status = 'Active'`,
    errors,
  );
  const activeFlows = countFrom(flowResult) ?? 0;

  // Q-CUS-03: Validation rules
  const validationResult = await runToolingQuery(
    client,
    'Q-CUS-03',
    'customisation',
    'SELECT COUNT(Id) FROM ValidationRule WHERE Active = true',
    errors,
  );
  const activeValidationRules = countFrom(validationResult) ?? 0;

  // Q-CUS-04: Workflow rules
  // WorkflowRule doesn't have 'Active' field — query all and count
  const workflowResult = await runToolingQuery(
    client,
    'Q-CUS-04',
    'customisation',
    'SELECT COUNT(Id) FROM WorkflowRule',
    errors,
  );
  const activeWorkflowRules = countFrom(workflowResult) ?? 0;

  // Q-CUS-05: Stale automations (not modified in 12 months)
  const staleFlowResult = await runToolingQuery(
    client,
    'Q-CUS-05',
    'customisation',
    `SELECT COUNT(Id) FROM Flow
     WHERE Status = 'Active' AND LastModifiedDate < LAST_N_MONTHS:12`,
    errors,
  );
  const staleAutomations = countFrom(staleFlowResult) ?? 0;

  return {
    customObjectDetails,
    emptyCustomObjects,
    totalCustomFields,
    maxCustomFieldsOnObject,
    activeFlows,
    activeValidationRules,
    activeWorkflowRules,
    staleAutomations,
  };
}
