/**
 * Phase 3: Migration plan — deterministic field mappings.
 *
 * Maps Salesforce objects/fields to NanoClaw PostgreSQL tables/columns.
 * Known objects get direct mappings. Custom objects are flagged for
 * agent review (skip, tags, new table, or JSONB).
 */
import {
  DiscoveryResult,
  ObjectDiscovery,
  MigrationPlan,
  ObjectMapping,
  FieldMapping,
  TransformType,
  ObjectMappingType,
} from './types.js';

// ---------------------------------------------------------------------------
// Known object → table mappings
// ---------------------------------------------------------------------------

interface KnownMapping {
  pgTable: string;
  mappingType: ObjectMappingType;
  filter?: string;
  fields: Record<string, KnownFieldMapping>;
}

interface KnownFieldMapping {
  pgField: string;
  pgType: string;
  transform: TransformType;
  notes?: string;
}

const KNOWN_OBJECT_MAPPINGS: Record<string, KnownMapping> = {
  Contact: {
    pgTable: 'contacts',
    mappingType: 'direct',
    fields: {
      FirstName: { pgField: 'first_name', pgType: 'varchar(100)', transform: 'direct' },
      LastName: { pgField: 'last_name', pgType: 'varchar(100)', transform: 'direct' },
      Email: { pgField: 'email', pgType: 'varchar(254)', transform: 'direct' },
      Phone: { pgField: 'phone', pgType: 'varchar(20)', transform: 'direct' },
      MailingStreet: { pgField: 'address_line1', pgType: 'varchar(200)', transform: 'direct' },
      MailingCity: { pgField: 'suburb', pgType: 'varchar(100)', transform: 'direct' },
      MailingState: { pgField: 'state', pgType: 'varchar(3)', transform: 'direct' },
      MailingPostalCode: { pgField: 'postcode', pgType: 'varchar(4)', transform: 'direct' },
      Description: { pgField: 'notes', pgType: 'text', transform: 'direct' },
      CreatedDate: { pgField: 'created_at', pgType: 'timestamptz', transform: 'date_convert' },
      LastModifiedDate: { pgField: 'updated_at', pgType: 'timestamptz', transform: 'date_convert' },
    },
  },
  Account: {
    pgTable: 'organisations',
    mappingType: 'direct',
    fields: {
      Name: { pgField: 'name', pgType: 'varchar(200)', transform: 'direct' },
      Type: { pgField: 'org_type', pgType: 'varchar(30)', transform: 'direct' },
      Phone: { pgField: 'phone', pgType: 'varchar(20)', transform: 'direct' },
      Website: { pgField: 'website', pgType: 'varchar(500)', transform: 'direct' },
      BillingStreet: { pgField: 'address_line1', pgType: 'varchar(200)', transform: 'direct' },
      BillingCity: { pgField: 'suburb', pgType: 'varchar(100)', transform: 'direct' },
      BillingState: { pgField: 'state', pgType: 'varchar(3)', transform: 'direct' },
      BillingPostalCode: { pgField: 'postcode', pgType: 'varchar(4)', transform: 'direct' },
      Description: { pgField: 'notes', pgType: 'text', transform: 'direct' },
      CreatedDate: { pgField: 'created_at', pgType: 'timestamptz', transform: 'date_convert' },
      LastModifiedDate: { pgField: 'updated_at', pgType: 'timestamptz', transform: 'date_convert' },
    },
  },
  'npe5__Affiliation__c': {
    pgTable: 'contact_org_links',
    mappingType: 'direct',
    fields: {
      'npe5__Contact__c': { pgField: 'contact_id', pgType: 'uuid', transform: 'lookup_remap' },
      'npe5__Organization__c': { pgField: 'org_id', pgType: 'uuid', transform: 'lookup_remap' },
      'npe5__Role__c': { pgField: 'role', pgType: 'varchar(100)', transform: 'direct' },
      'npe5__Primary__c': { pgField: 'is_primary', pgType: 'boolean', transform: 'direct' },
      CreatedDate: { pgField: 'created_at', pgType: 'timestamptz', transform: 'date_convert' },
    },
  },
  'npe4__Relationship__c': {
    pgTable: 'contact_relationships',
    mappingType: 'direct',
    fields: {
      'npe4__Contact__c': { pgField: 'contact_id', pgType: 'uuid', transform: 'lookup_remap' },
      'npe4__RelatedContact__c': { pgField: 'related_contact_id', pgType: 'uuid', transform: 'lookup_remap' },
      'npe4__Type__c': { pgField: 'type', pgType: 'varchar(50)', transform: 'direct' },
      'npe4__ReciprocalRelationship__c': {
        pgField: 'reciprocal_type',
        pgType: 'varchar(50)',
        transform: 'direct',
        notes: 'Derived from reciprocal relationship record type',
      },
      'npe4__Status__c': { pgField: 'status', pgType: 'varchar(20)', transform: 'direct' },
      CreatedDate: { pgField: 'created_at', pgType: 'timestamptz', transform: 'date_convert' },
      LastModifiedDate: { pgField: 'updated_at', pgType: 'timestamptz', transform: 'date_convert' },
    },
  },
  Opportunity: {
    pgTable: 'donations',
    mappingType: 'filtered',
    filter: "StageName = 'Closed Won'",
    fields: {
      'npsp__Primary_Contact__c': { pgField: 'contact_id', pgType: 'uuid', transform: 'lookup_remap', notes: 'NPSP primary contact, falls back to AccountId → org contact' },
      Amount: { pgField: 'amount', pgType: 'decimal(12,2)', transform: 'direct' },
      CloseDate: { pgField: 'donation_date', pgType: 'date', transform: 'date_convert' },
      'npsp__Payment_Method__c': { pgField: 'method', pgType: 'varchar(20)', transform: 'direct' },
      Description: { pgField: 'description', pgType: 'text', transform: 'direct' },
      CampaignId: { pgField: 'campaign', pgType: 'varchar(100)', transform: 'lookup_remap', notes: 'Resolved to campaign name' },
      'npe03__Recurring_Donation__c': { pgField: 'recurring_id', pgType: 'uuid', transform: 'lookup_remap' },
      CreatedDate: { pgField: 'created_at', pgType: 'timestamptz', transform: 'date_convert' },
      LastModifiedDate: { pgField: 'updated_at', pgType: 'timestamptz', transform: 'date_convert' },
    },
  },
  'npe03__Recurring_Donation__c': {
    pgTable: 'recurring_donations',
    mappingType: 'direct',
    fields: {
      'npe03__Contact__c': { pgField: 'contact_id', pgType: 'uuid', transform: 'lookup_remap' },
      'npe03__Amount__c': { pgField: 'amount', pgType: 'decimal(12,2)', transform: 'direct' },
      'npe03__Installment_Period__c': { pgField: 'frequency', pgType: 'varchar(20)', transform: 'direct' },
      'npe03__Date_Established__c': { pgField: 'start_date', pgType: 'date', transform: 'date_convert' },
      'npsp__EndDate__c': { pgField: 'end_date', pgType: 'date', transform: 'date_convert' },
      'npsp__Next_Payment_Date__c': { pgField: 'next_expected_date', pgType: 'date', transform: 'date_convert' },
      'npsp__Status__c': { pgField: 'status', pgType: 'varchar(20)', transform: 'direct' },
      CreatedDate: { pgField: 'created_at', pgType: 'timestamptz', transform: 'date_convert' },
      LastModifiedDate: { pgField: 'updated_at', pgType: 'timestamptz', transform: 'date_convert' },
    },
  },
};

// ---------------------------------------------------------------------------
// Plan generation
// ---------------------------------------------------------------------------

function mapKnownObject(
  obj: ObjectDiscovery,
  known: KnownMapping,
): ObjectMapping {
  const fields: FieldMapping[] = [];

  for (const sfField of obj.fields) {
    const knownField = known.fields[sfField.name];
    if (knownField) {
      fields.push({
        sfField: sfField.name,
        sfType: sfField.type,
        pgField: knownField.pgField,
        pgType: knownField.pgType,
        transform: knownField.transform,
        nullable: sfField.nillable,
        notes: knownField.notes ?? '',
      });
    }
    // Unknown fields on known objects are silently skipped
  }

  return {
    sfObject: obj.name,
    pgTable: known.pgTable,
    mappingType: known.mappingType,
    filter: known.filter,
    fields,
    notes: '',
  };
}

function mapUnknownObject(obj: ObjectDiscovery): ObjectMapping {
  // Default: skip custom objects. Agent can override in plan review.
  return {
    sfObject: obj.name,
    pgTable: '',
    mappingType: 'skip',
    fields: [],
    notes: `Custom object with ${obj.recordCount} records. Agent should review: new table, tags, JSONB, or skip.`,
  };
}

/**
 * Generate a migration plan from discovery results.
 */
export function generatePlan(discovery: DiscoveryResult): MigrationPlan {
  const objectMappings: ObjectMapping[] = [];
  const warnings: string[] = [];
  let estimatedRecords = 0;

  for (const obj of discovery.objects) {
    const known = KNOWN_OBJECT_MAPPINGS[obj.name];
    if (known) {
      const mapping = mapKnownObject(obj, known);
      objectMappings.push(mapping);
      estimatedRecords += obj.recordCount;
    } else {
      objectMappings.push(mapUnknownObject(obj));
    }
  }

  if (discovery.circularDependencies.length > 0) {
    warnings.push(
      `Circular required dependencies found: ${discovery.circularDependencies.map((c) => c.join(' → ')).join('; ')}. Two-pass insert required.`,
    );
  }

  if (discovery.unmappedObjects.length > 0) {
    warnings.push(
      `${discovery.unmappedObjects.length} custom objects have no automatic mapping: ${discovery.unmappedObjects.join(', ')}`,
    );
  }

  return {
    timestamp: new Date().toISOString(),
    discoveryFile: 'discovery.json',
    objectMappings,
    insertionOrder: discovery.insertionOrder,
    estimatedRecords,
    warnings,
  };
}
