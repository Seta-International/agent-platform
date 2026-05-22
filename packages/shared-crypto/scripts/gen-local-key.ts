#!/usr/bin/env node
import { randomBytes } from 'node:crypto';

const hex = randomBytes(32).toString('hex');
process.stdout.write(`${hex}\n`);
