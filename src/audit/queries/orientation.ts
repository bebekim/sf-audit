/**
 * Orientation queries — "Where am I?"
 *
 * Discovers: objects, packages, limits, users, record volumes.
 * Runs first because everything else depends on what's found here.
 */
import { SalesforceClient } from '../client.js';
import {
  runQuery,
  runToolingQuery,
  countFrom,
  recordsFrom,
} from '../query-helper.js';
import { OrientationResults, QueryError, SFPackage } from '../types.js';

export async function runOrientationQueries(
  client: SalesforceClient,
  errors: QueryError[],
): Promise<OrientationResults | null> {
  // Q-ORI-01: Global describe — all objects
  let globalDescribe;
  try {
    globalDescribe = await client.describeGlobal();
  } catch (err) {
    errors.push({
      queryId: 'Q-ORI-01',
      category: 'orientation',
      error: err instanceof Error ? err.message : String(err),
      timestamp: new Date().toISOString(),
    });
    return null; // Can't proceed without object inventory
  }

  const allObjects = globalDescribe.sobjects.filter((o) => o.queryable);
  const customObjects = allObjects
    .filter((o) => {
      if (!o.custom) return false;
      // Filter out non-data objects
      if (o.name.includes('__History')) return false;
      if (o.name.includes('__Tag')) return false;
      if (o.name.endsWith('__mdt')) return false;       // Custom Metadata Types (COUNT(Id) unsupported)
      if (o.name.endsWith('__Settings__c')) return false; // Config singletons, not data
      if (o.label.includes('DEPRECATED')) return false;   // Deprecated objects
      // Filter out known NPSP infrastructure objects (not user data)
      const npspInfra = [
        'npsp__Trigger_Handler__c',
        'npsp__Error__c',
        'npsp__Schedulable__c',
        'npsp__GetStartedCompletionChecklistState__c',
        'npsp__Custom_Column_Header__c',
        'npsp__Relationship_Sync_Excluded_Fields__c',
        'npe4__Relationship_Auto_Create__c',
        'npe4__Relationship_Error__c',
        'npe4__Relationship_Lookup__c',
        'npe03__Custom_Field_Mapping__c',
        'npe03__Custom_Installment_Settings__c',
        'npo02__Opportunity_Rollup_Error__c',
        'npo02__User_Rollup_Field_Settings__c',
        'npe01__Payment_Field_Mapping_Settings__c',
      ];
      if (npspInfra.includes(o.name)) return false;
      return true;
    })
    .map((o) => ({ name: o.name, label: o.label }));

  // Q-ORI-02: Installed packages (via Tooling API)
  const packagesResult = await runToolingQuery(
    client,
    'Q-ORI-02',
    'orientation',
    'SELECT Id, SubscriberPackage.NamespacePrefix, SubscriberPackage.Name FROM InstalledSubscriberPackage',
    errors,
  );
  const packages: SFPackage[] = [];
  if (packagesResult) {
    for (const rec of packagesResult.records) {
      // Handle both flat and nested (SubscriberPackage.X) response shapes
      const sp = rec['SubscriberPackage'] as Record<string, unknown> | undefined;
      packages.push({
        NamespacePrefix: (sp?.['NamespacePrefix'] ?? rec['NamespacePrefix'] ?? null) as string | null,
        Name: (sp?.['Name'] ?? rec['Name'] ?? '') as string,
      });
    }
  }

  // Detect known packages
  const namespaces = new Set(
    packages.map((p) => p.NamespacePrefix).filter(Boolean),
  );
  let npspDetected = namespaces.has('npsp') || namespaces.has('npe01');
  let v4sDetected = namespaces.has('GW_Volunteers');
  const npcDetected = namespaces.has('sfdo_np');

  // Fallback NPSP detection via object names (also when package query returned no NPSP)
  if (!npspDetected) {
    const npspObjects = customObjects.filter(
      (o) =>
        o.name.startsWith('npsp__') ||
        o.name.startsWith('npe01__') ||
        o.name.startsWith('npe03__') ||
        o.name.startsWith('npe4__') ||
        o.name.startsWith('npe5__'),
    );
    npspDetected = npspObjects.length > 0;
  }
  if (!v4sDetected) {
    v4sDetected = customObjects.some((o) =>
      o.name.startsWith('GW_Volunteers__'),
    );
  }

  // Q-ORI-03: API limits
  let limits = null;
  let apiUsagePercent = null;
  let storageUsedPercent = null;
  try {
    limits = await client.getLimits();
    if (limits.DailyApiRequests) {
      const used =
        limits.DailyApiRequests.Max - limits.DailyApiRequests.Remaining;
      apiUsagePercent = (used / limits.DailyApiRequests.Max) * 100;
    }
    if (limits.DataStorageMB) {
      const used = limits.DataStorageMB.Max - limits.DataStorageMB.Remaining;
      storageUsedPercent = (used / limits.DataStorageMB.Max) * 100;
    }
  } catch (err) {
    errors.push({
      queryId: 'Q-ORI-03',
      category: 'orientation',
      error: err instanceof Error ? err.message : String(err),
      timestamp: new Date().toISOString(),
    });
  }

  // Q-ORI-04: User counts
  const totalUsersResult = await runQuery(
    client,
    'Q-ORI-04a',
    'orientation',
    'SELECT COUNT(Id) FROM User WHERE IsActive = true',
    errors,
  );
  const activeUsersResult = await runQuery(
    client,
    'Q-ORI-04b',
    'orientation',
    'SELECT COUNT(Id) FROM User WHERE IsActive = true AND LastLoginDate > LAST_N_MONTHS:3',
    errors,
  );
  const totalUsers = countFrom(totalUsersResult) ?? 0;
  const activeUsers = countFrom(activeUsersResult) ?? 0;

  // Q-ORI-05: Standard object record counts
  const contactCountResult = await runQuery(
    client,
    'Q-ORI-05a',
    'orientation',
    'SELECT COUNT(Id) FROM Contact',
    errors,
  );
  const accountCountResult = await runQuery(
    client,
    'Q-ORI-05b',
    'orientation',
    'SELECT COUNT(Id) FROM Account',
    errors,
  );
  const oppCountResult = await runQuery(
    client,
    'Q-ORI-05c',
    'orientation',
    'SELECT COUNT(Id) FROM Opportunity',
    errors,
  );
  const campaignCountResult = await runQuery(
    client,
    'Q-ORI-05d',
    'orientation',
    'SELECT COUNT(Id) FROM Campaign',
    errors,
  );
  const contentDocResult = await runQuery(
    client,
    'Q-ORI-05e',
    'orientation',
    'SELECT COUNT(Id) FROM ContentDocument',
    errors,
  );

  const standardObjectCounts: Record<string, number> = {
    Contact: countFrom(contactCountResult) ?? 0,
    Account: countFrom(accountCountResult) ?? 0,
    Opportunity: countFrom(oppCountResult) ?? 0,
    Campaign: countFrom(campaignCountResult) ?? 0,
    ContentDocument: countFrom(contentDocResult) ?? 0,
  };

  // Q-ORI-06: Custom object record counts
  const customObjectCounts: Record<string, number> = {};
  for (const obj of customObjects) {
    const result = await runQuery(
      client,
      `Q-ORI-06-${obj.name}`,
      'orientation',
      `SELECT COUNT(Id) FROM ${obj.name}`,
      errors,
    );
    customObjectCounts[obj.name] = countFrom(result) ?? 0;
  }

  // Q-ORI-07: Profile and permission set counts
  const profileResult = await runQuery(
    client,
    'Q-ORI-07a',
    'orientation',
    'SELECT COUNT(Id) FROM Profile',
    errors,
  );
  const permSetResult = await runQuery(
    client,
    'Q-ORI-07b',
    'orientation',
    'SELECT COUNT(Id) FROM PermissionSet WHERE IsOwnedByProfile = false',
    errors,
  );

  return {
    totalObjects: allObjects.length,
    customObjects,
    standardObjectCounts,
    customObjectCounts,
    packages,
    npspDetected,
    v4sDetected,
    npcDetected,
    totalUsers,
    activeUsers,
    totalContacts: standardObjectCounts.Contact,
    totalAccounts: standardObjectCounts.Account,
    limits,
    apiUsagePercent,
    storageUsedPercent,
    profileCount: countFrom(profileResult) ?? 0,
    permissionSetCount: countFrom(permSetResult) ?? 0,
    contentDocumentCount: standardObjectCounts.ContentDocument,
  };
}
