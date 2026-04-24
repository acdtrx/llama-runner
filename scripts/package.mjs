#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '..');
const releaseDir = resolve(repoRoot, 'release');

function run(cmd, args, opts = {}) {
  const res = spawnSync(cmd, args, { stdio: 'inherit', cwd: repoRoot, ...opts });
  if (res.status !== 0) {
    throw new Error(`${cmd} ${args.join(' ')} failed with exit ${res.status}`);
  }
}

function gitShortSha() {
  const res = spawnSync('git', ['rev-parse', '--short', 'HEAD'], { cwd: repoRoot });
  if (res.status !== 0) return 'nogit';
  return res.stdout.toString().trim() || 'nogit';
}

async function readJson(path) {
  return JSON.parse(await readFile(path, 'utf8'));
}

async function main() {
  const rootPkg = await readJson(resolve(repoRoot, 'package.json'));
  const serverPkg = await readJson(resolve(repoRoot, 'server/package.json'));

  console.log('> building workspaces');
  run('npm', ['run', 'build']);

  const sha = gitShortSha();
  const baseName = `llama-runner-${rootPkg.version}-${sha}`;
  const stagingDir = resolve(releaseDir, '.staging');
  const payloadDir = resolve(stagingDir, 'llama-runner');
  const zipPath = resolve(releaseDir, `${baseName}.zip`);

  console.log(`> staging into ${payloadDir}`);
  await rm(stagingDir, { recursive: true, force: true });
  await rm(zipPath, { force: true });
  await mkdir(payloadDir, { recursive: true });

  await Promise.all([
    cp(resolve(repoRoot, 'server/dist'), resolve(payloadDir, 'server/dist'), { recursive: true }),
    cp(resolve(repoRoot, 'server/seed'), resolve(payloadDir, 'server/seed'), { recursive: true }),
    cp(resolve(repoRoot, 'web/dist'), resolve(payloadDir, 'web/dist'), { recursive: true }),
    cp(resolve(repoRoot, 'README.md'), resolve(payloadDir, 'README.md')),
    cp(resolve(repoRoot, 'LICENSE'), resolve(payloadDir, 'LICENSE')),
    cp(resolve(repoRoot, '.nvmrc'), resolve(payloadDir, '.nvmrc')),
  ]);

  const deployPkg = {
    name: rootPkg.name,
    version: rootPkg.version,
    private: true,
    type: 'module',
    description: rootPkg.description,
    engines: rootPkg.engines,
    scripts: {
      start: 'NODE_ENV=production node server/dist/app.js',
    },
    dependencies: serverPkg.dependencies,
  };
  await writeFile(
    resolve(payloadDir, 'package.json'),
    JSON.stringify(deployPkg, null, 2) + '\n',
  );

  const deployNotes = `# Deploying llama-runner

This archive is a pre-built bundle. The TypeScript/Vite toolchain is **not**
required on the target machine — only Node.js and \`npm install\`.

## Requirements

- macOS or Linux
- Node.js 24+ (see \`.nvmrc\`)
- A \`llama-server\` binary built from llama.cpp (path configured in-app)
- A directory of GGUF model files

## Install

\`\`\`
unzip ${baseName}.zip
cd llama-runner
npm install --omit=dev
npm start
\`\`\`

Then open <http://localhost:3030>. Persistent data lives in \`~/.llama-runner\`.
Environment overrides (\`PORT\`, \`HOST\`, \`LLAMA_RUNNER_DATA_DIR\`, \`LOG_LEVEL\`)
are documented in \`README.md\`.
`;
  await writeFile(resolve(payloadDir, 'DEPLOY.md'), deployNotes);

  console.log(`> zipping ${zipPath}`);
  run('zip', ['-r', '-q', zipPath, 'llama-runner'], { cwd: stagingDir });

  await rm(stagingDir, { recursive: true, force: true });

  console.log(`\n✓ ${zipPath}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
