#!/usr/bin/env node
import { main } from './cli.js';

const color = process.stdout.isTTY && !process.env.NO_COLOR;
process.exitCode = await main(process.argv.slice(2), {
  stdout: (text) => process.stdout.write(text),
  stderr: (text) => process.stderr.write(text),
  color,
  interactive: process.stdin.isTTY,
});
