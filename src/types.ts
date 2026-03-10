/**
 * Type definitions for the Salesforce CRM Audit module.
 *
 * Every data shape exchanged between modules is defined here.
 * The agent never sees this file but it ensures all modules
 * agree on structure.
 */

// ---------------------------------------------------------------------------
// Salesforce API
// ---------------------------------------------------------------------------

export interface SFQueryResult {
  totalSize: number;
  done: boolean;
  records: Record<string, unknown>[];
}

export interface SFDescribeResult {
  name: string;
  label: string;
  custom: boolean;
  fields: SFFieldDescribe[];
  recordTypeInfos?: Array<{ name: string; active: boolean }>;
  childRelationships?: Array<{ childSObject: string; field: string }>;
}

export interface SFFieldDescribe {
  name: string;
  label: string;
  type: string;
  custom: boolean;
  nillable: boolean;
  referenceTo?: string[];
  picklistValues?: Array<{ value: string; active: boolean }>;
}

export interface SFGlobalDescribe {
  sobjects: Array<{
    name: string;
    label: string;
    custom: boolean;
    queryable: boolean;
    keyPrefix: string | null;
  }>;
}

export interface SFLimits {
  DailyApiRequests: { Max: number; Remaining: number };
  DataStorageMB: { Max: number; Remaining: number };
  FileStorageMB: { Max: number; Remaining: number };
  [key: string]: { Max: number; Remaining: number };
}

export interface SFPackage {
  NamespacePrefix: string | null;
  Name: string;
}

// ---------------------------------------------------------------------------
// Query Errors
// ---------------------------------------------------------------------------

export interface QueryError {
  queryId: string;
  category: string;
  error: string;
  timestamp: string;
}

// ---------------------------------------------------------------------------
// Orientation Results
// ---------------------------------------------------------------------------

export interface OrientationResults {
  totalObjects: number;
  customObjects: Array<{ name: string; label: string }>;
  standardObjectCounts: Record<string, number>;
  customObjectCounts: Record<string, number>;
  packages: SFPackage[];
  npspDetected: boolean;
  v4sDetected: boolean;
  npcDetected: boolean;
  totalUsers: number;
  activeUsers: number;
  totalContacts: number;
  totalAccounts: number;
  limits: SFLimits | null;
  apiUsagePercent: number | null;
  storageUsedPercent: number | null;
  profileCount: number;
  permissionSetCount: number;
  contentDocumentCount: number;
}

// ---------------------------------------------------------------------------
// Adoption Results
// ---------------------------------------------------------------------------

export interface LoginRecord {
  userId: string;
  loginCount: number;
  lastLogin: string;
  platform?: string;
  browser?: string;
}

export interface AdoptionResults {
  logins6m: LoginRecord[];
  activeUserCount: number;
  totalLicensedUsers: number;
  adoptionRate: number;
  topCreatorContact: { userId: string; count: number } | null;
  topCreatorOpportunity: { userId: string; count: number } | null;
  creationConcentration: number;
  reportUsage: number;
  dashboardUsage: number;
  setupChanges6m: number;
  setupChangeUsers: number;
  lastSetupChange: string | null;
  adminGone: boolean;
}

// ---------------------------------------------------------------------------
// Relationship Activity Results
// ---------------------------------------------------------------------------

export interface RelationshipResults {
  tasks6m: number;
  events6m: number;
  emailMessages6m: number;
  notes6m: number;
  totalInteractions6m: number;
  contactsWithTasks: number;
  contactsWithEvents: number;
  engagementRate: number;
  closedWonOpps12m: number;
  oppsWithFollowUp: number;
  stewardshipRate: number;
}

// ---------------------------------------------------------------------------
// Data Health Results
// ---------------------------------------------------------------------------

export interface DataHealthResults {
  totalContacts: number;
  contactsFresh6m: number;
  contactsFresh12m: number;
  freshnessRate6m: number;
  freshnessRate12m: number;
  contactsWithEmail: number;
  contactsWithPhone: number;
  contactsWithAddress: number;
  emailCompletenessRate: number;
  duplicateEmails: number;
  duplicateRate: number;
  contactsNeverModified: number;
  neverModifiedRate: number;
  opportunityBurstiness: number;
  burstyMonths: number;
  totalMonthsChecked: number;
  fieldFillRates: Array<{
    objectName: string;
    fieldName: string;
    fillRate: number;
    sampleSize: number;
  }>;
}

// ---------------------------------------------------------------------------
// Fundraising Results
// ---------------------------------------------------------------------------

export interface DonationByType {
  recordType: string;
  count: number;
  totalAmount: number;
}

export interface MonthlyDonation {
  year: number;
  month: number;
  count: number;
}

export interface FundraisingResults {
  donationsByType: DonationByType[];
  totalDonations: number;
  totalDonationAmount: number;
  monthlyDonations: MonthlyDonation[];
  activeCampaigns: number;
  campaignMembers6m: number;
  recurringDonationsActive: number;
  npspFeatureUsage: Record<string, boolean>;
  npspFeaturesUsed: number;
  npspFeaturesTotal: number;
}

// ---------------------------------------------------------------------------
// Volunteer Results
// ---------------------------------------------------------------------------

export interface VolunteerResults {
  activeVolunteers: number;
  hoursLogged6m: number;
  totalHoursWorked6m: number;
  activeJobs: number;
  volunteersWithNoHours12m: number;
  volunteerUtilisationRate: number;
}

// ---------------------------------------------------------------------------
// Customisation Results
// ---------------------------------------------------------------------------

export interface CustomObjectDetail {
  name: string;
  label: string;
  recordCount: number;
  customFieldCount: number;
}

export interface CustomisationResults {
  customObjectDetails: CustomObjectDetail[];
  emptyCustomObjects: number;
  totalCustomFields: number;
  maxCustomFieldsOnObject: { objectName: string; count: number } | null;
  activeFlows: number;
  activeValidationRules: number;
  activeWorkflowRules: number;
  staleAutomations: number;
}

// ---------------------------------------------------------------------------
// Integration Results
// ---------------------------------------------------------------------------

export interface IntegrationResults {
  connectedApps: Array<{ name: string; description: string | null }>;
  installedPackages: SFPackage[];
  packageCategories: {
    crm: string[];
    email: string[];
    forms: string[];
    volunteer: string[];
    reporting: string[];
    other: string[];
  };
  totalIntegrations: number;
}

// ---------------------------------------------------------------------------
// Baseline Results (assembled output of all query modules)
// ---------------------------------------------------------------------------

export interface BaselineResults {
  timestamp: string;
  apiVersion: string;
  orientation: OrientationResults | null;
  adoption: AdoptionResults | null;
  relationship: RelationshipResults | null;
  dataHealth: DataHealthResults | null;
  fundraising: FundraisingResults | null;
  volunteers: VolunteerResults | null;
  customisation: CustomisationResults | null;
  integration: IntegrationResults | null;
  errors: QueryError[];
  queriesAttempted: number;
  queriesSucceeded: number;
  aborted: boolean;
  abortReason: string | null;
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

export type ValidationSeverity = 'INFO' | 'WARNING' | 'CRITICAL';

export interface ValidationFinding {
  check: string;
  severity: ValidationSeverity;
  message: string;
  category: 'invariant' | 'plausibility' | 'completeness';
}

export interface ValidationReport {
  findings: ValidationFinding[];
  invariantViolations: number;
  plausibilityWarnings: number;
  completenessGaps: number;
  recommendAbort: boolean;
  abortReason: string | null;
  categoryCompleteness: Record<string, number>;
}

// ---------------------------------------------------------------------------
// Scoring
// ---------------------------------------------------------------------------

export type Verdict = 'KEEP' | 'OPTIMISE' | 'SIMPLIFY' | 'MIGRATE';
export type Confidence = 'HIGH' | 'MEDIUM' | 'LOW';
export type FindingSeverity = 'INFO' | 'WARNING' | 'CRITICAL';

export interface ScoreFinding {
  category: string;
  severity: FindingSeverity;
  message: string;
  evidence: string;
}

export interface CategoryScore {
  name: string;
  score: number;
  weight: number;
  findings: ScoreFinding[];
}

export interface AuditScore {
  overall: number;
  verdict: Verdict;
  confidence: Confidence;
  categories: CategoryScore[];
  findings: ScoreFinding[];
  queriesAttempted: number;
  queriesSucceeded: number;
  validationIssues: number;
}

// ---------------------------------------------------------------------------
// Prescription
// ---------------------------------------------------------------------------

export type CapabilityStatus = 'working' | 'struggling' | 'unused' | 'missing';

export interface Capability {
  name: string;
  currentStatus: CapabilityStatus;
  currentEvidence: string;
  nanoclawAlternative: string;
}

export interface MigrationEstimate {
  objectName: string;
  recordCount: number;
  complexity: 'low' | 'medium' | 'high';
  notes: string;
}

export interface Prescription {
  orgType: string;
  orgTypeConfidence: number;
  primaryOperation: string;
  capabilities: Capability[];
  estimatedCurrentMonthlyCost: number;
  estimatedNanoclawMonthlyCost: number;
  estimatedAnnualSavings: number;
  migrationEstimate: {
    totalObjects: number;
    totalRecords: number;
    estimatedWorkingDays: number;
    objects: MigrationEstimate[];
  };
  leaveBehinds: string[];
}

// ---------------------------------------------------------------------------
// Curiosity Engine
// ---------------------------------------------------------------------------

export interface CuriosityQuestion {
  id: string;
  query: string;
  queryType: 'soql' | 'describe' | 'tooling';
  priority: number;
  trigger: string;
  category: string;
}

export interface CuriosityObservation {
  questionId: string | null;
  section: string;
  observation: string;
  inference: string;
  timestamp: string;
}

export interface UnderstandingModel {
  identity: { description: string; confidence: number };
  adoption: { description: string; confidence: number };
  fit: { description: string; confidence: number };
  health: { description: string; confidence: number };
  dependency: { description: string; confidence: number };
}

export interface CuriosityState {
  questions: CuriosityQuestion[];
  observations: CuriosityObservation[];
  understanding: UnderstandingModel;
  questionsAsked: number;
  budget: number;
}
