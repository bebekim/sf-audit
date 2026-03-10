/**
 * Data Health queries — "How stale is your data?"
 *
 * Discovers: record freshness, completeness, duplicates,
 * never-modified records, data entry burstiness.
 */
import { SalesforceClient } from '../client.js';
import { runQuery, countFrom, recordsFrom } from '../query-helper.js';
import { DataHealthResults, QueryError } from '../types.js';

export async function runDataHealthQueries(
  client: SalesforceClient,
  errors: QueryError[],
  totalContacts: number,
): Promise<DataHealthResults | null> {
  // Q-DAT-01a: Contacts modified in last 6 months
  const fresh6mResult = await runQuery(
    client,
    'Q-DAT-01a',
    'data-health',
    'SELECT COUNT(Id) FROM Contact WHERE LastModifiedDate > LAST_N_MONTHS:6',
    errors,
  );
  const contactsFresh6m = countFrom(fresh6mResult) ?? 0;

  // Q-DAT-01b: Contacts modified in last 12 months
  const fresh12mResult = await runQuery(
    client,
    'Q-DAT-01b',
    'data-health',
    'SELECT COUNT(Id) FROM Contact WHERE LastModifiedDate > LAST_N_MONTHS:12',
    errors,
  );
  const contactsFresh12m = countFrom(fresh12mResult) ?? 0;

  const freshnessRate6m =
    totalContacts > 0 ? (contactsFresh6m / totalContacts) * 100 : 0;
  const freshnessRate12m =
    totalContacts > 0 ? (contactsFresh12m / totalContacts) * 100 : 0;

  // Q-DAT-02a: Contacts with email
  const withEmailResult = await runQuery(
    client,
    'Q-DAT-02a',
    'data-health',
    'SELECT COUNT(Id) FROM Contact WHERE Email != null',
    errors,
  );
  const contactsWithEmail = countFrom(withEmailResult) ?? 0;

  // Q-DAT-02b: Contacts with phone
  const withPhoneResult = await runQuery(
    client,
    'Q-DAT-02b',
    'data-health',
    'SELECT COUNT(Id) FROM Contact WHERE Phone != null',
    errors,
  );
  const contactsWithPhone = countFrom(withPhoneResult) ?? 0;

  // Q-DAT-02c: Contacts with mailing address
  const withAddressResult = await runQuery(
    client,
    'Q-DAT-02c',
    'data-health',
    'SELECT COUNT(Id) FROM Contact WHERE MailingCity != null',
    errors,
  );
  const contactsWithAddress = countFrom(withAddressResult) ?? 0;

  const emailCompletenessRate =
    totalContacts > 0 ? (contactsWithEmail / totalContacts) * 100 : 0;

  // Q-DAT-03: Duplicate email detection (sample)
  const dupResult = await runQuery(
    client,
    'Q-DAT-03',
    'data-health',
    `SELECT Email, COUNT(Id) cnt
     FROM Contact
     WHERE Email != null
     GROUP BY Email
     HAVING COUNT(Id) > 1
     LIMIT 50`,
    errors,
  );
  const duplicateEmails = dupResult?.totalSize ?? 0;
  const duplicateRate =
    contactsWithEmail > 0
      ? (duplicateEmails / contactsWithEmail) * 100
      : 0;

  // Q-DAT-04: Contacts never modified after creation
  // SOQL can't compare two date fields directly. Instead, count contacts
  // not modified in the last 24 months as a proxy for "never touched".
  const neverModifiedResult = await runQuery(
    client,
    'Q-DAT-04',
    'data-health',
    'SELECT COUNT(Id) FROM Contact WHERE LastModifiedDate < LAST_N_MONTHS:24',
    errors,
  );
  const contactsNeverModified = countFrom(neverModifiedResult) ?? 0;
  const neverModifiedRate =
    totalContacts > 0 ? (contactsNeverModified / totalContacts) * 100 : 0;

  // Q-DAT-05: Opportunity creation burstiness (day-level)
  // Checks if donations cluster on specific days (batch data entry)
  const oppDayResult = await runQuery(
    client,
    'Q-DAT-05',
    'data-health',
    `SELECT CALENDAR_YEAR(CreatedDate) yr, CALENDAR_MONTH(CreatedDate) mo,
            DAY_IN_MONTH(CreatedDate) dy, COUNT(Id) cnt
     FROM Opportunity
     WHERE CreatedDate > LAST_N_MONTHS:12
     GROUP BY CALENDAR_YEAR(CreatedDate), CALENDAR_MONTH(CreatedDate),
              DAY_IN_MONTH(CreatedDate)
     ORDER BY CALENDAR_YEAR(CreatedDate), CALENDAR_MONTH(CreatedDate),
              DAY_IN_MONTH(CreatedDate)`,
    errors,
  );

  let opportunityBurstiness = 0;
  let burstyMonths = 0;
  let totalMonthsChecked = 0;

  if (oppDayResult && oppDayResult.records.length > 0) {
    // Group by month, check if any single day has >50% of that month's records
    const monthBuckets = new Map<string, number[]>();
    for (const r of oppDayResult.records) {
      const key = `${r['yr']}-${r['mo']}`;
      if (!monthBuckets.has(key)) monthBuckets.set(key, []);
      monthBuckets.get(key)!.push(Number(r['cnt'] ?? 0));
    }

    totalMonthsChecked = monthBuckets.size;
    for (const [, dayCounts] of monthBuckets) {
      const monthTotal = dayCounts.reduce((a, b) => a + b, 0);
      const maxDay = Math.max(...dayCounts);
      if (monthTotal > 0 && maxDay / monthTotal > 0.5) {
        burstyMonths++;
      }
    }
    opportunityBurstiness =
      totalMonthsChecked > 0
        ? (burstyMonths / totalMonthsChecked) * 100
        : 0;
  }

  return {
    totalContacts,
    contactsFresh6m,
    contactsFresh12m,
    freshnessRate6m,
    freshnessRate12m,
    contactsWithEmail,
    contactsWithPhone,
    contactsWithAddress,
    emailCompletenessRate,
    duplicateEmails,
    duplicateRate,
    contactsNeverModified,
    neverModifiedRate,
    opportunityBurstiness,
    burstyMonths,
    totalMonthsChecked,
    fieldFillRates: [], // Populated by curiosity engine for custom fields
  };
}
