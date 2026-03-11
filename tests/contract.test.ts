/**
 * Contract tests — does the system produce the right verdict for known inputs?
 *
 * "Healthy org -> KEEP, above 70, HIGH confidence, few findings."
 * "Neglected org -> SIMPLIFY or MIGRATE, below 50, detects single point of failure."
 */
import { describe, it, expect } from 'vitest';
import { validate } from '../src/audit/validation.js';
import { score } from '../src/audit/scoring.js';
import { prescribe } from '../src/audit/prescription.js';
import { healthyOrg, neglectedOrg, misfitOrg, brokenOrg } from './fixtures.js';

describe('Contract: Healthy Org', () => {
  const validation = validate(healthyOrg);
  const result = score(healthyOrg, validation);
  const prescription = prescribe(healthyOrg, result);

  it('should score KEEP', () => {
    expect(result.verdict).toBe('KEEP');
  });

  it('should score above 70', () => {
    expect(result.overall).toBeGreaterThanOrEqual(70);
  });

  it('should have HIGH confidence', () => {
    expect(result.confidence).toBe('HIGH');
  });

  it('should have few critical findings', () => {
    const critical = result.findings.filter((f) => f.severity === 'CRITICAL');
    expect(critical.length).toBeLessThanOrEqual(2);
  });

  it('should have no validation invariant violations', () => {
    expect(validation.invariantViolations).toBe(0);
  });

  it('should detect donor_management as org type', () => {
    expect(prescription.orgType).toBe('donor_management');
  });
});

describe('Contract: Neglected Org', () => {
  const validation = validate(neglectedOrg);
  const result = score(neglectedOrg, validation);

  it('should score SIMPLIFY or MIGRATE', () => {
    expect(['SIMPLIFY', 'MIGRATE']).toContain(result.verdict);
  });

  it('should score below 50', () => {
    expect(result.overall).toBeLessThan(50);
  });

  it('should detect single point of failure', () => {
    const spofFindings = result.findings.filter(
      (f) =>
        f.message.toLowerCase().includes('single point') ||
        f.message.toLowerCase().includes('one person'),
    );
    expect(spofFindings.length).toBeGreaterThan(0);
  });

  it('should detect admin is gone', () => {
    const adminFindings = result.findings.filter(
      (f) =>
        f.message.toLowerCase().includes('admin') &&
        f.message.toLowerCase().includes('gone'),
    );
    expect(adminFindings.length).toBeGreaterThan(0);
  });

  it('should detect low NPSP utilisation', () => {
    const npspFindings = result.findings.filter(
      (f) => f.message.toLowerCase().includes('npsp'),
    );
    expect(npspFindings.length).toBeGreaterThan(0);
  });
});

describe('Contract: Misfit Org (Inventory on Salesforce)', () => {
  const validation = validate(misfitOrg);
  const result = score(misfitOrg, validation);
  const prescription = prescribe(misfitOrg, result);

  it('should score SIMPLIFY or lower', () => {
    expect(['SIMPLIFY', 'MIGRATE']).toContain(result.verdict);
  });

  it('should detect inventory as primary operation', () => {
    // Org type should reflect custom objects not standard CRM
    expect(prescription.orgType).not.toBe('donor_management');
  });

  it('should propose meaningful annual savings', () => {
    expect(prescription.estimatedAnnualSavings).toBeGreaterThan(0);
  });

  it('should identify migration objects', () => {
    expect(
      prescription.migrationEstimate.totalObjects,
    ).toBeGreaterThan(0);
  });
});

describe('Contract: Broken Org (Insufficient Access)', () => {
  const validation = validate(brokenOrg);
  const result = score(brokenOrg, validation);

  it('should have LOW confidence', () => {
    expect(result.confidence).toBe('LOW');
  });

  it('should be marked as aborted', () => {
    expect(brokenOrg.aborted).toBe(true);
  });

  it('should have errors recorded', () => {
    expect(brokenOrg.errors.length).toBeGreaterThan(0);
  });
});
