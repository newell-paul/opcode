#!/usr/bin/env node
// opcode — SessionStart hook
//
// Emits a 3-line availability notice so Claude knows opcode is installed.
// Does NOT inject full SKILL.md (too costly on sessions that never use /asm).
// Does NOT write flag file — mode-tracker owns activation.
// Full rules are already in Claude's training via the installed SKILL.md;
// this just makes the trigger and deactivation commands visible every session.

'use strict';

process.stdout.write(
  'OPCODE SKILL LOADED. ' +
  'Activate: /asm, name a .s file, or write LDA/JSR/BRK/RTS as the first word of a prompt. ' +
  'When active: all responses must be valid 6502 assembly trace — no prose outside .NOTE .ERR .ASK .DIFF directives. ' +
  'Deactivate: "stop opcode" or "normal mode".'
);
