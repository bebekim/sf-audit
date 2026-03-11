/**
 * Integration queries — "Integration Spaghetti" detection.
 *
 * Discovers: connected apps, installed packages, package categories.
 */
import { SalesforceClient } from '../client.js';
import { runToolingQuery, recordsFrom } from '../query-helper.js';
import { IntegrationResults, SFPackage, QueryError } from '../types.js';

const PACKAGE_CATEGORIES: Record<string, string[]> = {
  crm: ['npsp', 'npe01', 'npe03', 'npe4', 'npe5', 'sfdo_np'],
  email: ['et4ae5', 'pardot', 'pi', 'mc4sf'],
  forms: ['formassembly', 'fa', 'formstack', 'jotform'],
  volunteer: ['GW_Volunteers', 'v4s'],
  reporting: ['apsona', 'conga', 'dashboardrefresh'],
};

function categorisePackage(ns: string | null): string {
  if (!ns) return 'other';
  const lower = ns.toLowerCase();
  for (const [category, prefixes] of Object.entries(PACKAGE_CATEGORIES)) {
    if (prefixes.some((p) => lower.startsWith(p.toLowerCase()))) {
      return category;
    }
  }
  return 'other';
}

export async function runIntegrationQueries(
  client: SalesforceClient,
  errors: QueryError[],
  packages: SFPackage[],
): Promise<IntegrationResults | null> {
  // Q-INT-01: Connected Apps
  const connectedAppsResult = await runToolingQuery(
    client,
    'Q-INT-01',
    'integration',
    'SELECT Name, Description FROM ConnectedApplication LIMIT 50',
    errors,
  );

  const connectedApps: Array<{ name: string; description: string | null }> =
    [];
  if (connectedAppsResult) {
    for (const r of connectedAppsResult.records) {
      connectedApps.push({
        name: String(r['Name'] ?? ''),
        description: r['Description'] ? String(r['Description']) : null,
      });
    }
  }

  // Categorise installed packages
  const packageCategories: IntegrationResults['packageCategories'] = {
    crm: [],
    email: [],
    forms: [],
    volunteer: [],
    reporting: [],
    other: [],
  };

  for (const pkg of packages) {
    const cat = categorisePackage(pkg.NamespacePrefix);
    const name = pkg.Name || pkg.NamespacePrefix || 'Unknown';
    packageCategories[cat as keyof typeof packageCategories].push(name);
  }

  const totalIntegrations = connectedApps.length + packages.length;

  return {
    connectedApps,
    installedPackages: packages,
    packageCategories,
    totalIntegrations,
  };
}
