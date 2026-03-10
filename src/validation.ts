/**
 * Validation layer — sense organs.
 *
 * Runs between baseline and scoring. Three types of perception:
 * - Invariant checks: mathematical truths that must hold
 * - Plausibility checks: not impossible but suspicious
 * - Completeness checks: enough data to score each category?
 */
import { BaselineResults, ValidationReport, ValidationFinding } from './types.js';

const CATEGORY_MIN_QUERIES: Record<string, number> = {
  orientation: 3,
  adoption: 3,
  relationship: 3,
  dataHealth: 3,
  fundraising: 2,
  volunteers: 2,
  customisation: 2,
  integration: 1,
};

export function validate(results: BaselineResults): ValidationReport {
  const findings: ValidationFinding[] = [];

  // --- Invariant checks ---
  if (results.orientation && results.adoption) {
    const o = results.orientation;
    const a = results.adoption;

    if (a.activeUserCount > o.totalUsers) {
      findings.push({
        check: 'active_users_lte_total',
        severity: 'CRITICAL',
        message: `Active users (${a.activeUserCount}) exceeds total users (${o.totalUsers})`,
        category: 'invariant',
      });
    }
  }

  if (results.dataHealth) {
    const d = results.dataHealth;

    if (d.contactsFresh6m > d.contactsFresh12m) {
      findings.push({
        check: 'fresh_6m_lte_fresh_12m',
        severity: 'CRITICAL',
        message: `Contacts fresh 6m (${d.contactsFresh6m}) exceeds contacts fresh 12m (${d.contactsFresh12m})`,
        category: 'invariant',
      });
    }

    if (d.contactsFresh12m > d.totalContacts) {
      findings.push({
        check: 'fresh_12m_lte_total',
        severity: 'CRITICAL',
        message: `Contacts fresh 12m (${d.contactsFresh12m}) exceeds total contacts (${d.totalContacts})`,
        category: 'invariant',
      });
    }

    if (d.contactsWithEmail > d.totalContacts) {
      findings.push({
        check: 'email_lte_total',
        severity: 'CRITICAL',
        message: `Contacts with email (${d.contactsWithEmail}) exceeds total (${d.totalContacts})`,
        category: 'invariant',
      });
    }

    if (d.contactsNeverModified > d.totalContacts) {
      findings.push({
        check: 'never_modified_lte_total',
        severity: 'CRITICAL',
        message: `Never-modified contacts (${d.contactsNeverModified}) exceeds total (${d.totalContacts})`,
        category: 'invariant',
      });
    }

    if (d.duplicateEmails > d.contactsWithEmail) {
      findings.push({
        check: 'duplicates_lte_with_email',
        severity: 'WARNING',
        message: `Duplicate emails (${d.duplicateEmails}) exceeds contacts with email (${d.contactsWithEmail}). LIMIT 50 sampling may underestimate.`,
        category: 'invariant',
      });
    }
  }

  if (results.relationship && results.orientation) {
    const r = results.relationship;
    const totalContacts = results.orientation.totalContacts;

    if (r.contactsWithTasks > totalContacts) {
      findings.push({
        check: 'contacts_with_tasks_lte_total',
        severity: 'WARNING',
        message: `Contacts with tasks (${r.contactsWithTasks}) exceeds total contacts (${totalContacts}). WhoId may include Leads.`,
        category: 'invariant',
      });
    }

    if (r.oppsWithFollowUp > r.closedWonOpps12m && r.closedWonOpps12m > 0) {
      findings.push({
        check: 'followups_lte_closed_won',
        severity: 'WARNING',
        message: `Follow-up tasks (${r.oppsWithFollowUp}) exceeds closed-won opps (${r.closedWonOpps12m}). Multiple follow-ups per opp.`,
        category: 'invariant',
      });
    }
  }

  if (results.volunteers) {
    const v = results.volunteers;
    if (v.volunteersWithNoHours12m > v.activeVolunteers) {
      findings.push({
        check: 'no_hours_lte_active',
        severity: 'WARNING',
        message: `Volunteers without hours (${v.volunteersWithNoHours12m}) exceeds active volunteers (${v.activeVolunteers})`,
        category: 'invariant',
      });
    }
  }

  // --- Plausibility checks ---
  if (results.adoption) {
    const a = results.adoption;
    const maxLogins = a.logins6m.reduce(
      (max, l) => Math.max(max, l.loginCount),
      0,
    );
    if (maxLogins > 50000) {
      findings.push({
        check: 'excessive_logins',
        severity: 'WARNING',
        message: `One user has ${maxLogins} logins in 6 months — likely API/integration, not human.`,
        category: 'plausibility',
      });
    }

    if (a.creationConcentration > 90) {
      findings.push({
        check: 'extreme_concentration',
        severity: 'WARNING',
        message: `One person creates ${a.creationConcentration.toFixed(0)}% of all contact records. Extreme single point of failure.`,
        category: 'plausibility',
      });
    }
  }

  if (results.orientation) {
    if (
      results.orientation.totalUsers === 0 &&
      results.orientation.totalContacts > 0
    ) {
      findings.push({
        check: 'zero_users_with_contacts',
        severity: 'WARNING',
        message: 'Zero active users but contacts exist. Permission issue may hide users.',
        category: 'plausibility',
      });
    }
  }

  if (results.dataHealth) {
    if (results.dataHealth.duplicateRate > 50) {
      findings.push({
        check: 'high_duplicate_rate',
        severity: 'WARNING',
        message: `Duplicate rate is ${results.dataHealth.duplicateRate.toFixed(0)}%. LIMIT 50 sampling likely underestimates the true count.`,
        category: 'plausibility',
      });
    }
  }

  // --- Completeness checks ---
  const categoryCompleteness: Record<string, number> = {};
  const errorsByCategory = new Map<string, number>();
  for (const err of results.errors) {
    errorsByCategory.set(
      err.category,
      (errorsByCategory.get(err.category) ?? 0) + 1,
    );
  }

  for (const [category, minQueries] of Object.entries(CATEGORY_MIN_QUERIES)) {
    const categoryErrors = errorsByCategory.get(category) ?? 0;
    // Estimate successful queries for this category
    const sectionData = results[category as keyof BaselineResults];
    const hasData = sectionData !== null && sectionData !== undefined;
    const completeness = hasData
      ? Math.max(0, 1 - categoryErrors / Math.max(minQueries, 1))
      : 0;
    categoryCompleteness[category] = completeness;

    if (completeness < 0.5 && hasData) {
      findings.push({
        check: `completeness_${category}`,
        severity: 'WARNING',
        message: `${category} section has low completeness (${(completeness * 100).toFixed(0)}%). Score may be unreliable.`,
        category: 'completeness',
      });
    }
  }

  const invariantViolations = findings.filter(
    (f) => f.category === 'invariant',
  ).length;
  const plausibilityWarnings = findings.filter(
    (f) => f.category === 'plausibility',
  ).length;
  const completenessGaps = findings.filter(
    (f) => f.category === 'completeness',
  ).length;

  // Recommend abort if too many invariant violations
  const recommendAbort = invariantViolations >= 3;
  const abortReason = recommendAbort
    ? `${invariantViolations} invariant violations detected — data integrity suspect.`
    : null;

  return {
    findings,
    invariantViolations,
    plausibilityWarnings,
    completenessGaps,
    recommendAbort,
    abortReason,
    categoryCompleteness,
  };
}
