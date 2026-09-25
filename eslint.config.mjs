// eslint.config.js
import js from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint'; // Helper for TS configs
import prettierConfig from 'eslint-config-prettier'; // Prettier object for composition
import prettierPlugin from 'eslint-plugin-prettier'; // Prettier plugin for rules/plugins

export default tseslint.config(
  // Global ignores (project-wide)
  { ignores: ['dist/', 'node_modules/', '/*.config.*'] },

  // Base JS recommended (applies to all)
  { ...js.configs.recommended },

  // TS recommended (spread array from helper, type-aware)
  ...tseslint.configs.recommended,

  // Prettier composition (spread object, disables conflicts)
  prettierConfig,

  // Custom config for TS files (Node/strict mode)
  {
    files: ['**/*.ts'],
    languageOptions: {
      parser: tseslint.parser, // TS parser
      parserOptions: {
        project: './tsconfig.json', // For type-checking rules
        tsconfigRootDir: import.meta.dirname, // ESM path resolver
        ecmaVersion: 2022,
        sourceType: 'module', // ESM support
      },
      globals: globals.node, // Node globals (process, Buffer, etc.)
    },
    plugins: {
      '@typescript-eslint': tseslint.plugin, // TS plugin
      prettier: prettierPlugin, // Prettier plugin (explicitly imported)
    },
    rules: {
      // Strict TS rules (error on types/unused)
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      '@typescript-eslint/no-explicit-any': 'warn', // fix types
      '@typescript-eslint/require-await': 'off', // Async without await is ok
      'no-console': 'off', // Console warning in Node
      'prettier/prettier': 'error', // Prettier violations as errors
    },
  },

  // Separate configuration for JS files where require is allowed
  {
    files: ['**/*.js'], // Pattern for JS files (including test-node.js)
    languageOptions: {
      // Remove parserOptions.project, since JS doesn't require tsconfig for type-checking
      ecmaVersion: 2022,
      sourceType: 'script', // or 'module', depending on the JS files
      globals: { ...globals.node }, // Enable Node.js global variables
    },
    rules: {
      // Disable the rule that prohibits require
      '@typescript-eslint/no-require-imports': 'off',
    },
  },

  // Disable type-checked linting for .d.ts files
  {
    files: ['**/*.d.ts'],
    extends: [tseslint.configs.disableTypeChecked],
  }
);
