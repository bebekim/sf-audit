#!/usr/bin/env node
/**
 * CLI entry point — what the NanoClaw container agent calls via bash.
 *
 * Commands:
 *   baseline              Run full baseline audit (all queries + score + prescription)
 *   score <file>          Score an existing baseline results JSON file
 *   query "<soql>"        Run a single SOQL query (for Phase 2 agent exploration)
 *   describe <object>     Describe a Salesforce object
 *   describe-global       List all objects in the org
 *   limits                Show API limits
 *   packages              List installed packages
 *
 * All output is JSON to stdout. The agent parses it.
 *
 * Config: reads SF_ACCESS_TOKEN and SF_INSTANCE_URL from environment
 * or from /config/salesforce.json (container mount).
 */
import fs from 'node:fs';
import { SalesforceClient, runBaseline, validate, score, prescribe } from './audit/index.js';
import type { QueryError } from './audit/types.js';
import { discover } from './migration/discovery.js';
import { generatePlan } from './migration/plan.js';

interface SFConfig {
  accessToken: string;
  instanceUrl: string;
}

function loadDotEnv(): void {
  // Load .env file if it exists (no dependency needed)
  const envPaths = ['.env', '../.env'];
  for (const envPath of envPaths) {
    if (fs.existsSync(envPath)) {
      const content = fs.readFileSync(envPath, 'utf-8');
      for (const line of content.split('\n')) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) continue;
        const eqIdx = trimmed.indexOf('=');
        if (eqIdx === -1) continue;
        const key = trimmed.slice(0, eqIdx).trim();
        let val = trimmed.slice(eqIdx + 1).trim();
        // Strip surrounding quotes
        if ((val.startsWith('"') && val.endsWith('"')) ||
            (val.startsWith("'") && val.endsWith("'"))) {
          val = val.slice(1, -1);
        }
        if (!process.env[key]) {
          process.env[key] = val;
        }
      }
      break;
    }
  }
}

function loadConfig(): SFConfig {
  // Load .env file first
  loadDotEnv();

  // Try environment variables
  if (process.env.SF_ACCESS_TOKEN && process.env.SF_INSTANCE_URL) {
    return {
      accessToken: process.env.SF_ACCESS_TOKEN,
      instanceUrl: process.env.SF_INSTANCE_URL,
    };
  }

  // Try config file (container mount)
  const configPaths = [
    '/config/salesforce.json',
    './salesforce.json',
  ];

  for (const configPath of configPaths) {
    if (fs.existsSync(configPath)) {
      const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
      return {
        accessToken: config.accessToken || config.access_token,
        instanceUrl: config.instanceUrl || config.instance_url,
      };
    }
  }

  throw new Error(
    'No Salesforce credentials found. Set SF_ACCESS_TOKEN and SF_INSTANCE_URL, ' +
    'or provide a salesforce.json config file.',
  );
}

function output(data: unknown): void {
  console.log(JSON.stringify(data, null, 2));
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const command = args[0];

  if (!command || command === '--help') {
    output({
      commands: {
        baseline: 'Run full baseline audit',
        score: 'Score an existing baseline results file',
        query: 'Run a single SOQL query',
        describe: 'Describe a Salesforce object',
        'describe-global': 'List all objects',
        limits: 'Show API limits',
        packages: 'List installed packages',
        'migrate discover': 'Discover schema and build dependency graph',
        'migrate plan': 'Generate migration plan from discovery results',
        'migrate status': 'Show migration state',
      },
      config: 'Set SF_ACCESS_TOKEN and SF_INSTANCE_URL env vars, or provide salesforce.json',
    });
    return;
  }

  // Score command doesn't need SF credentials
  if (command === 'score') {
    const filePath = args[1];
    if (!filePath) {
      console.error('Usage: sf-audit score <baseline-results.json>');
      process.exit(1);
    }
    const results = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    const validation = validate(results);
    const scores = score(results, validation);
    const prescription = prescribe(results, scores);
    output({ validation, scores, prescription });
    return;
  }

  const config = loadConfig();
  const client = new SalesforceClient(config.accessToken, config.instanceUrl);

  switch (command) {
    case 'baseline': {
      const results = await runBaseline(client);
      const validation = validate(results);
      const scores = score(results, validation);
      const prescription = prescribe(results, scores);

      // Write individual files if output directory specified
      const outputDir = args[1] || '.';
      if (outputDir !== '.') {
        fs.mkdirSync(outputDir, { recursive: true });
      }
      fs.writeFileSync(
        `${outputDir}/baseline-results.json`,
        JSON.stringify(results, null, 2),
      );
      fs.writeFileSync(
        `${outputDir}/validation-report.json`,
        JSON.stringify(validation, null, 2),
      );
      fs.writeFileSync(
        `${outputDir}/audit-score.json`,
        JSON.stringify(scores, null, 2),
      );
      fs.writeFileSync(
        `${outputDir}/prescription.json`,
        JSON.stringify(prescription, null, 2),
      );

      // Also output summary to stdout
      output({
        overall: scores.overall,
        verdict: scores.verdict,
        confidence: scores.confidence,
        categories: scores.categories.map((c) => ({
          name: c.name,
          score: c.score,
        })),
        findingCount: scores.findings.length,
        criticalFindings: scores.findings
          .filter((f) => f.severity === 'CRITICAL')
          .map((f) => f.message),
        prescription: {
          orgType: prescription.primaryOperation,
          currentCost: `$${prescription.estimatedCurrentMonthlyCost}/month`,
          proposedCost: `$${prescription.estimatedNanoclawMonthlyCost}/month`,
          annualSavings: `$${prescription.estimatedAnnualSavings}`,
          migrationDays: prescription.migrationEstimate.estimatedWorkingDays,
        },
        queriesAttempted: results.queriesAttempted,
        queriesSucceeded: results.queriesSucceeded,
        errors: results.errors.length,
        files: [
          'baseline-results.json',
          'validation-report.json',
          'audit-score.json',
          'prescription.json',
        ],
      });
      break;
    }

    case 'query': {
      const soql = args[1];
      if (!soql) {
        console.error('Usage: sf-audit query "SELECT ..."');
        process.exit(1);
      }
      const result = await client.query(soql);
      output(result);
      break;
    }

    case 'describe': {
      const objectName = args[1];
      if (!objectName) {
        console.error('Usage: sf-audit describe ObjectName');
        process.exit(1);
      }
      const desc = await client.describeObject(objectName);
      // Truncate fields for readability
      const truncated = {
        name: desc.name,
        label: desc.label,
        custom: desc.custom,
        fieldCount: desc.fields.length,
        customFieldCount: desc.fields.filter((f) => f.custom).length,
        fields: desc.fields.slice(0, 80).map((f) => ({
          name: f.name,
          label: f.label,
          type: f.type,
          custom: f.custom,
          referenceTo: f.referenceTo,
        })),
        truncated: desc.fields.length > 80,
        remainingFields: Math.max(0, desc.fields.length - 80),
        recordTypes: desc.recordTypeInfos?.filter((r) => r.active),
      };
      output(truncated);
      break;
    }

    case 'describe-global': {
      const global = await client.describeGlobal();
      output({
        totalObjects: global.sobjects.length,
        queryableObjects: global.sobjects.filter((o) => o.queryable).length,
        customObjects: global.sobjects
          .filter((o) => o.custom && o.queryable)
          .map((o) => ({ name: o.name, label: o.label })),
      });
      break;
    }

    case 'limits': {
      const limits = await client.getLimits();
      output(limits);
      break;
    }

    case 'packages': {
      const result = await client.toolingQuery(
        'SELECT Id, SubscriberPackage.NamespacePrefix, SubscriberPackage.Name FROM InstalledSubscriberPackage',
      );
      output(result.records);
      break;
    }

    case 'migrate': {
      const subCommand = args[1];

      if (subCommand === 'discover') {
        const outputDir = args[2] || '.';
        if (outputDir !== '.') {
          fs.mkdirSync(outputDir, { recursive: true });
        }

        const errors: QueryError[] = [];
        const discovery = await discover(client, errors);

        if (!discovery) {
          output({ error: 'Discovery failed', errors });
          process.exit(1);
        }

        fs.writeFileSync(
          `${outputDir}/discovery.json`,
          JSON.stringify(discovery, null, 2),
        );

        output({
          objects: discovery.objects.length,
          totalRecords: discovery.objects.reduce((s, o) => s + o.recordCount, 0),
          levels: discovery.insertionOrder.length,
          insertionOrder: discovery.insertionOrder,
          circularDependencies: discovery.circularDependencies,
          unmappedObjects: discovery.unmappedObjects,
          errors: errors.length,
          file: `${outputDir}/discovery.json`,
        });

      } else if (subCommand === 'plan') {
        const discoveryPath = args[2] || './discovery.json';
        if (!fs.existsSync(discoveryPath)) {
          console.error(`Discovery file not found: ${discoveryPath}`);
          console.error('Run "sf-audit migrate discover" first.');
          process.exit(1);
        }

        const discovery = JSON.parse(fs.readFileSync(discoveryPath, 'utf-8'));
        const plan = generatePlan(discovery);

        const outputDir = args[3] || '.';
        if (outputDir !== '.') {
          fs.mkdirSync(outputDir, { recursive: true });
        }

        fs.writeFileSync(
          `${outputDir}/migration-plan.json`,
          JSON.stringify(plan, null, 2),
        );

        output({
          mappedObjects: plan.objectMappings.filter((m) => m.mappingType !== 'skip').length,
          skippedObjects: plan.objectMappings.filter((m) => m.mappingType === 'skip').length,
          estimatedRecords: plan.estimatedRecords,
          warnings: plan.warnings,
          file: `${outputDir}/migration-plan.json`,
        });

      } else if (subCommand === 'status') {
        // Check for existing discovery/plan files
        const discoveryExists = fs.existsSync('./discovery.json');
        const planExists = fs.existsSync('./migration-plan.json');

        output({
          discoveryComplete: discoveryExists,
          planComplete: planExists,
          nextStep: !discoveryExists
            ? 'Run: sf-audit migrate discover'
            : !planExists
              ? 'Run: sf-audit migrate plan'
              : 'Review migration-plan.json, then run: sf-audit migrate execute --confirm',
        });

      } else {
        console.error('Usage: sf-audit migrate <discover|plan|status>');
        process.exit(1);
      }
      break;
    }

    default:
      console.error(`Unknown command: ${command}`);
      console.error(
        'Valid commands: baseline, score, query, describe, describe-global, limits, packages, migrate',
      );
      process.exit(1);
  }
}

main().catch((err) => {
  console.error(JSON.stringify({ error: err.message }));
  process.exit(1);
});
