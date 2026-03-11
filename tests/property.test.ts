/**
 * Property tests — mathematical invariants that must hold for ANY input.
 *
 * "Score is always 0-100."
 * "Verdict always matches score range."
 * "Healthy org always scores higher than neglected org." (monotonicity)
 */
import { describe, it, expect } from 'vitest';
import { validate, score, type AuditScore } from '../src/audit/index.js';
import { healthyOrg, neglectedOrg, misfitOrg, brokenOrg } from './fixtures.js';

function scoreOrg(results: typeof healthyOrg): AuditScore {
  const validation = validate(results);
  return score(results, validation);
}

describe('Property: Score Bounds', () => {
  const orgs = [healthyOrg, neglectedOrg, misfitOrg, brokenOrg];

  for (const org of orgs) {
    it(`overall score is 0-100 for ${org === healthyOrg ? 'healthy' : org === neglectedOrg ? 'neglected' : org === misfitOrg ? 'misfit' : 'broken'}`, () => {
      const result = scoreOrg(org);
      expect(result.overall).toBeGreaterThanOrEqual(0);
      expect(result.overall).toBeLessThanOrEqual(100);
    });

    it(`category scores are 0-100 for ${org === healthyOrg ? 'healthy' : org === neglectedOrg ? 'neglected' : org === misfitOrg ? 'misfit' : 'broken'}`, () => {
      const result = scoreOrg(org);
      for (const cat of result.categories) {
        expect(cat.score).toBeGreaterThanOrEqual(0);
        expect(cat.score).toBeLessThanOrEqual(100);
      }
    });
  }
});

describe('Property: Verdict Matches Score Range', () => {
  const orgs = [healthyOrg, neglectedOrg, misfitOrg, brokenOrg];

  for (const org of orgs) {
    it(`verdict matches score range for ${org === healthyOrg ? 'healthy' : org === neglectedOrg ? 'neglected' : org === misfitOrg ? 'misfit' : 'broken'}`, () => {
      const result = scoreOrg(org);
      if (result.overall >= 70) expect(result.verdict).toBe('KEEP');
      else if (result.overall >= 55) expect(result.verdict).toBe('OPTIMISE');
      else if (result.overall >= 35) expect(result.verdict).toBe('SIMPLIFY');
      else expect(result.verdict).toBe('MIGRATE');
    });
  }
});

describe('Property: Monotonicity', () => {
  it('healthy org scores higher than neglected org', () => {
    const healthy = scoreOrg(healthyOrg);
    const neglected = scoreOrg(neglectedOrg);
    expect(healthy.overall).toBeGreaterThan(neglected.overall);
  });

  it('healthy org scores higher than misfit org', () => {
    const healthy = scoreOrg(healthyOrg);
    const misfit = scoreOrg(misfitOrg);
    expect(healthy.overall).toBeGreaterThan(misfit.overall);
  });
});

describe('Property: Query Counts', () => {
  const orgs = [healthyOrg, neglectedOrg, misfitOrg, brokenOrg];

  for (const org of orgs) {
    it(`queriesSucceeded never exceeds queriesAttempted for ${org === healthyOrg ? 'healthy' : org === neglectedOrg ? 'neglected' : org === misfitOrg ? 'misfit' : 'broken'}`, () => {
      expect(org.queriesSucceeded).toBeLessThanOrEqual(
        org.queriesAttempted,
      );
    });
  }
});

describe('Property: Confidence Levels', () => {
  it('broken org has LOW confidence', () => {
    const result = scoreOrg(brokenOrg);
    expect(result.confidence).toBe('LOW');
  });

  it('healthy org does not have LOW confidence', () => {
    const result = scoreOrg(healthyOrg);
    expect(result.confidence).not.toBe('LOW');
  });
});

describe('Property: Severity Labels', () => {
  const validSeverities = ['INFO', 'WARNING', 'CRITICAL'];
  const orgs = [healthyOrg, neglectedOrg, misfitOrg];

  for (const org of orgs) {
    it(`all findings have valid severity for ${org === healthyOrg ? 'healthy' : org === neglectedOrg ? 'neglected' : 'misfit'}`, () => {
      const result = scoreOrg(org);
      for (const finding of result.findings) {
        expect(validSeverities).toContain(finding.severity);
      }
    });
  }
});
