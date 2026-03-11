/**
 * Validation tests — do the sense organs actually sense?
 *
 * Deliberately breaks healthy org data and checks that validation catches each violation.
 */
import { describe, it, expect } from 'vitest';
import { validate } from '../src/audit/validation.js';
import { healthyOrg } from './fixtures.js';
import { BaselineResults } from '../src/audit/types.js';

function cloneOrg(org: BaselineResults): BaselineResults {
  return JSON.parse(JSON.stringify(org));
}

describe('Validation: Invariant Detection', () => {
  it('detects active users > total users', () => {
    const org = cloneOrg(healthyOrg);
    org.adoption!.activeUserCount = 15;
    org.orientation!.totalUsers = 10;
    const report = validate(org);
    const violation = report.findings.find(
      (f) => f.check === 'active_users_lte_total',
    );
    expect(violation).toBeDefined();
    expect(violation!.severity).toBe('CRITICAL');
  });

  it('detects fresh 6m > fresh 12m', () => {
    const org = cloneOrg(healthyOrg);
    org.dataHealth!.contactsFresh6m = 5000;
    org.dataHealth!.contactsFresh12m = 3000;
    const report = validate(org);
    const violation = report.findings.find(
      (f) => f.check === 'fresh_6m_lte_fresh_12m',
    );
    expect(violation).toBeDefined();
  });

  it('detects fresh 12m > total contacts', () => {
    const org = cloneOrg(healthyOrg);
    org.dataHealth!.contactsFresh12m = 6000;
    org.dataHealth!.totalContacts = 5000;
    const report = validate(org);
    const violation = report.findings.find(
      (f) => f.check === 'fresh_12m_lte_total',
    );
    expect(violation).toBeDefined();
  });

  it('detects contacts with email > total contacts', () => {
    const org = cloneOrg(healthyOrg);
    org.dataHealth!.contactsWithEmail = 6000;
    org.dataHealth!.totalContacts = 5000;
    const report = validate(org);
    const violation = report.findings.find(
      (f) => f.check === 'email_lte_total',
    );
    expect(violation).toBeDefined();
  });

  it('detects never-modified > total contacts', () => {
    const org = cloneOrg(healthyOrg);
    org.dataHealth!.contactsNeverModified = 6000;
    org.dataHealth!.totalContacts = 5000;
    const report = validate(org);
    const violation = report.findings.find(
      (f) => f.check === 'never_modified_lte_total',
    );
    expect(violation).toBeDefined();
  });
});

describe('Validation: Plausibility Detection', () => {
  it('detects excessive logins (API, not human)', () => {
    const org = cloneOrg(healthyOrg);
    org.adoption!.logins6m[0].loginCount = 100000;
    const report = validate(org);
    const warning = report.findings.find(
      (f) => f.check === 'excessive_logins',
    );
    expect(warning).toBeDefined();
    expect(warning!.category).toBe('plausibility');
  });

  it('detects extreme creation concentration', () => {
    const org = cloneOrg(healthyOrg);
    org.adoption!.creationConcentration = 95;
    const report = validate(org);
    const warning = report.findings.find(
      (f) => f.check === 'extreme_concentration',
    );
    expect(warning).toBeDefined();
  });
});

describe('Validation: Clean Org Passes', () => {
  it('healthy org has zero invariant violations', () => {
    const report = validate(healthyOrg);
    expect(report.invariantViolations).toBe(0);
  });

  it('healthy org does not recommend abort', () => {
    const report = validate(healthyOrg);
    expect(report.recommendAbort).toBe(false);
  });
});

describe('Validation: Abort Recommendation', () => {
  it('recommends abort on 3+ invariant violations', () => {
    const org = cloneOrg(healthyOrg);
    // Break three invariants
    org.adoption!.activeUserCount = 15;
    org.orientation!.totalUsers = 10;
    org.dataHealth!.contactsFresh6m = 5000;
    org.dataHealth!.contactsFresh12m = 3000;
    org.dataHealth!.contactsWithEmail = 6000;
    org.dataHealth!.totalContacts = 5000;
    const report = validate(org);
    expect(report.recommendAbort).toBe(true);
  });
});
