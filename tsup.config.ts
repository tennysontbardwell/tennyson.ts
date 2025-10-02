import { defineConfig } from 'tsup'

export default defineConfig([
  {
    entry: [
      'tennyson/index.ts',
      'tennyson/bin/hometty.ts',
      'tennyson/bin/aws-ranger.ts',
    ],
    format: ['esm'],
    dts: false,
    bundle: true,
    treeshake: true,
    minify: true,
    splitting: false,
    sourcemap: true,
    clean: true,
    outDir: 'bin',
    tsconfig: './tsconfig.json',
    noExternal: ["effect"],
  },
])
