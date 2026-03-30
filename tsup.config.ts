import { defineConfig } from 'tsup';
import * as path from 'path';
import * as fs from 'fs';

export default defineConfig({
  entry: {
    index: 'src/index.ts',
    cli: 'src/cli.ts',
  },
  format: ['esm', 'cjs'],
  dts: { entry: 'src/index.ts' },
  splitting: true,
  clean: true,
  sourcemap: true,
  target: 'node18',
  banner: ({ format }) => {
    // Add shebang to CLI entry
    if (format === 'esm') {
      return { js: '' };
    }
    return {};
  },
  async onSuccess() {
    // Copy mustache templates to dist (both locations the renderer searches)
    const srcDir = path.resolve('src/templates/defaults');
    if (fs.existsSync(srcDir)) {
      for (const dest of ['dist/defaults', 'dist/templates/defaults']) {
        const destDir = path.resolve(dest);
        fs.mkdirSync(destDir, { recursive: true });
        for (const file of fs.readdirSync(srcDir)) {
          fs.copyFileSync(path.join(srcDir, file), path.join(destDir, file));
        }
      }
    }

    // Add shebang to ESM CLI output
    const cliPath = path.resolve('dist/cli.js');
    if (fs.existsSync(cliPath)) {
      const content = fs.readFileSync(cliPath, 'utf-8');
      if (!content.startsWith('#!')) {
        fs.writeFileSync(cliPath, '#!/usr/bin/env node\n' + content);
      }
    }
  },
});
