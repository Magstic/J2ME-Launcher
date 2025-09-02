// ESLint v9 Flat Config (CommonJS)
// Requires: eslint, eslint-plugin-import, eslint-plugin-react, eslint-plugin-react-hooks, eslint-import-resolver-alias

const reactPlugin = require('eslint-plugin-react');
const reactHooks = require('eslint-plugin-react-hooks');
const importPlugin = require('eslint-plugin-import');
const babelParser = require('@babel/eslint-parser');

module.exports = [
  // Global ignores (replaces .eslintignore)
  {
    ignores: ['node_modules/**', 'dist/**', 'release/**', 'public/**']
  },
  // Barrel files: allow internal paths (they aggregate exports by design)
  {
    files: [
      'src/components/index.js',
      'src/components/ui/index.js',
      'src/components/shared/index.js',
      'src/components/shared/hooks/index.js'
    ],
    rules: {
      'no-restricted-imports': 'off'
    }
  },
  // Main process code: relax import path restrictions (not using renderer aliases)
  {
    files: ['src/main/**'],
    rules: {
      'no-restricted-imports': 'off'
    }
  },
  // Renderer strictness: from outside components/, forbid relative deep imports into components; encourage barrels
  {
    files: ['src/**/*.{js,jsx}'],
    ignores: ['src/main/**'],
    rules: {
      // Block relative deep paths into components; enforce aliases instead
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              // Only relative paths into components from non-components files
              group: ['./components/**', '../**/components/**', '../../**/components/**'],
              message:
                '請使用 @components/@ui/@shared 別名，不要用相對路徑深入 components 子目錄'
            },
            {
              // Discourage multiple CSS imports - encourage centralized loading
              group: ['../styles/*.css', '../../styles/*.css', '../../../styles/*.css', './styles/*.css'],
              message:
                '避免多個樣式表引入，建議使用 @styles 別名或在 App.jsx 中集中載入全域樣式'
            }
          ]
        }
      ]
    }
  },
  {
    files: ['**/*.{js,jsx}'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      parser: babelParser,
      parserOptions: {
        requireConfigFile: false,
        babelOptions: {
          plugins: ['@babel/plugin-syntax-jsx']
        }
      }
    },
    settings: {
      react: { version: 'detect' },
      'import/resolver': {
        alias: {
          map: [
            ['@components', './src/components'],
            ['@ui', './src/components/ui'],
            ['@shared', './src/components/shared'],
            ['@hooks', './src/hooks'],
            ['@config', './src/config'],
            ['@styles', './src/styles']
          ],
          extensions: ['.js', '.jsx', '.css']
        }
      }
    },
    plugins: {
      import: importPlugin,
      react: reactPlugin,
      'react-hooks': reactHooks
    },
    rules: {
      // Encourage barrels and aliases
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['@ui/*', '@ui/*/**'],
              message: 'Use named imports from @ui barrel: import { ... } from "@ui"'
            },
            {
              group: [
                '@components/ui/*',
                '@components/ui/*/**',
                '@components/freej2meplus/*',
                '@components/kemulator/*',
                '@components/libretro/*'
              ],
              message: 'Use named imports from @components barrel: import { ... } from "@components"'
            }
          ]
        }
      ],

      // React
      'react/prop-types': 'off'
    }
  }
];
