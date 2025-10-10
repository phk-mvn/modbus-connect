// eslint.config.js
import js from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint'; // Helper для TS configs
import prettierConfig from 'eslint-config-prettier'; // Prettier object для composition
import prettierPlugin from 'eslint-plugin-prettier'; // Prettier plugin для rules/plugins

export default tseslint.config(
  // Global ignores (проект-wide)
  { ignores: ['dist/**', 'node_modules/**', '**/*.config.*'] },

  // Base JS recommended (applies to all)
  { ...js.configs.recommended },

  // TS recommended (spread array из helper, type-aware)
  ...tseslint.configs.recommended,

  // Prettier composition (spread object, disables conflicts)
  prettierConfig,

  // Custom config для TS файлов (Node/strict mode)
  {
    files: ['**/*.ts'],
    languageOptions: {
      parser: tseslint.parser, // TS parser
      parserOptions: {
        project: './tsconfig.json', // Для type-checking rules
        tsconfigRootDir: import.meta.dirname, // ESM path resolver
        ecmaVersion: 2022,
        sourceType: 'module', // ESM support
      },
      globals: globals.node, // Node globals (process, Buffer, etc.)
    },
    plugins: {
      '@typescript-eslint': tseslint.plugin, // TS plugin
      prettier: prettierPlugin, // Prettier plugin (явно импортирован)
    },
    rules: {
      // Strict TS rules (error на типах/unused)
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      '@typescript-eslint/no-explicit-any': 'warn', // Пока warn (пофиксим типами)
      '@typescript-eslint/require-await': 'off', // Async без await — ок
      'no-console': 'off', // Console warn в Node
      'prettier/prettier': 'error', // Prettier violations as errors
    },
  },

  // Отдельная конфигурация для JS файлов, где разрешен require
  {
    files: ['**/*.js'], // Паттерн для JS файлов (включая test-node.js)
    languageOptions: {
      // Убираем parserOptions.project, т.к. JS не требует tsconfig для type-checking
      // или добавь отдельную конфигурацию с project: null, если нужно
      ecmaVersion: 2022,
      sourceType: 'script', // или 'module', в зависимости от твоих JS файлов
      globals: { ...globals.node }, // Включаем Node.js глобальные переменные
    },
    rules: {
      // Отключаем правило, запрещающее require
      '@typescript-eslint/no-require-imports': 'off',
      // Можешь также отключить другие строгие правила, если они мешают
      // '@typescript-eslint/no-unused-vars': 'off', // Например, если в тестах много неиспользуемых переменных
    },
    // Плагины не обязательно указывать снова, если они уже в предыдущих конфигах
    // и не переопределяются.
  },

  // Отключение type-checked linting для .d.ts файлов
  {
    files: ['**/*.d.ts'],
    extends: [tseslint.configs.disableTypeChecked],
  }
);
