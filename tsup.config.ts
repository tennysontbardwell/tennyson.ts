import { defineConfig } from 'tsup'

export default defineConfig([
  {
    entry: [
      'tennyson/index.ts',
      'tennyson/app/scripts/hometty.ts',
      'tennyson/app/scripts/aws-ranger.ts',
    ],
    format: ['cjs'],
    dts: false,
    splitting: false,
    sourcemap: true,
    clean: true,
    outDir: 'bin',
    tsconfig: './tsconfig.json',
  },
])
