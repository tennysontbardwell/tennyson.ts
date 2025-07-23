import { defineConfig } from 'tsup'

export default defineConfig([
  {
    entry: [
      'tennyson/**/*.ts',
      'tennyson/**/*.tsx'
    ],
    format: ['cjs'],
    dts: false,
    splitting: false,
    sourcemap: true,
    clean: true,
    outDir: 'build',
    tsconfig: './tsconfig.json',
  },
])
