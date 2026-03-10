# SF-Audit Operations Manual

## Prerequisites

- Node.js >= 20
- Salesforce CLI (`sf`) installed at `~/sf-cli/bin/sf`
- A Salesforce org with API access

## Salesforce CLI

Installed at `~/sf-cli/` with symlink at `~/bin/sf`. PATH configured in `~/.bashrc`.

## Authentication

### First-time login

```bash
sf org login web --instance-url https://login.salesforce.com
```

This opens a browser. Log in with your Salesforce credentials.

### Get credentials for the audit tool

```bash
sf org display --target-org marcus.yh.kim.bd2d08f27f48@agentforce.com
```

Copy the **Access Token** and **Instance Url** from the output.

### Store credentials

Edit `sf-audit/.env`:

```
SF_ACCESS_TOKEN=<paste access token>
SF_INSTANCE_URL=<paste instance url>
```

**Important:** Session tokens expire after a few hours. When the audit fails with a 401 error, refresh:

```bash
sf org login web --instance-url https://login.salesforce.com
sf org display --target-org marcus.yh.kim.bd2d08f27f48@agentforce.com
```

Then update the token in `.env`.

## Running the Audit

```bash
cd sf-audit
npx tsx src/cli.ts baseline ./output
```

Output files are written to `sf-audit/output/`:

| File | Contents |
|------|----------|
| `baseline-results.json` | Raw query data from all 8 categories |
| `validation-report.json` | Data consistency checks |
| `audit-score.json` | Scored results with findings |
| `prescription.json` | NanoClaw alternative recommendation |

### Other commands

```bash
# Ad-hoc SOQL query
npx tsx src/cli.ts query "SELECT COUNT(Id) FROM Contact"

# Describe an object's fields and relationships
npx tsx src/cli.ts describe Account

# List all objects in the org
npx tsx src/cli.ts describe-global

# Check API limits
npx tsx src/cli.ts limits

# List installed packages
npx tsx src/cli.ts packages

# Re-score existing baseline without re-querying
npx tsx src/cli.ts score ./output/baseline-results.json
```

## Running Tests

```bash
cd sf-audit
npm test            # Run all 51 tests
npm run test:watch  # Watch mode
npm run typecheck   # TypeScript type checking only
```

## Dev Org Details

- **Username:** marcus.yh.kim.bd2d08f27f48@agentforce.com
- **Instance:** orgfarm-3a8bc81364-dev-ed.develop.my.salesforce.com
- **Edition:** Developer Edition with NPSP installed
- **API Version:** v59.0

## Known Limitations

- `ReportEvent` aggregate queries fail on Developer Edition (Big Object limitation) — handled gracefully, reports 0
- Session tokens expire after a few hours — must refresh via `sf org login web`
- The audit runs ~120 API calls; well within the 15,000/day Developer Edition limit
