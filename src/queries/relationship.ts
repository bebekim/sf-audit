/**
 * Relationship Activity queries — "Database or CRM?"
 *
 * Discovers: interaction logging, email activity, engagement rate,
 * donation stewardship (follow-up after gifts).
 */
import { SalesforceClient } from '../client.js';
import { runQuery, countFrom } from '../query-helper.js';
import { RelationshipResults, QueryError } from '../types.js';

export async function runRelationshipQueries(
  client: SalesforceClient,
  errors: QueryError[],
  totalContacts: number,
): Promise<RelationshipResults | null> {
  // Q-REL-01: Task activity (6 months)
  const tasksResult = await runQuery(
    client,
    'Q-REL-01',
    'relationship',
    'SELECT COUNT(Id) FROM Task WHERE CreatedDate > LAST_N_MONTHS:6',
    errors,
  );
  const tasks6m = countFrom(tasksResult) ?? 0;

  // Q-REL-02: Event activity (6 months)
  const eventsResult = await runQuery(
    client,
    'Q-REL-02',
    'relationship',
    'SELECT COUNT(Id) FROM Event WHERE CreatedDate > LAST_N_MONTHS:6',
    errors,
  );
  const events6m = countFrom(eventsResult) ?? 0;

  // Q-REL-03: Email messages (6 months)
  const emailResult = await runQuery(
    client,
    'Q-REL-03',
    'relationship',
    'SELECT COUNT(Id) FROM EmailMessage WHERE CreatedDate > LAST_N_MONTHS:6',
    errors,
  );
  const emailMessages6m = countFrom(emailResult) ?? 0;

  // Q-REL-04: Notes (6 months)
  const notesResult = await runQuery(
    client,
    'Q-REL-04',
    'relationship',
    'SELECT COUNT(Id) FROM Note WHERE CreatedDate > LAST_N_MONTHS:6',
    errors,
  );
  const notes6m = countFrom(notesResult) ?? 0;

  const totalInteractions6m = tasks6m + events6m + emailMessages6m + notes6m;

  // Q-REL-05: Contacts with at least one task (engagement rate)
  // Use COUNT(DISTINCT WhoId) to avoid subquery governor limits
  const contactsWithTasksResult = await runQuery(
    client,
    'Q-REL-05',
    'relationship',
    `SELECT COUNT_DISTINCT(WhoId) FROM Task
     WHERE WhoId != null AND CreatedDate > LAST_N_MONTHS:6`,
    errors,
  );
  const contactsWithTasks = countFrom(contactsWithTasksResult) ?? 0;

  // Q-REL-06: Contacts with at least one event
  const contactsWithEventsResult = await runQuery(
    client,
    'Q-REL-06',
    'relationship',
    `SELECT COUNT_DISTINCT(WhoId) FROM Event
     WHERE WhoId != null AND CreatedDate > LAST_N_MONTHS:6`,
    errors,
  );
  const contactsWithEvents = countFrom(contactsWithEventsResult) ?? 0;

  // Engagement rate: contacts with ANY interaction / total contacts
  const contactsWithAnyInteraction = Math.max(
    contactsWithTasks,
    contactsWithEvents,
  );
  const engagementRate =
    totalContacts > 0
      ? (contactsWithAnyInteraction / totalContacts) * 100
      : 0;

  // Q-REL-07: Closed-won opportunities in last 12 months
  const closedWonResult = await runQuery(
    client,
    'Q-REL-07',
    'relationship',
    `SELECT COUNT(Id) FROM Opportunity
     WHERE StageName = 'Closed Won' AND CloseDate > LAST_N_MONTHS:12`,
    errors,
  );
  const closedWonOpps12m = countFrom(closedWonResult) ?? 0;

  // Q-REL-08: Opportunities with follow-up tasks (stewardship)
  const oppsWithFollowUpResult = await runQuery(
    client,
    'Q-REL-08',
    'relationship',
    `SELECT COUNT(Id) FROM Task
     WHERE WhatId != null AND CreatedDate > LAST_N_MONTHS:12
     AND What.Type = 'Opportunity'`,
    errors,
  );
  const oppsWithFollowUp = countFrom(oppsWithFollowUpResult) ?? 0;

  const stewardshipRate =
    closedWonOpps12m > 0
      ? Math.min((oppsWithFollowUp / closedWonOpps12m) * 100, 100)
      : 0;

  return {
    tasks6m,
    events6m,
    emailMessages6m,
    notes6m,
    totalInteractions6m,
    contactsWithTasks,
    contactsWithEvents,
    engagementRate,
    closedWonOpps12m,
    oppsWithFollowUp,
    stewardshipRate,
  };
}
