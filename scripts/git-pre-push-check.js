#!/usr/bin/env node
/**
 * Pre-push Safety Check
 * Verhindert Push, wenn versehentlich node_modules oder .next Dateien im Index landen.
 */
const { execSync } = require('node:child_process');

function stagedPaths(pattern) {
  try {
    const out = execSync('git diff --cached --name-only', { encoding: 'utf8' });
    return out.split(/\r?\n/).filter(l => l && pattern.test(l));
  } catch (e) {
    return [];
  }
}

const badNode = stagedPaths(/^node_modules\//);
const badNext = stagedPaths(/^\.next\//);

if (badNode.length || badNext.length) {
  console.error('\n✖ Push abgebrochen: Du hast versehentlich Build/Dependency Artefakte gestaged.');
  if (badNode.length) console.error('  node_modules Beispiele:', badNode.slice(0,5).join('\n    '));
  if (badNext.length) console.error('  .next Beispiele:', badNext.slice(0,5).join('\n    '));
  console.error('\nLösung:');
  console.error('  git reset HEAD node_modules .next');
  console.error('  ggf. erneut committen ohne diese Pfade.');
  process.exit(1);
}

process.exit(0);