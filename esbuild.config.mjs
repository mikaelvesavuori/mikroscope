import { readFileSync } from 'node:fs';
import { build } from 'esbuild';

const format = (process.argv[2] || 'all').replace('--', '');

const getPackageVersion = () =>
  JSON.parse(readFileSync('./package.json', 'utf-8')).version;
const packageVersion = getPackageVersion();

console.log(
  `Building MikroScope (${packageVersion}) for format "${format}"...`
);

const getConfig = () => {
  return {
    entryPoints: {
      cli: 'src/cli.ts'
    },
    entryNames: '[name]',
    bundle: true,
    minify: true,
    treeShaking: true,
    platform: 'node',
    target: 'node25',
    mainFields: ['module', 'main'],
    outdir: `dist`,
    external: [],
    banner: {
      js: '// MikroScope - See LICENSE file for copyright and license details.'
    }
  };
};

const common = getConfig();

if (format === 'all' || format === 'esm') {
  build({
    ...common,
    format: 'esm',
    outExtension: { '.js': '.mjs' }
  }).catch(() => process.exit(1));
}

if (format === 'all' || format === 'cjs') {
  build({
    ...common,
    format: 'cjs',
    outExtension: { '.js': '.cjs' }
  }).catch(() => process.exit(1));
}
