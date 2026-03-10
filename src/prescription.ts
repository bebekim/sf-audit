/**
 * Prescription layer — "Where you could be with NanoClaw"
 *
 * Takes baseline results + scores and maps the org's reality
 * to a purpose-built alternative. Personalised to their actual use case.
 */
import {
  BaselineResults,
  AuditScore,
  Prescription,
  Capability,
  CapabilityStatus,
  MigrationEstimate,
} from './types.js';

// Pattern matching for org type detection
const ORG_TYPE_PATTERNS: Record<string, string[]> = {
  inventory_redistribution: [
    'item', 'inventory', 'stock', 'warehouse', 'safety', 'inspection',
    'check', 'distribution', 'redistribution', 'goods', 'donation_item',
  ],
  referral_services: [
    'referral', 'intake', 'case', 'client', 'service', 'assessment',
    'placement', 'provider', 'agency',
  ],
  membership: [
    'member', 'membership', 'subscription', 'renewal', 'tier',
    'benefit', 'dues',
  ],
  program_delivery: [
    'program', 'participant', 'session', 'attendance', 'outcome',
    'enrolment', 'curriculum', 'class',
  ],
  grant_management: [
    'grant', 'proposal', 'application', 'milestone', 'deliverable',
    'funder', 'reporting',
  ],
};

function detectOrgType(
  customObjects: Array<{ name: string; label: string }>,
  customObjectCounts: Record<string, number>,
  standardCounts: Record<string, number>,
): { type: string; confidence: number } {
  const customRecordTotal = Object.values(customObjectCounts).reduce(
    (a, b) => a + b,
    0,
  );
  const standardRecordTotal = Object.values(standardCounts).reduce(
    (a, b) => a + b,
    0,
  );

  // Check each pattern
  const scores: Record<string, number> = {};
  for (const [type, keywords] of Object.entries(ORG_TYPE_PATTERNS)) {
    let matchScore = 0;
    for (const obj of customObjects) {
      const lower = obj.name.toLowerCase() + ' ' + obj.label.toLowerCase();
      for (const kw of keywords) {
        if (lower.includes(kw)) {
          matchScore += customObjectCounts[obj.name] > 0 ? 2 : 1;
        }
      }
    }
    scores[type] = matchScore;
  }

  const bestType = Object.entries(scores).sort(
    ([, a], [, b]) => b - a,
  )[0];

  if (bestType && bestType[1] > 0) {
    const confidence = Math.min(bestType[1] / 6, 1);
    return { type: bestType[0], confidence };
  }

  // Default: if custom objects dominate, it's "custom_operations"
  if (customRecordTotal > standardRecordTotal) {
    return { type: 'custom_operations', confidence: 0.4 };
  }

  return { type: 'donor_management', confidence: 0.5 };
}

function assessCapability(
  name: string,
  isUsed: boolean,
  isWorking: boolean,
  alternative: string,
): Capability {
  let currentStatus: CapabilityStatus;
  let currentEvidence: string;

  if (!isUsed) {
    currentStatus = 'missing';
    currentEvidence = 'Not currently used in Salesforce';
  } else if (isWorking) {
    currentStatus = 'working';
    currentEvidence = 'Active and functioning';
  } else {
    currentStatus = 'struggling';
    currentEvidence = 'In use but underperforming or fragmented';
  }

  return {
    name,
    currentStatus,
    currentEvidence,
    nanoclawAlternative: alternative,
  };
}

function estimateMigration(
  results: BaselineResults,
): MigrationEstimate[] {
  const estimates: MigrationEstimate[] = [];

  if (!results.orientation) return estimates;

  // Standard objects
  for (const [name, count] of Object.entries(
    results.orientation.standardObjectCounts,
  )) {
    if (count > 0) {
      estimates.push({
        objectName: name,
        recordCount: count,
        complexity: count > 10000 ? 'high' : count > 1000 ? 'medium' : 'low',
        notes: `Standard object — straightforward CSV export`,
      });
    }
  }

  // Custom objects with records
  for (const [name, count] of Object.entries(
    results.orientation.customObjectCounts,
  )) {
    if (count > 0) {
      estimates.push({
        objectName: name,
        recordCount: count,
        complexity: 'medium', // Custom objects need schema mapping
        notes: 'Custom object — requires schema mapping to new data model',
      });
    }
  }

  return estimates;
}

function estimateCurrentCost(results: BaselineResults): number {
  if (!results.orientation) return 0;

  let cost = 0;

  // User licenses: assume mix of free (Power of Us) and paid
  const users = results.orientation.totalUsers;
  if (users > 10) {
    cost += (users - 10) * 60; // $60/user/month for additional licenses
  }

  // Package costs (rough estimates)
  const packageCount = results.orientation.packages.length;
  cost += packageCount * 30; // Average $30/month per add-on

  // Implied admin time (conservative estimate)
  // If they have an active admin: ~5 hours/month * $50/hour
  if (results.adoption && !results.adoption.adminGone) {
    cost += 250;
  } else {
    // Admin is gone but system still needs maintenance
    // Volunteer/ad-hoc support: ~2 hours/month * $50/hour
    cost += 100;
  }

  // Custom objects = implementation investment that needs ongoing maintenance
  const customObjectCount = results.orientation.customObjects.length;
  if (customObjectCount > 0) {
    cost += customObjectCount * 15; // ~$15/month per custom object in maintenance burden
  }

  return Math.max(cost, 100); // Floor of $100 (even "free" Salesforce has hidden costs)
}

export function prescribe(
  results: BaselineResults,
  auditScore: AuditScore,
): Prescription {
  const o = results.orientation;

  // Detect org type
  const orgTypeResult = o
    ? detectOrgType(
        o.customObjects,
        o.customObjectCounts,
        o.standardObjectCounts,
      )
    : { type: 'unknown', confidence: 0 };

  const primaryOperation = orgTypeResult.type
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());

  // Assess capabilities
  const capabilities: Capability[] = [];

  capabilities.push(
    assessCapability(
      'Contact Management',
      (o?.totalContacts ?? 0) > 0,
      true,
      'Direct import — contacts transfer as-is to any CRM or database',
    ),
  );

  capabilities.push(
    assessCapability(
      'Donation Tracking',
      (results.fundraising?.totalDonations ?? 0) > 0,
      (results.fundraising?.npspFeaturesUsed ?? 0) >= 3,
      'Automated bank statement matching + receipt generation',
    ),
  );

  capabilities.push(
    assessCapability(
      'Email Communications',
      (results.relationship?.emailMessages6m ?? 0) > 0,
      (results.relationship?.emailMessages6m ?? 0) > 50,
      'AI-generated campaigns via Resend/Postmark at pennies per send',
    ),
  );

  capabilities.push(
    assessCapability(
      'Volunteer Management',
      results.volunteers !== null &&
        (results.volunteers?.activeVolunteers ?? 0) > 0,
      (results.volunteers?.volunteerUtilisationRate ?? 0) > 30,
      'Shift scheduler with WhatsApp reminders and self-service signup',
    ),
  );

  capabilities.push(
    assessCapability(
      'Reporting',
      (results.adoption?.reportUsage ?? 0) > 0,
      (results.adoption?.reportUsage ?? 0) > 20,
      'Real-time dashboards and natural language queries via agent',
    ),
  );

  // Cost estimates
  const currentCost = estimateCurrentCost(results);
  const nanoclawCost = 65; // Baseline appliance cost
  const annualSavings = Math.max(0, (currentCost - nanoclawCost) * 12);

  // Migration estimate
  const migrationObjects = estimateMigration(results);
  const totalRecords = migrationObjects.reduce(
    (sum, o) => sum + o.recordCount,
    0,
  );
  const highComplexity = migrationObjects.filter(
    (o) => o.complexity === 'high',
  ).length;
  const estimatedDays = Math.max(
    3,
    Math.ceil(migrationObjects.length * 1.5) + highComplexity * 3,
  );

  // Leave-behinds
  const leaveBehinds: string[] = [];
  if (results.customisation) {
    if (results.customisation.emptyCustomObjects > 0) {
      leaveBehinds.push(
        `${results.customisation.emptyCustomObjects} empty custom objects`,
      );
    }
  }
  if (results.fundraising) {
    const unused = results.fundraising.npspFeaturesTotal -
      results.fundraising.npspFeaturesUsed;
    if (unused > 0) {
      leaveBehinds.push(`${unused} unused NPSP features`);
    }
  }
  if (results.dataHealth) {
    const stale =
      results.dataHealth.totalContacts - results.dataHealth.contactsFresh12m;
    if (stale > 100) {
      leaveBehinds.push(
        `~${stale.toLocaleString()} stale contacts (untouched 12+ months)`,
      );
    }
  }

  return {
    orgType: orgTypeResult.type,
    orgTypeConfidence: orgTypeResult.confidence,
    primaryOperation,
    capabilities,
    estimatedCurrentMonthlyCost: currentCost,
    estimatedNanoclawMonthlyCost: nanoclawCost,
    estimatedAnnualSavings: annualSavings,
    migrationEstimate: {
      totalObjects: migrationObjects.length,
      totalRecords,
      estimatedWorkingDays: estimatedDays,
      objects: migrationObjects,
    },
    leaveBehinds,
  };
}
