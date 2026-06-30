// Conventional Commits + required Jira key in the subject.
// Format: type(scope): FUT-123 subject   (key right after the colon)
// Exemptions: revert/merge commits and `deps`-scoped (dependabot) commits.

const JIRA_HEADER = /^\w+(\([\w$.\-*/ ]+\))?!?: [A-Z]+-\d+ .+/;

const jiraPlugin = {
  rules: {
    'jira-ticket': (parsed) => {
      const header = parsed.header ?? '';
      if (parsed.type === 'revert' || parsed.merge) return [true];
      if (/^Merge /.test(header) || /^Revert /.test(header)) return [true];
      if (parsed.scope === 'deps') return [true];
      return [
        JIRA_HEADER.test(header),
        'header must contain a Jira key right after the colon, e.g. "feat(planner): FUT-123 add group viewer"',
      ];
    },
  },
};

module.exports = {
  extends: ['@commitlint/config-conventional'],
  plugins: [jiraPlugin],
  rules: {
    'header-max-length': [2, 'always', 100],
    'subject-case': [0],
    'jira-ticket': [2, 'always'],
  },
};
