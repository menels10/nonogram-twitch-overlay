// Rollup bundles the ES modules into the single installable userscript file.
import { nodeResolve } from '@rollup/plugin-node-resolve';
import { readFileSync } from 'node:fs';

const banner = readFileSync(new URL('./src/userscript/banner.js', import.meta.url), 'utf8').trim();

export default {
  input: 'src/userscript/main.js',
  output: {
    file: 'twitch-nonogram-canvas.user.js',
    format: 'iife',
    banner,
    sourcemap: false
  },
  plugins: [nodeResolve()]
};
