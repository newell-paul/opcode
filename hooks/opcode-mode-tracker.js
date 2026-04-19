#!/usr/bin/env node
// opcode — UserPromptSubmit hook
//
// On every prompt:
//   1. Detect deactivation → delete flag
//   2. Detect activation triggers → write flag
//   3. When flag active → emit additionalContext reinforcement

'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');

const claudeDir = process.env.CLAUDE_CONFIG_DIR || path.join(os.homedir(), '.claude');
const flagPath = path.join(claudeDir, '.opcode-active');

function readFlag(p) {
  try {
    const stat = fs.lstatSync(p);
    if (stat.isSymbolicLink() || stat.size > 64) return null;
    return fs.readFileSync(p, 'utf8').trim() === 'active' ? 'active' : null;
  } catch (e) { return null; }
}

function writeFlag(p) {
  try { fs.writeFileSync(p, 'active', { flag: 'w', mode: 0o600 }); } catch (e) {}
}

function deleteFlag(p) {
  try { fs.unlinkSync(p); } catch (e) {}
}

function isActivation(prompt) {
  if (/^\/asm\b/i.test(prompt)) return true;
  if (/\bassemble\b/i.test(prompt)) return true;
  if (/\b\w+\.s\b/.test(prompt)) return true;
  if (/^(lda|jsr|brk|rts)\b/i.test(prompt)) return true;
  return false;
}

function isDeactivation(prompt) {
  if (/\b(stop|exit|disable|deactivate)\s+opcode\b/i.test(prompt)) return true;
  if (/\bnormal\s+mode\b/i.test(prompt)) return true;
  return false;
}

let input = '';
process.stdin.on('data', chunk => { input += chunk; });
process.stdin.on('end', () => {
  try {
    const data = JSON.parse(input);
    const prompt = (data.prompt || '').trim();

    // Deactivation wins over activation if both match
    if (isDeactivation(prompt.toLowerCase())) {
      deleteFlag(flagPath);
      process.exit(0);
    }

    if (isActivation(prompt)) {
      writeFlag(flagPath);
    }

    if (readFlag(flagPath)) {
      process.stdout.write(JSON.stringify({
        hookSpecificOutput: {
          hookEventName: 'UserPromptSubmit',
          additionalContext:
            'OPCODE MODE ACTIVE. All responses must be valid 6502 assembly trace. ' +
            'No prose outside directives (.NOTE .ERR .ASK .DIFF). ' +
            'Respond in assembly or halt with BRK.'
        }
      }));
    }
  } catch (e) {
    // Silent fail — never block the user's prompt
  }
});
