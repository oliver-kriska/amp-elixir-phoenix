import { spawnSync } from 'node:child_process'
import {
  cpSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { join, relative, resolve } from 'node:path'

const root = resolve(import.meta.dirname, '..')
const checkOnly = process.argv.includes('--check') || process.argv.includes('--dry-run')
const argumentsWithoutFlags = process.argv.slice(2).filter((argument) => !argument.startsWith('--'))
const canonical = resolve(argumentsWithoutFlags[0] ?? '')

if (!argumentsWithoutFlags[0]) {
  throw new Error('usage: npm run sync:canonical -- <canonical-checkout> [--check|--dry-run]')
}

const mappings = [
  ['targets/amp/skills', 'skills'],
  ['targets/amp/plugins/phx-watch-pr.ts', 'plugins/phx-watch-pr.ts'],
  ['scripts/tests/amp_watch_pr_harness.mts', 'scripts/tests/amp_watch_pr_harness.mts'],
]

function filesBelow(path) {
  const metadata = lstatSync(path)
  if (metadata.isFile()) return [path]
  if (!metadata.isDirectory()) throw new Error(`unsupported source artifact: ${path}`)
  return readdirSync(path, { withFileTypes: true }).flatMap((entry) =>
    filesBelow(join(path, entry.name)),
  )
}

function snapshot(path) {
  return new Map(filesBelow(path).map((file) => [
    relative(path, file),
    {
      content: readFileSync(file),
      executable: (lstatSync(file).mode & 0o111) !== 0,
    },
  ]))
}

function equalTrees(source, destination) {
  let expected
  let actual
  try {
    expected = snapshot(source)
    actual = snapshot(destination)
  } catch {
    return false
  }
  if (expected.size !== actual.size) return false
  return [...expected].every(([path, file]) => {
    const candidate = actual.get(path)
    return candidate &&
      file.executable === candidate.executable &&
      file.content.equals(candidate.content)
  })
}

const revision = spawnSync('git', ['-C', canonical, 'rev-parse', 'HEAD'], {
  encoding: 'utf8',
})
if (revision.status !== 0) throw new Error(`cannot read canonical commit: ${revision.stderr.trim()}`)
const commit = revision.stdout.trim()
const commitPath = join(root, 'canonical-commit.txt')

if (checkOnly) {
  const drift = mappings
    .filter(([source, destination]) =>
      !equalTrees(join(canonical, source), join(root, destination)),
    )
    .map(([, destination]) => destination)
  let recorded = ''
  try { recorded = readFileSync(commitPath, 'utf8').trim() } catch {}
  if (recorded !== commit) drift.push('canonical-commit.txt')
  if (drift.length > 0) {
    throw new Error(`canonical distribution drift: ${drift.join(', ')}`)
  }
  const manifest = spawnSync(process.execPath, [join(root, 'scripts/generate-manifest.mjs'), '--check'], {
    stdio: 'inherit',
  })
  if (manifest.status !== 0) process.exit(manifest.status ?? 1)
  console.log(`Canonical sync check passed at ${commit}`)
} else {
  for (const [source, destination] of mappings) {
    const from = join(canonical, source)
    const to = join(root, destination)
    rmSync(to, { recursive: true, force: true })
    mkdirSync(resolve(to, '..'), { recursive: true })
    cpSync(from, to, { recursive: true, preserveTimestamps: false })
  }
  writeFileSync(commitPath, `${commit}\n`)
  const manifest = spawnSync(process.execPath, [join(root, 'scripts/generate-manifest.mjs')], {
    stdio: 'inherit',
  })
  if (manifest.status !== 0) process.exit(manifest.status ?? 1)
  console.log(`Synced canonical Amp artifacts at ${commit}`)
}
