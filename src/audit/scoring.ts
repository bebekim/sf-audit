/**
 * Scoring engine — pure function: BaselineResults in, AuditScore out.
 *
 * Six category scorers, each producing 0-100.
 * Weights redistribute when a category returns null.
 */
import {
  BaselineResults,
  ValidationReport,
  AuditScore,
  CategoryScore,
  ScoreFinding,
  Verdict,
  Confidence,
} from './types.js';

// Default category weights (sum to 1.0)
const DEFAULT_WEIGHTS: Record<string, number> = {
  adoption: 0.2,
  relationship: 0.2,
  dataHealth: 0.15,
  fundraising: 0.15,
  customisation: 0.15,
  integration: 0.15,
};

function clamp(val: number, min = 0, max = 100): number {
  return Math.max(min, Math.min(max, val));
}

function verdictFromScore(score: number): Verdict {
  if (score >= 70) return 'KEEP';
  if (score >= 55) return 'OPTIMISE';
  if (score >= 35) return 'SIMPLIFY';
  return 'MIGRATE';
}

function confidenceFromResults(
  results: BaselineResults,
  validation: ValidationReport,
): Confidence {
  const successRate =
    results.queriesAttempted > 0
      ? results.queriesSucceeded / results.queriesAttempted
      : 0;

  if (
    results.aborted ||
    validation.recommendAbort ||
    successRate < 0.5 ||
    validation.invariantViolations >= 2
  ) {
    return 'LOW';
  }
  if (successRate < 0.8 || validation.plausibilityWarnings >= 3) {
    return 'MEDIUM';
  }
  return 'HIGH';
}

// --- Individual category scorers ---

function scoreAdoption(results: BaselineResults): CategoryScore | null {
  const a = results.adoption;
  if (!a) return null;

  const findings: ScoreFinding[] = [];
  let score = 0;

  // Adoption rate (0-40 points)
  score += clamp(a.adoptionRate * 0.4, 0, 40);
  if (a.adoptionRate < 30) {
    findings.push({
      category: 'adoption',
      severity: 'CRITICAL',
      message: `Only ${a.adoptionRate.toFixed(0)}% of licensed users are active.`,
      evidence: `${a.activeUserCount} active of ${a.totalLicensedUsers} licensed`,
    });
  }

  // Creation concentration (0-20 points, inverse)
  const concentrationScore = clamp(
    20 - (a.creationConcentration / 100) * 20,
    0,
    20,
  );
  score += concentrationScore;
  if (a.creationConcentration > 70) {
    findings.push({
      category: 'adoption',
      severity: 'WARNING',
      message: 'Single point of failure: one person creates most records.',
      evidence: `Top creator: ${a.creationConcentration.toFixed(0)}% of contact records`,
    });
  }

  // Report/dashboard usage (0-20 points)
  const reportScore =
    a.reportUsage > 50 ? 10 : a.reportUsage > 10 ? 5 : 0;
  const dashboardScore =
    a.dashboardUsage > 10 ? 10 : a.dashboardUsage > 3 ? 5 : 0;
  score += reportScore + dashboardScore;
  if (a.reportUsage === 0 && a.dashboardUsage === 0) {
    findings.push({
      category: 'adoption',
      severity: 'WARNING',
      message: 'No reports or dashboards used in 6 months.',
      evidence: 'Zero report views, zero dashboard references',
    });
  }

  // Admin health (0-20 points)
  if (!a.adminGone) {
    score += 20;
  } else {
    findings.push({
      category: 'adoption',
      severity: 'CRITICAL',
      message: 'Admin appears to be gone — no setup changes in 6+ months.',
      evidence: `Last setup change: ${a.lastSetupChange ?? 'never'}`,
    });
  }

  return {
    name: 'Adoption',
    score: clamp(score),
    weight: DEFAULT_WEIGHTS.adoption,
    findings,
  };
}

function scoreRelationship(results: BaselineResults): CategoryScore | null {
  const r = results.relationship;
  if (!r) return null;

  const findings: ScoreFinding[] = [];
  let score = 0;

  // Total interactions (0-30 points)
  if (r.totalInteractions6m > 500) score += 30;
  else if (r.totalInteractions6m > 100) score += 20;
  else if (r.totalInteractions6m > 10) score += 10;
  else {
    findings.push({
      category: 'relationship',
      severity: 'CRITICAL',
      message: 'Near-zero relationship activity. This is a database, not a CRM.',
      evidence: `${r.totalInteractions6m} total interactions in 6 months`,
    });
  }

  // Engagement rate (0-30 points)
  score += clamp(r.engagementRate * 0.3, 0, 30);
  if (r.engagementRate < 5) {
    findings.push({
      category: 'relationship',
      severity: 'CRITICAL',
      message: `Only ${r.engagementRate.toFixed(1)}% of contacts have any logged interaction.`,
      evidence: `${r.contactsWithTasks + r.contactsWithEvents} contacts with activity`,
    });
  }

  // Email usage (0-20 points)
  if (r.emailMessages6m > 100) score += 20;
  else if (r.emailMessages6m > 10) score += 10;
  else if (r.emailMessages6m === 0) {
    findings.push({
      category: 'relationship',
      severity: 'WARNING',
      message: 'No emails sent through Salesforce.',
      evidence: 'Email likely managed in separate tool',
    });
  }

  // Stewardship (0-20 points)
  score += clamp(r.stewardshipRate * 0.2, 0, 20);
  if (r.stewardshipRate < 10 && r.closedWonOpps12m > 0) {
    findings.push({
      category: 'relationship',
      severity: 'WARNING',
      message: `${(100 - r.stewardshipRate).toFixed(0)}% of donations have no follow-up logged.`,
      evidence: `${r.oppsWithFollowUp} follow-ups for ${r.closedWonOpps12m} donations`,
    });
  }

  return {
    name: 'Relationship Activity',
    score: clamp(score),
    weight: DEFAULT_WEIGHTS.relationship,
    findings,
  };
}

function scoreDataHealth(results: BaselineResults): CategoryScore | null {
  const d = results.dataHealth;
  if (!d) return null;

  const findings: ScoreFinding[] = [];
  let score = 0;

  // Freshness (0-30 points)
  score += clamp(d.freshnessRate6m * 0.3, 0, 30);
  if (d.freshnessRate6m < 10) {
    findings.push({
      category: 'data-health',
      severity: 'CRITICAL',
      message: `Only ${d.freshnessRate6m.toFixed(0)}% of contacts modified in last 6 months.`,
      evidence: `${d.contactsFresh6m} of ${d.totalContacts} contacts`,
    });
  }

  // Email completeness (0-20 points)
  score += clamp(d.emailCompletenessRate * 0.2, 0, 20);
  if (d.emailCompletenessRate < 50) {
    findings.push({
      category: 'data-health',
      severity: 'WARNING',
      message: `${(100 - d.emailCompletenessRate).toFixed(0)}% of contacts missing email addresses.`,
      evidence: `${d.contactsWithEmail} of ${d.totalContacts} have email`,
    });
  }

  // Low duplicate rate (0-20 points, inverse)
  const dupScore = clamp(20 - d.duplicateRate * 2, 0, 20);
  score += dupScore;
  if (d.duplicateRate > 5) {
    findings.push({
      category: 'data-health',
      severity: 'WARNING',
      message: `${d.duplicateEmails} duplicate email addresses detected.`,
      evidence: `${d.duplicateRate.toFixed(1)}% duplicate rate`,
    });
  }

  // Never-modified rate (0-15 points, inverse)
  const neverModScore = clamp(15 - (d.neverModifiedRate / 100) * 15, 0, 15);
  score += neverModScore;
  if (d.neverModifiedRate > 50) {
    findings.push({
      category: 'data-health',
      severity: 'CRITICAL',
      message: `${d.neverModifiedRate.toFixed(0)}% of contacts never modified after creation.`,
      evidence: `${d.contactsNeverModified} contacts are "create and forget"`,
    });
  }

  // Low burstiness (0-15 points, inverse)
  const burstScore = clamp(
    15 - (d.opportunityBurstiness / 100) * 15,
    0,
    15,
  );
  score += burstScore;
  if (d.opportunityBurstiness > 50) {
    findings.push({
      category: 'data-health',
      severity: 'WARNING',
      message: 'Data entry is bursty — donations entered in bulk batches.',
      evidence: `${d.burstyMonths} of ${d.totalMonthsChecked} months show batch entry pattern`,
    });
  }

  return {
    name: 'Data Health',
    score: clamp(score),
    weight: DEFAULT_WEIGHTS.dataHealth,
    findings,
  };
}

function scoreFundraising(results: BaselineResults): CategoryScore | null {
  const f = results.fundraising;
  if (!f) return null;

  const findings: ScoreFinding[] = [];
  let score = 0;

  // Donation volume (0-25 points)
  if (f.totalDonations > 500) score += 25;
  else if (f.totalDonations > 100) score += 15;
  else if (f.totalDonations > 10) score += 8;
  else {
    findings.push({
      category: 'fundraising',
      severity: 'WARNING',
      message: `Only ${f.totalDonations} closed-won donations recorded.`,
      evidence: `Total amount: $${f.totalDonationAmount.toLocaleString()}`,
    });
  }

  // Campaign usage (0-25 points)
  if (f.activeCampaigns > 5) score += 25;
  else if (f.activeCampaigns > 0) score += 15;
  else {
    findings.push({
      category: 'fundraising',
      severity: 'WARNING',
      message: 'No active campaigns.',
      evidence: `Campaign members added in 6m: ${f.campaignMembers6m}`,
    });
  }

  // Recurring donations (0-20 points)
  if (f.recurringDonationsActive > 20) score += 20;
  else if (f.recurringDonationsActive > 0) score += 10;
  else {
    findings.push({
      category: 'fundraising',
      severity: 'INFO',
      message: 'No active recurring donations.',
      evidence: 'Recurring giving not used',
    });
  }

  // NPSP feature utilisation (0-30 points)
  if (f.npspFeaturesTotal > 0) {
    const featureRate =
      (f.npspFeaturesUsed / f.npspFeaturesTotal) * 100;
    score += clamp(featureRate * 0.3, 0, 30);
    if (featureRate < 25) {
      findings.push({
        category: 'fundraising',
        severity: 'CRITICAL',
        message: `Using only ${f.npspFeaturesUsed} of ${f.npspFeaturesTotal} NPSP features (${featureRate.toFixed(0)}%).`,
        evidence: `Unused: ${Object.entries(f.npspFeatureUsage)
          .filter(([, used]) => !used)
          .map(([name]) => name)
          .join(', ')}`,
      });
    }
  }

  return {
    name: 'Fundraising',
    score: clamp(score),
    weight: DEFAULT_WEIGHTS.fundraising,
    findings,
  };
}

function scoreCustomisation(results: BaselineResults): CategoryScore | null {
  const c = results.customisation;
  if (!c) return null;

  const findings: ScoreFinding[] = [];
  let score = 50; // Start at midpoint — complexity is neither good nor bad by default

  // Empty custom objects (penalty)
  if (c.emptyCustomObjects > 0) {
    score -= c.emptyCustomObjects * 5;
    findings.push({
      category: 'customisation',
      severity: 'WARNING',
      message: `${c.emptyCustomObjects} custom objects contain zero records.`,
      evidence: 'Someone built them but they were never adopted',
    });
  }

  // Excessive custom fields (penalty)
  if (c.maxCustomFieldsOnObject && c.maxCustomFieldsOnObject.count > 100) {
    score -= 20;
    findings.push({
      category: 'customisation',
      severity: 'CRITICAL',
      message: `${c.maxCustomFieldsOnObject.objectName} has ${c.maxCustomFieldsOnObject.count} custom fields.`,
      evidence: 'Excessive field bloat — likely many unused',
    });
  } else if (
    c.maxCustomFieldsOnObject &&
    c.maxCustomFieldsOnObject.count > 50
  ) {
    score -= 10;
    findings.push({
      category: 'customisation',
      severity: 'WARNING',
      message: `${c.maxCustomFieldsOnObject.objectName} has ${c.maxCustomFieldsOnObject.count} custom fields.`,
      evidence: 'High field count — review for unused fields',
    });
  }

  // Active automations (moderate complexity is OK, excessive is not)
  const totalAutomations =
    c.activeFlows + c.activeValidationRules + c.activeWorkflowRules;
  if (totalAutomations > 50) {
    score -= 15;
    findings.push({
      category: 'customisation',
      severity: 'WARNING',
      message: `${totalAutomations} active automations (flows + validation + workflow rules).`,
      evidence: 'High automation complexity',
    });
  }

  // Stale automations (penalty)
  if (c.staleAutomations > 5) {
    score -= 10;
    findings.push({
      category: 'customisation',
      severity: 'WARNING',
      message: `${c.staleAutomations} active automations not modified in 12+ months.`,
      evidence: 'May be broken or orphaned — nobody maintaining them',
    });
  }

  return {
    name: 'Customisation Health',
    score: clamp(score),
    weight: DEFAULT_WEIGHTS.customisation,
    findings,
  };
}

function scoreIntegration(results: BaselineResults): CategoryScore | null {
  const i = results.integration;
  if (!i) return null;

  const findings: ScoreFinding[] = [];
  let score = 70; // Start high — having some integrations is normal

  // Too many integrations (fragility)
  if (i.totalIntegrations > 15) {
    score -= 30;
    findings.push({
      category: 'integration',
      severity: 'WARNING',
      message: `${i.totalIntegrations} total integrations (apps + packages).`,
      evidence: 'High integration complexity — each is a potential break point',
    });
  } else if (i.totalIntegrations > 8) {
    score -= 15;
    findings.push({
      category: 'integration',
      severity: 'INFO',
      message: `${i.totalIntegrations} integrations detected.`,
      evidence: 'Moderate integration footprint',
    });
  }

  // Multiple tools in same category (redundancy)
  for (const [cat, tools] of Object.entries(i.packageCategories)) {
    if (tools.length > 2 && cat !== 'crm') {
      score -= 10;
      findings.push({
        category: 'integration',
        severity: 'WARNING',
        message: `Multiple ${cat} tools installed: ${tools.join(', ')}`,
        evidence: 'Possible redundancy or fragmented tooling',
      });
    }
  }

  return {
    name: 'Integration Health',
    score: clamp(score),
    weight: DEFAULT_WEIGHTS.integration,
    findings,
  };
}

// --- Main scoring function ---

export function score(
  results: BaselineResults,
  validation: ValidationReport,
): AuditScore {
  const categoryScores: (CategoryScore | null)[] = [
    scoreAdoption(results),
    scoreRelationship(results),
    scoreDataHealth(results),
    scoreFundraising(results),
    scoreCustomisation(results),
    scoreIntegration(results),
  ];

  // Filter out nulls, redistribute weights
  const validScores = categoryScores.filter(
    (s): s is CategoryScore => s !== null,
  );

  const totalWeight = validScores.reduce((sum, s) => sum + s.weight, 0);
  const overall =
    totalWeight > 0
      ? validScores.reduce(
          (sum, s) => sum + s.score * (s.weight / totalWeight),
          0,
        )
      : 0;

  const allFindings = validScores.flatMap((s) => s.findings);

  return {
    overall: Math.round(clamp(overall)),
    verdict: verdictFromScore(overall),
    confidence: confidenceFromResults(results, validation),
    categories: validScores,
    findings: allFindings,
    queriesAttempted: results.queriesAttempted,
    queriesSucceeded: results.queriesSucceeded,
    validationIssues:
      validation.invariantViolations + validation.plausibilityWarnings,
  };
}
