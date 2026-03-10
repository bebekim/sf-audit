/**
 * Volunteer Management queries — V4S (Volunteers for Salesforce) specific.
 *
 * Gated: only runs if V4S is detected. Returns null otherwise.
 */
import { SalesforceClient } from '../client.js';
import { runQuery, countFrom } from '../query-helper.js';
import { VolunteerResults, QueryError } from '../types.js';

export async function runVolunteerQueries(
  client: SalesforceClient,
  errors: QueryError[],
  v4sDetected: boolean,
): Promise<VolunteerResults | null> {
  if (!v4sDetected) return null;

  // Q-VOL-01: Active volunteers
  const activeResult = await runQuery(
    client,
    'Q-VOL-01',
    'volunteers',
    `SELECT COUNT(Id) FROM Contact
     WHERE GW_Volunteers__Volunteer_Status__c = 'Active'`,
    errors,
  );
  const activeVolunteers = countFrom(activeResult) ?? 0;

  // Q-VOL-02: Hours logged (6 months)
  const hoursResult = await runQuery(
    client,
    'Q-VOL-02',
    'volunteers',
    `SELECT COUNT(Id), SUM(GW_Volunteers__Hours_Worked__c)
     FROM GW_Volunteers__Volunteer_Hours__c
     WHERE GW_Volunteers__Start_Date__c > LAST_N_MONTHS:6`,
    errors,
  );
  let hoursLogged6m = 0;
  let totalHoursWorked6m = 0;
  if (hoursResult && hoursResult.records.length > 0) {
    const rec = hoursResult.records[0];
    hoursLogged6m = Number(rec['expr0'] ?? 0);
    totalHoursWorked6m = Number(rec['expr1'] ?? 0);
  }

  // Q-VOL-03: Active volunteer jobs
  const jobsResult = await runQuery(
    client,
    'Q-VOL-03',
    'volunteers',
    `SELECT COUNT(Id) FROM GW_Volunteers__Volunteer_Job__c`,
    errors,
  );
  const activeJobs = countFrom(jobsResult) ?? 0;

  // Q-VOL-04: Volunteers with no hours logged (12 months)
  // Count active volunteers that have zero hour records
  const volunteersWithHoursResult = await runQuery(
    client,
    'Q-VOL-04',
    'volunteers',
    `SELECT COUNT_DISTINCT(GW_Volunteers__Contact__c)
     FROM GW_Volunteers__Volunteer_Hours__c
     WHERE GW_Volunteers__Start_Date__c > LAST_N_MONTHS:12`,
    errors,
  );
  const volunteersWithHours = countFrom(volunteersWithHoursResult) ?? 0;
  const volunteersWithNoHours12m = Math.max(
    0,
    activeVolunteers - volunteersWithHours,
  );

  const volunteerUtilisationRate =
    activeVolunteers > 0
      ? (volunteersWithHours / activeVolunteers) * 100
      : 0;

  return {
    activeVolunteers,
    hoursLogged6m,
    totalHoursWorked6m,
    activeJobs,
    volunteersWithNoHours12m,
    volunteerUtilisationRate,
  };
}
