/**
 * Adoption queries — "Is anyone actually home?"
 *
 * Discovers: login patterns, creation concentration, report usage,
 * admin health, single points of failure.
 */
import { SalesforceClient } from '../client.js';
import { runQuery, countFrom, recordsFrom } from '../query-helper.js';
import { AdoptionResults, LoginRecord, QueryError } from '../types.js';

export async function runAdoptionQueries(
  client: SalesforceClient,
  errors: QueryError[],
  totalUsers: number,
): Promise<AdoptionResults | null> {
  // Q-ADO-01: Login history (6 months)
  const loginResult = await runQuery(
    client,
    'Q-ADO-01',
    'adoption',
    `SELECT UserId, COUNT(Id) cnt, MAX(LoginTime) last_login, Platform, Browser
     FROM LoginHistory
     WHERE LoginTime > LAST_N_MONTHS:6
     GROUP BY UserId, Platform, Browser
     ORDER BY COUNT(Id) DESC
     LIMIT 200`,
    errors,
  );

  // Aggregate logins by user (across platforms)
  const loginsByUser = new Map<
    string,
    { count: number; lastLogin: string; platform: string; browser: string }
  >();
  if (loginResult) {
    for (const rec of loginResult.records) {
      const userId = String(rec['UserId']);
      const cnt = Number(rec['cnt'] ?? 0);
      const lastLogin = String(rec['last_login'] ?? '');
      const existing = loginsByUser.get(userId);
      if (!existing || cnt > existing.count) {
        loginsByUser.set(userId, {
          count: (existing?.count ?? 0) + cnt,
          lastLogin,
          platform: String(rec['Platform'] ?? ''),
          browser: String(rec['Browser'] ?? ''),
        });
      }
    }
  }

  const logins6m: LoginRecord[] = Array.from(loginsByUser.entries()).map(
    ([userId, data]) => ({
      userId,
      loginCount: data.count,
      lastLogin: data.lastLogin,
      platform: data.platform,
      browser: data.browser,
    }),
  );

  const activeUserCount = logins6m.length;
  const adoptionRate =
    totalUsers > 0 ? (activeUserCount / totalUsers) * 100 : 0;

  // Q-ADO-02: Contact creation concentration
  const contactCreationResult = await runQuery(
    client,
    'Q-ADO-02',
    'adoption',
    `SELECT CreatedById, COUNT(Id) cnt
     FROM Contact
     WHERE CreatedDate > LAST_N_MONTHS:6
     GROUP BY CreatedById
     ORDER BY COUNT(Id) DESC
     LIMIT 10`,
    errors,
  );
  let topCreatorContact: { userId: string; count: number } | null = null;
  let totalContactCreations = 0;
  if (contactCreationResult && contactCreationResult.records.length > 0) {
    for (const r of contactCreationResult.records) {
      totalContactCreations += Number(r['cnt'] ?? 0);
    }
    const top = contactCreationResult.records[0];
    topCreatorContact = {
      userId: String(top['CreatedById']),
      count: Number(top['cnt'] ?? 0),
    };
  }

  // Q-ADO-03: Opportunity creation concentration
  const oppCreationResult = await runQuery(
    client,
    'Q-ADO-03',
    'adoption',
    `SELECT CreatedById, COUNT(Id) cnt
     FROM Opportunity
     WHERE CreatedDate > LAST_N_MONTHS:6
     GROUP BY CreatedById
     ORDER BY COUNT(Id) DESC
     LIMIT 10`,
    errors,
  );
  let topCreatorOpportunity: { userId: string; count: number } | null = null;
  if (oppCreationResult && oppCreationResult.records.length > 0) {
    const top = oppCreationResult.records[0];
    topCreatorOpportunity = {
      userId: String(top['CreatedById']),
      count: Number(top['cnt'] ?? 0),
    };
  }

  // Creation concentration: what % of all creations come from top creator?
  const topCreations = topCreatorContact?.count ?? 0;
  const creationConcentration =
    totalContactCreations > 0
      ? (topCreations / totalContactCreations) * 100
      : 0;

  // Q-ADO-04: Report usage (6 months)
  // ReportEvent doesn't support CreatedDate filtering; use EventDate instead
  const reportResult = await runQuery(
    client,
    'Q-ADO-04',
    'adoption',
    `SELECT COUNT(Id) FROM ReportEvent WHERE EventDate > LAST_N_MONTHS:6`,
    errors,
  );
  const reportUsage = countFrom(reportResult) ?? 0;

  // Q-ADO-05: Dashboard usage
  const dashboardResult = await runQuery(
    client,
    'Q-ADO-05',
    'adoption',
    `SELECT COUNT(Id) FROM Dashboard WHERE LastReferencedDate > LAST_N_MONTHS:6`,
    errors,
  );
  const dashboardUsage = countFrom(dashboardResult) ?? 0;

  // Q-ADO-06: Setup audit trail — admin activity
  // SetupAuditTrail doesn't support COUNT(Id) or GROUP BY.
  // Query recent records directly and aggregate in code.
  const setupResult = await runQuery(
    client,
    'Q-ADO-06',
    'adoption',
    `SELECT CreatedById, CreatedDate
     FROM SetupAuditTrail
     WHERE CreatedDate > LAST_N_MONTHS:6
     ORDER BY CreatedDate DESC
     LIMIT 200`,
    errors,
  );

  let setupChanges6m = 0;
  let setupChangeUsers = 0;
  let lastSetupChange: string | null = null;
  if (setupResult) {
    setupChanges6m = setupResult.records.length;
    const userSet = new Set<string>();
    for (const r of setupResult.records) {
      userSet.add(String(r['CreatedById'] ?? ''));
      const change = String(r['CreatedDate'] ?? '');
      if (!lastSetupChange || change > lastSetupChange) {
        lastSetupChange = change;
      }
    }
    setupChangeUsers = userSet.size;
  }

  // Admin gone: last setup change was > 6 months ago, or zero changes
  const sixMonthsAgo = new Date();
  sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
  const adminGone =
    setupChanges6m === 0 ||
    (lastSetupChange !== null &&
      new Date(lastSetupChange) < sixMonthsAgo);

  return {
    logins6m,
    activeUserCount,
    totalLicensedUsers: totalUsers,
    adoptionRate,
    topCreatorContact,
    topCreatorOpportunity,
    creationConcentration,
    reportUsage,
    dashboardUsage,
    setupChanges6m,
    setupChangeUsers,
    lastSetupChange,
    adminGone,
  };
}
