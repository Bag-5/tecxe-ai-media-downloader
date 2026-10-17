import nextCoreWebVitals from 'eslint-config-next/core-web-vitals'
import nextTypescript from 'eslint-config-next/typescript'

/**
 * eslint-config-next v16 ships native flat configs, so no FlatCompat shim is
 * needed (and the shim actually fails validation against these configs).
 */
const eslintConfig = [
  ...nextCoreWebVitals,
  ...nextTypescript,
  {
    ignores: [
      'bin/**',
      'Downloads/**',
      '.next/**',
      'node_modules/**',
      'next-env.d.ts',
    ],
  },
  {
    // The setup script reports status with `cond ? ok(...) : fail(...)`, which
    // reads better than if/else for a linear list of checks.
    files: ['scripts/**/*.mjs'],
    rules: { '@typescript-eslint/no-unused-expressions': 'off' },
  },
]

export default eslintConfig