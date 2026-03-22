---
name: salesforce-audit
description: Audit a nonprofit's Salesforce CRM to assess fitness. Runs deterministic baseline queries, validates results, scores categories, generates prescription. Use when asked to audit, assess, or evaluate a Salesforce org.
allowed-tools: Bash(sf-audit:*)
---

# Salesforce CRM Fitness Audit

You have access to the `sf-audit` npm package installed in the container.

## Quick Start

```bash
# Full audit (baseline + validation + scoring + prescription)
npx sf-audit baseline /output

# Ad-hoc SOQL query
npx sf-audit query "SELECT COUNT(Id) FROM Contact"

# Describe an object (fields, relationships)
npx sf-audit describe Item__c

# List all objects in the org
npx sf-audit describe-global

# Check API limits
npx sf-audit limits

# List installed packages
npx sf-audit packages
```

## Two-Phase Methodology

### Phase 1: Deterministic Baseline (Automatic)
The `baseline` command runs ~80 SOQL queries across 8 categories:
- **Orientation**: Objects, packages, limits, users, record volumes
- **Adoption**: Login patterns, creation concentration, admin health
- **Relationship Activity**: Tasks, events, emails, engagement rate
- **Data Health**: Freshness, completeness, duplicates, burstiness
- **Fundraising**: Donations, campaigns, NPSP feature utilisation
- **Volunteers**: V4S usage, hours logged, utilisation rate
- **Customisation**: Custom objects, field counts, automation bloat
- **Integration**: Connected apps, package categories

Results are scored 0-100 per category, producing a weighted overall score and verdict:
- **KEEP** (70-100): Salesforce fits this org
- **OPTIMISE** (55-69): Right tool, needs cleanup
- **SIMPLIFY** (35-54): Over-tooled, simpler option would serve better
- **MIGRATE** (0-34): Actively losing value, should move

### Phase 2: Agent Investigation (You)
After running the baseline, read the output files:
- `/output/baseline-results.json` — raw query data
- `/output/validation-report.json` — data consistency checks
- `/output/audit-score.json` — scored results with findings
- `/output/prescription.json` — what NanoClaw alternative looks like

Then investigate anomalies. The baseline gives you numbers; your job is to understand WHY.

Use the `query` and `describe` commands to dig deeper:

1. **Custom objects with high record counts** — describe them, understand their purpose
2. **Single point of failure detected** — query what that user actually creates
3. **Low NPSP utilisation** — check if they're doing fundraising elsewhere
4. **Empty custom objects** — were they abandoned builds or staging?
5. **Bursty data entry** — is someone importing from spreadsheets?

### How to Think About Each Finding

For every finding from the baseline, ask:
- **What did I observe?** (the number)
- **What does it mean?** (the inference)
- **What question does this raise?** (the follow-up)
- **Does the follow-up change the verdict?** (the judgment)

### Budget Your Investigation
- Spend ~40% of your turns on orientation and understanding
- Spend ~40% on measuring and verifying
- Spend ~20% on following surprises
- Start wrapping up after 25 turns

## Report Format

Produce a CRM Fitness Report with:

1. **Score Summary**: Overall score, verdict, confidence level, category breakdown
2. **Key Findings**: Top 5-7 findings ranked by severity, with evidence
3. **Where You Are**: Honest assessment of current Salesforce usage
4. **Where You Could Be**: Prescription — what a purpose-built solution looks like for THIS org
5. **Cost Comparison**: Current estimated cost vs NanoClaw alternative
6. **Migration Scope**: What needs to move, how many records, estimated timeline
7. **Recommendation**: Clear next step based on verdict

## Critical Principles

- **Honesty over sales.** If Salesforce fits, say KEEP. The tool's credibility depends on honest verdicts.
- **NULL is not zero.** If a query failed, report "could not assess" not "zero activity."
- **Evidence over opinion.** Every claim needs a number or a query result behind it.
- **The org's perspective.** You're helping THEM understand THEIR system. Not selling anything.
