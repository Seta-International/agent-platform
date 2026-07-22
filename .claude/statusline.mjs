#!/usr/bin/env node
// Status line: "Model | ctx: N% | 5h: N% | 7d: N%"
// Reads the Claude Code status JSON on stdin (see `statusLine` in settings.json).
// Node rather than shell so it behaves the same on macOS, Ubuntu and Windows, where
// neither bash nor jq can be assumed. Never throws: a broken status line is worse than
// a sparse one, so any failure degrades to printing nothing.

let raw = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', (chunk) => {
  raw += chunk;
});
process.stdin.on('end', () => {
  try {
    const s = JSON.parse(raw);
    const pct = (v) => (typeof v === 'number' ? `${Math.round(v)}%` : null);

    const parts = [
      s.model?.display_name,
      // Absent for non-subscription accounts, and null before the first message.
      pct(s.context_window?.used_percentage) && `ctx: ${pct(s.context_window.used_percentage)}`,
      pct(s.rate_limits?.five_hour?.used_percentage) &&
        `5h: ${pct(s.rate_limits.five_hour.used_percentage)}`,
      pct(s.rate_limits?.seven_day?.used_percentage) &&
        `7d: ${pct(s.rate_limits.seven_day.used_percentage)}`,
    ].filter(Boolean);

    if (parts.length > 0) process.stdout.write(`${parts.join(' | ')}\n`);
  } catch {
    // Malformed or empty stdin — emit nothing rather than a broken line.
  }
});
