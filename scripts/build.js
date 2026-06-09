const { buildSync } = require('esbuild');
const { mkdirSync, existsSync } = require('fs');
const { join } = require('path');

const root = join(__dirname, '..');
const outdir = join(root, '.build');

if (!existsSync(outdir)) mkdirSync(outdir, { recursive: true });

const handlers = ['upload', 'processor', 'status', 'list-jobs', 'rows'];

for (const name of handlers) {
  buildSync({
    entryPoints: [join(root, 'src', 'handlers', `${name}.ts`)],
    bundle: true,
    platform: 'node',
    target: 'node22',
    outfile: join(outdir, `${name}.js`),
    sourcemap: false,
    minify: false,
    external: [],
  });
  process.stdout.write(`built ${name}\n`);
}
