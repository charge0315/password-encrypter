import { Orchestrator } from './dist/agent/orchestrator.js';
import { parsePasswordCSV } from './dist/core/csv-parser.js';
import fs from 'node:fs';

import { config as dotenvConfig } from 'dotenv';
dotenvConfig({ path: '.env.example' });

const csvContent = fs.readFileSync('test5.csv', 'utf8');
const entries = parsePasswordCSV(csvContent);

const orch = new Orchestrator({
   geminiApiKey: process.env.GEMINI_API_KEY
});
orch.setEntries(entries);
await orch.checkBreaches();
orch.generateNewPasswords();

console.log('--- Starting executeBatchChange ---');
const results = await orch.executeBatchChange();

console.log('\n--- RESULTS ---');
for (const res of results) {
   console.log(`- Domain: ${res.domain}`);
   console.log(`  Success: ${res.success}`);
   console.log(`  Method: ${res.method}`);
   console.log(`  Error: ${res.error}`);
}
process.exit(0);
