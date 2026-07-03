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
  ignorePatterns: ['dist/', 'node_modules/', 'coverage/'],
  overrides: [
    {
      files: [
        'src/domain/**/*.ts',
        'src/infrastructure/**/*.ts',
        'src/api/**/*.ts',
        'src/config/**/*.ts',
      ],
      rules: {
        '@typescript-eslint/no-explicit-any': 'error',
      },
    },
  ],
};
