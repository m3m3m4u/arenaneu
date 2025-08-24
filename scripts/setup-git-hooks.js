#!/usr/bin/env node
const { writeFileSync, mkdirSync, existsSync } = require('node:fs');
const { join } = require('node:path');

const gitDir = join(process.cwd(), '.git');
if (!existsSync(gitDir)) {
  console.log('Kein .git Verzeichnis – Hook Setup übersprungen.');
  process.exit(0);
}
const hooksDir = join(gitDir, 'hooks');
try { mkdirSync(hooksDir, { recursive: true }); } catch {}
const hookPath = join(hooksDir, 'pre-push');
const content = `#!/usr/bin/env bash\nnode scripts/git-pre-push-check.js\n`; // schlicht
writeFileSync(hookPath, content, { encoding: 'utf8' });
try { require('fs').chmodSync(hookPath, 0o755); } catch {}
console.log('pre-push Hook installiert.');