---
name: add-salesforce-audit
description: Add Salesforce CRM fitness audit capability. Lets the agent connect to a nonprofit's Salesforce org and produce a scored report on whether their CRM is the right fit.
---

# Add Salesforce Audit

This skill adds the Salesforce CRM audit capability to NanoClaw. When installed, the agent can connect to a nonprofit's Salesforce instance (via OAuth), run a comprehensive diagnostic, and produce a CRM Fitness Report with a verdict: KEEP, OPTIMISE, SIMPLIFY, or MIGRATE.

## What It Does

1. Installs `sf-audit` npm package in the container image
2. Creates a `salesforce-audit` group for dedicated audit sessions
3. Adds the container skill that teaches the agent how to use the audit tools
4. Sets up OAuth config storage for Salesforce credentials

## Phase 1: Pre-flight

### Verify sf-audit is available

```bash
npm info sf-audit version 2>/dev/null || echo "sf-audit not yet published to npm — install from git or local path"
```

## Phase 2: Configure Container Mounts

Add the sf-audit tools mount to the salesforce-audit group's container config.

In `groups/salesforce-audit/config.yaml`:

```yaml
name: salesforce-audit
containerConfig:
  additionalMounts:
    - hostPath: ./store/salesforce-config
      containerPath: /config
      readonly: true
  additionalPackages:
    - sf-audit
  timeout: 600000  # 10 minutes — audits take time
```

### Create config storage

```bash
mkdir -p store/salesforce-config
```

The user will need to create `store/salesforce-config/salesforce.json` with:

```json
{
  "accessToken": "your-salesforce-access-token",
  "instanceUrl": "https://your-instance.salesforce.com"
}
```

## Phase 3: Register the Group

Register the salesforce-audit group via the main WhatsApp group or directly in the database.

The group needs a `CLAUDE.md` at `groups/salesforce-audit/CLAUDE.md`:

```markdown
# Salesforce Audit Agent

You are a CRM fitness auditor for nonprofits. Your job is to assess whether
a nonprofit's Salesforce instance is the right tool for their needs.

## Available Tools

Run audits via bash:
- `npx sf-audit baseline /output` — Full audit
- `npx sf-audit query "SELECT ..."` — Ad-hoc SOQL
- `npx sf-audit describe ObjectName` — Object details
- `npx sf-audit describe-global` — All objects
- `npx sf-audit limits` — API limits

## Workflow

1. When asked to audit, run the baseline first
2. Review the scored results
3. Use the curiosity-driven approach: follow up on anomalies
4. Produce a clear, honest CRM Fitness Report
5. Be willing to say "KEEP" if Salesforce fits — honesty is the value prop
```

## Phase 4: Verify

Test by sending a message to the salesforce-audit group:

```
Run a CRM fitness audit
```

The agent should execute the baseline, produce scored results, and respond with a summary.

## OAuth Setup (User Instruction)

Tell the user:

1. Log into Salesforce → Setup → App Manager → New Connected App
2. Enable OAuth Settings
3. Callback URL: `http://localhost:8000/callback` (or any URL — we use the token directly)
4. Selected OAuth Scopes: `api`, `refresh_token`
5. Save → wait 5-10 minutes for propagation
6. Copy the Consumer Key and Consumer Secret
7. Generate an access token via the OAuth flow or use `sf org login web` from Salesforce CLI
8. Put the access token and instance URL in `store/salesforce-config/salesforce.json`
