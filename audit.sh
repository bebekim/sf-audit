#!/bin/bash
# Run the Salesforce nonprofit CRM audit
cd "$(dirname "$0")"
npx tsx src/cli.ts baseline ./output
