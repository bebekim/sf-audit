/**
 * Fundraising queries — NPSP-specific donation and campaign tracking.
 *
 * Gated: only runs if NPSP is detected. Returns null otherwise.
 */
import { SalesforceClient } from '../client.js';
import { runQuery, countFrom, recordsFrom } from '../query-helper.js';
import {
  FundraisingResults,
  DonationByType,
  MonthlyDonation,
  QueryError,
} from '../types.js';

export async function runFundraisingQueries(
  client: SalesforceClient,
  errors: QueryError[],
  npspDetected: boolean,
): Promise<FundraisingResults | null> {
  // Q-FUN-01: Donations by record type
  const donationsByTypeResult = await runQuery(
    client,
    'Q-FUN-01',
    'fundraising',
    `SELECT RecordType.Name rt, COUNT(Id) cnt, SUM(Amount) total
     FROM Opportunity
     WHERE StageName = 'Closed Won'
     GROUP BY RecordType.Name`,
    errors,
  );

  const donationsByType: DonationByType[] = [];
  let totalDonations = 0;
  let totalDonationAmount = 0;

  if (donationsByTypeResult) {
    for (const r of donationsByTypeResult.records) {
      const entry: DonationByType = {
        recordType: String(r['rt'] ?? 'Default'),
        count: Number(r['cnt'] ?? 0),
        totalAmount: Number(r['total'] ?? 0),
      };
      donationsByType.push(entry);
      totalDonations += entry.count;
      totalDonationAmount += entry.totalAmount;
    }
  }

  // Q-FUN-02: Monthly donation pattern (12 months)
  const monthlyResult = await runQuery(
    client,
    'Q-FUN-02',
    'fundraising',
    `SELECT CALENDAR_YEAR(CreatedDate) yr, CALENDAR_MONTH(CreatedDate) mo, COUNT(Id) cnt
     FROM Opportunity
     WHERE CreatedDate > LAST_N_MONTHS:12 AND StageName = 'Closed Won'
     GROUP BY CALENDAR_YEAR(CreatedDate), CALENDAR_MONTH(CreatedDate)
     ORDER BY CALENDAR_YEAR(CreatedDate), CALENDAR_MONTH(CreatedDate)`,
    errors,
  );

  const monthlyDonations: MonthlyDonation[] = [];
  if (monthlyResult) {
    for (const r of monthlyResult.records) {
      monthlyDonations.push({
        year: Number(r['yr']),
        month: Number(r['mo']),
        count: Number(r['cnt'] ?? 0),
      });
    }
  }

  // Q-FUN-03: Active campaigns
  const activeCampaignsResult = await runQuery(
    client,
    'Q-FUN-03a',
    'fundraising',
    'SELECT COUNT(Id) FROM Campaign WHERE IsActive = true',
    errors,
  );
  const activeCampaigns = countFrom(activeCampaignsResult) ?? 0;

  // Campaign members added recently
  const campaignMembersResult = await runQuery(
    client,
    'Q-FUN-03b',
    'fundraising',
    'SELECT COUNT(Id) FROM CampaignMember WHERE CreatedDate > LAST_N_MONTHS:6',
    errors,
  );
  const campaignMembers6m = countFrom(campaignMembersResult) ?? 0;

  // NPSP-specific queries (only if NPSP detected)
  let recurringDonationsActive = 0;
  const npspFeatureUsage: Record<string, boolean> = {};
  let npspFeaturesUsed = 0;
  const npspFeaturesTotal = 8;

  if (npspDetected) {
    // Q-FUN-04a: Recurring Donations
    // Field name varies by NPSP version: Status__c (newer) or Open_Status__c (older)
    let recurringResult = await runQuery(
      client,
      'Q-FUN-04a',
      'fundraising',
      `SELECT COUNT(Id) FROM npe03__Recurring_Donation__c
       WHERE npsp__Status__c = 'Active'`,
      errors,
    );
    // Fallback to older field name
    if (!recurringResult) {
      recurringResult = await runQuery(
        client,
        'Q-FUN-04a-fallback',
        'fundraising',
        `SELECT COUNT(Id) FROM npe03__Recurring_Donation__c`,
        errors,
      );
    }
    recurringDonationsActive = countFrom(recurringResult) ?? 0;
    npspFeatureUsage['Recurring Donations'] = recurringDonationsActive > 0;

    // Q-FUN-04b: Household Accounts
    const householdResult = await runQuery(
      client,
      'Q-FUN-04b',
      'fundraising',
      `SELECT COUNT(Id) FROM Account
       WHERE npe01__SYSTEM_AccountType__c = 'Household Account'`,
      errors,
    );
    npspFeatureUsage['Household Accounts'] =
      (countFrom(householdResult) ?? 0) > 0;

    // Q-FUN-04c: Affiliations
    const affiliationResult = await runQuery(
      client,
      'Q-FUN-04c',
      'fundraising',
      'SELECT COUNT(Id) FROM npe5__Affiliation__c',
      errors,
    );
    npspFeatureUsage['Affiliations'] =
      (countFrom(affiliationResult) ?? 0) > 0;

    // Q-FUN-04d: Relationships
    const relationshipResult = await runQuery(
      client,
      'Q-FUN-04d',
      'fundraising',
      `SELECT COUNT(Id) FROM npe4__Relationship__c
       WHERE npe4__Status__c = 'Current'`,
      errors,
    );
    npspFeatureUsage['Relationships'] =
      (countFrom(relationshipResult) ?? 0) > 0;

    // Q-FUN-04e: Soft Credits
    const softCreditResult = await runQuery(
      client,
      'Q-FUN-04e',
      'fundraising',
      'SELECT COUNT(Id) FROM npsp__Partial_Soft_Credit__c',
      errors,
    );
    npspFeatureUsage['Soft Credits'] =
      (countFrom(softCreditResult) ?? 0) > 0;

    // Q-FUN-04f: Allocations (GAU)
    const allocationResult = await runQuery(
      client,
      'Q-FUN-04f',
      'fundraising',
      'SELECT COUNT(Id) FROM npsp__Allocation__c',
      errors,
    );
    npspFeatureUsage['Allocations (GAU)'] =
      (countFrom(allocationResult) ?? 0) > 0;

    // Q-FUN-04g: Engagement Plans
    const engagementResult = await runQuery(
      client,
      'Q-FUN-04g',
      'fundraising',
      'SELECT COUNT(Id) FROM npsp__Engagement_Plan__c',
      errors,
    );
    npspFeatureUsage['Engagement Plans'] =
      (countFrom(engagementResult) ?? 0) > 0;

    // Q-FUN-04h: Batch Data Import
    const batchResult = await runQuery(
      client,
      'Q-FUN-04h',
      'fundraising',
      `SELECT COUNT(Id) FROM npsp__DataImportBatch__c
       WHERE CreatedDate > LAST_N_MONTHS:12`,
      errors,
    );
    npspFeatureUsage['Batch Data Import'] =
      (countFrom(batchResult) ?? 0) > 0;

    npspFeaturesUsed = Object.values(npspFeatureUsage).filter(Boolean).length;
  }

  return {
    donationsByType,
    totalDonations,
    totalDonationAmount,
    monthlyDonations,
    activeCampaigns,
    campaignMembers6m,
    recurringDonationsActive,
    npspFeatureUsage,
    npspFeaturesUsed,
    npspFeaturesTotal,
  };
}
