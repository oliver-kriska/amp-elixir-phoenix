import { createHash } from 'node:crypto'
import {
  lstatSync,
  readFileSync,
  readdirSync,
  writeFileSync,
} from 'node:fs'
import { join, relative, resolve } from 'node:path'

const root = resolve(import.meta.dirname, '..')
const manifestPath = join(root, 'distribution-manifest.json')
const checkOnly = process.argv.includes('--check')

function filesBelow(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name)
    return entry.isDirectory() ? filesBelow(path) : [path]
  })
}

const artifactPaths = [
  join(root, 'plugins', 'elixir-phoenix.ts'),
  ...filesBelow(join(root, 'skills')),
].sort()

const files = Object.fromEntries(
  artifactPaths.map((path) => {
    const metadata = lstatSync(path)
    if (!metadata.isFile()) {
      throw new Error(`unsupported distribution artifact type: ${relative(root, path)}`)
    }
    const content = readFileSync(path)
    return [
      relative(root, path),
      {
        sha256: createHash('sha256').update(content).digest('hex'),
        executable: (metadata.mode & 0o111) !== 0,
      },
    ]
  }),
)

const manifest = `${JSON.stringify(
  {
    schemaVersion: 1,
    source: 'https://github.com/oliver-kriska/claude-elixir-phoenix',
    files,
  },
  null,
  2,
)}\n`

if (checkOnly) {
  let current
  try {
    current = readFileSync(manifestPath, 'utf8')
  } catch {
    throw new Error('distribution-manifest.json is missing; run npm run manifest:update')
  }
  if (current !== manifest) {
    throw new Error('distribution manifest drifted; run npm run manifest:update and commit it')
  }
  console.log(`Distribution manifest passed: ${artifactPaths.length} files`)
} else {
  writeFileSync(manifestPath, manifest)
  console.log(`Wrote distribution-manifest.json for ${artifactPaths.length} files`)
}
