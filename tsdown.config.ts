import { defineConfig } from 'tsdown';

export default defineConfig({
  entry: { index: 'src/index.ts', cli: 'src/bin.ts' },
  format: 'esm',
  platform: 'node',
  target: 'node22.13',
  fixedExtension: false,
  dts: true,
  clean: true,
  publint: true,
});
