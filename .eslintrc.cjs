module.exports = {
  env: { browser: true, node: true, es2022: true },
  parserOptions: { ecmaVersion: 2022, sourceType: 'script' },
  globals: {
    AppUtils: 'readonly',
    api: 'readonly',
    document: 'readonly',
    window: 'readonly'
  },
  rules: {
    'no-unused-vars': 'warn',
    'no-console': 'off',
    eqeqeq: ['error', 'always', { null: 'ignore' }],
    // Существующий код проекта пишется без фигурных скобок у однострочных if.
    // Правило отключено, чтобы не блокировать работу над legacy-файлами.
    curly: 'off',
    strict: 'off',
    'no-eval': 'error',
    'no-implicit-globals': 'error'
  },
  ignorePatterns: ['node_modules/', 'dist/', 'package-lock.json']
};
