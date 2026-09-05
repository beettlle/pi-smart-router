/** @type {import('eslint').Linter.Config} */
module.exports = {
  root: true,
  env: {
    es2022: true,
    node: true,
  },
  parser: '@typescript-eslint/parser',
  parserOptions: {
    ecmaVersion: 'latest',
    sourceType: 'module',
  },
  plugins: ['@typescript-eslint'],
  extends: [
    'eslint:recommended',
    'plugin:@typescript-eslint/recommended',
  ],
  // ESLint ignores dot-directories by default; re-include the extension
  // tree (gitignore semantics: negate each parent level) so the deep-import
  // guard below actually runs on `.pi/extensions/**` in `npm run lint`/CI.
  ignorePatterns: [
    'dist/',
    'node_modules/',
    'coverage/',
    '!.pi/',
    '.pi/loops/',
    '.pi/tasks/',
  ],
  overrides: [
    {
      files: [
        'src/domain/**/*.ts',
        'src/infrastructure/**/*.ts',
        'src/api/**/*.ts',
        'src/config/**/*.ts',
        '.pi/extensions/**/*.ts',
      ],
      rules: {
        '@typescript-eslint/no-explicit-any': 'error',
      },
    },
    {
      // SP-257 / #149: extensions must consume the public facade
      // (`../../../src/index.js`) only. Deep src subpath imports regressed
      // once already; fail closed on any new one.
      files: ['.pi/extensions/**/*.ts'],
      rules: {
        // Extension files were never linted before SP-257 (dot-directory
        // default ignore); allow the idiomatic `while (true)` failover loop
        // in route-and-delegate.ts rather than rewriting runtime logic here.
        'no-constant-condition': ['error', { checkLoops: false }],
        'no-restricted-imports': [
          'error',
          {
            patterns: [
              {
                group: ['../../../src/*/**', '../../../src/!(index).js'],
                message:
                  'Deep src imports are not allowed from extensions. Import from the public facade instead: ../../../src/index.js',
              },
            ],
          },
        ],
      },
    },
  ],
};
