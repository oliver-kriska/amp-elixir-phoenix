import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import {
  chmodSync,
  cpSync,
  existsSync,
  lstatSync,
  readFileSync,
  readdirSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(import.meta.dirname, '..')
const markerName = '.phxagents-managed.json'
const sourceRepository = 'https://github.com/oliver-kriska/amp-elixir-phoenix'

function check(condition, message) {
  if (!condition) throw new Error(message)
}

function run(command, arguments_, options = {}) {
  const result = spawnSync(command, arguments_, {
    cwd: options.cwd,
    encoding: 'utf8',
    maxBuffer: 10 * 1024 * 1024,
  })
  if (options.statuses?.includes(result.status)) return result
  if (result.status !== 0) {
    const detail = [result.stderr, result.stdout].filter(Boolean).join('\n').trim()
    throw new Error(`${command} ${arguments_.join(' ')} failed${detail ? `:\n${detail}` : ''}`)
  }
  return result
}

function git(repository, arguments_, options = {}) {
  return run('git', ['-C', repository, ...arguments_], options)
}

function gitOutput(repository, arguments_) {
  return git(repository, arguments_).stdout.trim()
}

function filesBelow(path) {
  const metadata = lstatSync(path)
  if (metadata.isFile()) return [path]
  check(metadata.isDirectory(), `unsupported artifact type: ${path}`)
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
  if (!existsSync(destination)) return false
  const expected = snapshot(source)
  const actual = snapshot(destination)
  if (expected.size !== actual.size) return false
  return [...expected].every(([path, file]) => {
    const candidate = actual.get(path)
    return candidate &&
      file.executable === candidate.executable &&
      file.content.equals(candidate.content)
  })
}

function parseArguments(arguments_) {
  const options = { push: false }
  for (let index = 0; index < arguments_.length; index += 1) {
    const argument = arguments_[index]
    if (argument === '--push') {
      options.push = true
    } else if (argument === '--skills-repository' || argument === '--plugins-repository') {
      const value = arguments_[index + 1]
      check(value && !value.startsWith('--'), `${argument} requires a path`)
      options[argument === '--skills-repository' ? 'skillsRepository' : 'pluginsRepository'] =
        resolve(value)
      index += 1
    } else if (argument === '--help') {
      options.help = true
    } else {
      throw new Error(`unknown argument: ${argument}`)
    }
  }
  return options
}

function printUsage() {
  console.log(`Usage: npm run hosted:publish -- \\
  --skills-repository <user-skills-checkout> \\
  --plugins-repository <user-plugins-checkout> [--push]

Without --push, the command prepares local commits only. With --push, it
publishes skills first and stops on failure before preparing plugins.`)
}

function loadDistribution() {
  const trackedPayload = gitOutput(root, [
    'status',
    '--porcelain=v1',
    '--untracked-files=all',
    '--',
    'canonical-commit.txt',
    'distribution-manifest.json',
    'plugins',
    'skills',
  ])
  check(!trackedPayload, 'distribution payload differs from the wrapper HEAD')

  run(process.execPath, [join(root, 'scripts/generate-manifest.mjs'), '--check'], { cwd: root })
  run(process.execPath, [join(root, 'scripts/verify-distribution.mjs')], { cwd: root })

  const revision = gitOutput(root, ['rev-parse', 'HEAD^{commit}'])
  check(/^[0-9a-f]{40}$/.test(revision), `invalid wrapper revision: ${revision}`)
  const canonicalRevision = readFileSync(join(root, 'canonical-commit.txt'), 'utf8').trim()
  check(
    /^[0-9a-f]{40}$/.test(canonicalRevision),
    `invalid canonical revision: ${canonicalRevision}`,
  )

  const manifestContent = readFileSync(join(root, 'distribution-manifest.json'))
  const manifest = JSON.parse(manifestContent)
  check(manifest.schemaVersion === 1, 'unsupported distribution manifest schema')
  const paths = Object.keys(manifest.files ?? {})
  const managedEntries = {
    skills: [...new Set(paths
      .filter((path) => path.startsWith('skills/'))
      .map((path) => path.split('/')[1]))].sort(),
    plugins: [...new Set(paths
      .filter((path) => path.startsWith('plugins/'))
      .map((path) => path.split('/')[1]))].sort(),
  }
  check(managedEntries.skills.length === 51, 'distribution does not contain 51 skills')
  check(managedEntries.plugins.length === 2, 'distribution does not contain 2 plugins')

  return {
    revision,
    canonicalRevision,
    manifestSha256: createHash('sha256').update(manifestContent).digest('hex'),
    managedEntries,
  }
}

function validManagedEntry(kind, entry) {
  if (kind === 'skills') return /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(entry)
  return /^[a-zA-Z0-9_-]+\.(?:ts|js)$/.test(entry)
}

function readMarker(repository, kind) {
  const markerPath = join(repository, markerName)
  if (!existsSync(markerPath)) return { managedEntries: [] }
  check(lstatSync(markerPath).isFile(), `${kind} repository marker is not a regular file`)

  let marker
  try {
    marker = JSON.parse(readFileSync(markerPath, 'utf8'))
  } catch (error) {
    throw new Error(`${kind} repository has an invalid ${markerName}: ${error.message}`)
  }
  check(marker.schemaVersion === 1, `${kind} repository has an unsupported marker schema`)
  check(marker.owner === 'phxagents', `${kind} repository marker has a different owner`)
  check(
    marker.sourceRepository === sourceRepository,
    `${kind} repository marker has a different source`,
  )
  check(marker.kind === kind, `${kind} repository marker has kind ${marker.kind}`)
  check(Array.isArray(marker.managedEntries), `${kind} repository marker has no managed entries`)
  check(
    new Set(marker.managedEntries).size === marker.managedEntries.length &&
      marker.managedEntries.every((entry) =>
        typeof entry === 'string' && validManagedEntry(kind, entry),
      ),
    `${kind} repository marker contains an unsafe managed entry`,
  )
  return marker
}

function preflightRepository(repository, kind, push) {
  check(existsSync(repository), `${kind} repository does not exist: ${repository}`)
  check(
    gitOutput(repository, ['rev-parse', '--is-inside-work-tree']) === 'true',
    `${kind} repository is not a Git checkout: ${repository}`,
  )
  check(!gitOutput(repository, ['status', '--porcelain=v1']), `${kind} repository is not clean`)
  git(repository, ['var', 'GIT_AUTHOR_IDENT'])
  const marker = readMarker(repository, kind)

  if (push) {
    git(repository, ['fetch', '--quiet', 'origin', 'main'])
    const localRevision = gitOutput(repository, ['rev-parse', 'HEAD^{commit}'])
    const remoteRevision = gitOutput(repository, ['rev-parse', 'refs/remotes/origin/main^{commit}'])
    check(
      localRevision === remoteRevision,
      `${kind} repository HEAD must equal origin/main before --push`,
    )
  }
  return marker
}

function markerFor(kind, distribution) {
  return {
    schemaVersion: 1,
    owner: 'phxagents',
    sourceRepository,
    kind,
    wrapperRevision: distribution.revision,
    canonicalRevision: distribution.canonicalRevision,
    distributionManifestSha256: distribution.manifestSha256,
    managedEntries: distribution.managedEntries[kind],
  }
}

function synchronizeRepository(repository, kind, previousMarker, distribution) {
  const currentEntries = distribution.managedEntries[kind]
  const entriesToReplace = new Set([...previousMarker.managedEntries, ...currentEntries])
  for (const entry of entriesToReplace) {
    rmSync(join(repository, entry), { recursive: true, force: true })
  }
  for (const entry of currentEntries) {
    const source = join(root, kind, entry)
    const destination = join(repository, entry)
    cpSync(source, destination, { recursive: true, preserveTimestamps: false })
  }

  const markerPath = join(repository, markerName)
  writeFileSync(markerPath, `${JSON.stringify(markerFor(kind, distribution), null, 2)}\n`)
  chmodSync(markerPath, 0o644)

  for (const entry of currentEntries) {
    check(
      equalTrees(join(root, kind, entry), join(repository, entry)),
      `${kind} artifact failed its post-copy integrity check: ${entry}`,
    )
  }
  for (const staleEntry of previousMarker.managedEntries) {
    if (!currentEntries.includes(staleEntry)) {
      check(!existsSync(join(repository, staleEntry)), `stale ${kind} artifact remains: ${staleEntry}`)
    }
  }
}

function commitRepository(repository, kind, distribution) {
  git(repository, ['add', '--all'])
  const staged = git(repository, ['diff', '--cached', '--quiet'], { statuses: [0, 1] })
  if (staged.status === 0) {
    console.log(`${kind}: already current at ${distribution.revision}`)
    return false
  }
  git(repository, [
    'commit',
    '-m',
    `chore: publish phxagents ${distribution.revision.slice(0, 12)}`,
  ])
  console.log(`${kind}: prepared ${gitOutput(repository, ['rev-parse', 'HEAD'])}`)
  return true
}

function pushRepository(repository, kind) {
  git(repository, ['push', 'origin', 'HEAD:refs/heads/main'])
  const localRevision = gitOutput(repository, ['rev-parse', 'HEAD^{commit}'])
  const remote = gitOutput(repository, ['ls-remote', '--exit-code', 'origin', 'refs/heads/main'])
    .split(/\s+/)[0]
  check(remote === localRevision, `${kind} remote revision did not match the published commit`)
  console.log(`${kind}: published ${localRevision}`)
}

function publish(options) {
  check(options.skillsRepository, '--skills-repository is required')
  check(options.pluginsRepository, '--plugins-repository is required')
  const skillsRepository = realpathSync(options.skillsRepository)
  const pluginsRepository = realpathSync(options.pluginsRepository)
  check(skillsRepository !== pluginsRepository, 'skills and plugins repositories must differ')
  check(
    ![skillsRepository, pluginsRepository].includes(realpathSync(root)),
    'the wrapper checkout cannot be used as a hosted repository target',
  )

  const distribution = loadDistribution()
  const markers = {
    skills: preflightRepository(skillsRepository, 'skills', options.push),
    plugins: preflightRepository(pluginsRepository, 'plugins', options.push),
  }

  for (const [kind, repository] of [
    ['skills', skillsRepository],
    ['plugins', pluginsRepository],
  ]) {
    synchronizeRepository(repository, kind, markers[kind], distribution)
    const committed = commitRepository(repository, kind, distribution)
    if (options.push && committed) pushRepository(repository, kind)
  }
}

function main() {
  try {
    const options = parseArguments(process.argv.slice(2))
    if (options.help) {
      printUsage()
      return
    }
    publish(options)
  } catch (error) {
    console.error(`Amp-hosted publish failed: ${error.message}`)
    process.exitCode = 1
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) main()
