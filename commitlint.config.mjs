export default {
  extends: ['@commitlint/config-conventional'],
  rules: {
    'scope-enum': [
      2,
      'always',
      ['contracts', 'core', 'widget', 'sdk', 'mock-psp', 'demo', 'sandbox', 'e2e', 'ci', 'repo'],
    ],
  },
};
