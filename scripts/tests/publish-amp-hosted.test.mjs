import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import {
  chmodSync,
  cpSync,
  existsSync,
  lstatSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join, relative, resolve } from 'node:path'
import { after, afterEach, before, test } from 'node:test'

const wrapperRoot = resolve(import.meta.dirname, '../..')
const markerName = '.phxagents-managed.json'
const temporaryDirectories = []
let root
let publisher

// The publisher refuses a payload that differs from HEAD, and the daily
// canonical sync runs these tests before it commits the refreshed payload.
// Publishing from a committed copy keeps the tests independent of the
// checkout's state.
function createWrapperFixture() {
  // The publisher only runs main() when argv[1] is its real path.
  const fixture = realpathSync(mkdtempSync(join(tmpdir(), 'phxagents-wrapper-')))
  const payload = ['canonical-commit.txt', 'distribution-manifest.json', 'plugins', 'skills']
  const scripts = ['generate-manifest.mjs', 'publish-amp-hosted.mjs', 'verify-distribution.mjs']
  for (const path of [...payload, ...scripts.map((script) => join('scripts', script))]) {
    cpSync(join(wrapperRoot, path), join(fixture, path), { recursive: true })
  }
  mkdirSync(join(fixture, 'node_modules'))
  symlinkSync(join(wrapperRoot, 'node_modules/yaml'), join(fixture, 'node_modules/yaml'))
  command('git', ['init', '--initial-branch=main', fixture])
  git(fixture, 'config', 'user.name', 'Publisher Test')
  git(fixture, 'config', 'user.email', 'publisher@example.com')
  git(fixture, 'add', ...payload, 'scripts')
  git(fixture, 'commit', '-m', 'wrapper fixture')
  return fixture
}

before(() => {
  root = createWrapperFixture()
  publisher = join(root, 'scripts/publish-amp-hosted.mjs')
})

after(() => {
  rmSync(root, { recursive: true, force: true })
})

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true })
  }
})

function temporaryDirectory() {
  const directory = mkdtempSync(join(tmpdir(), 'phxagents-publisher-'))
  temporaryDirectories.push(directory)
  return directory
}

function command(command_, arguments_, options = {}) {
  const result = spawnSync(command_, arguments_, {
    cwd: options.cwd,
    encoding: 'utf8',
    env: {
      ...process.env,
      GIT_CONFIG_GLOBAL: '/dev/null',
      GIT_CONFIG_NOSYSTEM: '1',
    },
  })
  if (options.allowFailure || result.status === 0) return result
  assert.fail(`${command_} ${arguments_.join(' ')} failed:\n${result.stderr}\n${result.stdout}`)
}

function git(repository, ...arguments_) {
  return command('git', ['-C', repository, ...arguments_]).stdout.trim()
}

function oldMarker(kind, managedEntries) {
  return {
    schemaVersion: 1,
    owner: 'phxagents',
    sourceRepository: 'https://github.com/oliver-kriska/amp-elixir-phoenix',
    kind,
    wrapperRevision: '0000000000000000000000000000000000000000',
    canonicalRevision: '0000000000000000000000000000000000000000',
    distributionManifestSha256: '0'.repeat(64),
    managedEntries,
  }
}

function createHostedRepository(base, kind, options = {}) {
  const bare = join(base, `${kind}.git`)
  const seed = join(base, `${kind}-seed`)
  const checkout = join(base, kind)
  command('git', ['init', '--bare', '--initial-branch=main', bare])
  command('git', ['init', '--initial-branch=main', seed])
  git(seed, 'config', 'user.name', 'Publisher Test')
  git(seed, 'config', 'user.email', 'publisher@example.com')

  if (kind === 'skills') {
    mkdirSync(join(seed, 'unrelated-skill'))
    writeFileSync(join(seed, 'unrelated-skill/SKILL.md'), 'unrelated skill\n')
    mkdirSync(join(seed, 'phx-watch-pr', 'scripts'), { recursive: true })
    writeFileSync(join(seed, 'phx-watch-pr/SKILL.md'), 'old watcher\n')
    writeFileSync(join(seed, 'phx-watch-pr/scripts/obsolete.sh'), 'obsolete\n')
    mkdirSync(join(seed, 'retired-phxagent'))
    writeFileSync(join(seed, 'retired-phxagent/SKILL.md'), 'retired\n')
    writeFileSync(
      join(seed, markerName),
      `${JSON.stringify(oldMarker(kind, ['phx-watch-pr', 'retired-phxagent']), null, 2)}\n`,
    )
  } else {
    writeFileSync(join(seed, 'unrelated.ts'), 'export default function unrelated() {}\n')
    writeFileSync(join(seed, 'elixir-phoenix.ts'), 'old plugin\n')
    writeFileSync(join(seed, 'retired-phxagent.ts'), 'retired\n')
    writeFileSync(
      join(seed, markerName),
      `${JSON.stringify(
        oldMarker(kind, ['elixir-phoenix.ts', 'retired-phxagent.ts']),
        null,
        2,
      )}\n`,
    )
  }

  git(seed, 'add', '--all')
  git(seed, 'commit', '-m', `seed ${kind}`)
  git(seed, 'remote', 'add', 'origin', bare)
  git(seed, 'push', 'origin', 'main')
  command('git', ['clone', bare, checkout])
  git(checkout, 'config', 'user.name', 'Publisher Test')
  git(checkout, 'config', 'user.email', 'publisher@example.com')

  if (options.hook) {
    const hookPath = join(bare, 'hooks/pre-receive')
    writeFileSync(hookPath, options.hook)
    chmodSync(hookPath, 0o755)
  }
  return { bare, checkout }
}

function runPublisher(skills, plugins, push = true) {
  return command(
    process.execPath,
    [
      publisher,
      '--skills-repository',
      skills,
      '--plugins-repository',
      plugins,
      ...(push ? ['--push'] : []),
    ],
    { cwd: root, allowFailure: true },
  )
}

function filesBelow(directory) {
  if (lstatSync(directory).isFile()) return [directory]
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name)
    return entry.isDirectory() ? filesBelow(path) : [path]
  })
}

function assertEqualArtifacts(source, destination) {
  const expected = filesBelow(source).map((path) => relative(source, path)).sort()
  const actual = filesBelow(destination).map((path) => relative(destination, path)).sort()
  assert.deepEqual(actual, expected)
  for (const path of expected) {
    assert.deepEqual(readFileSync(join(destination, path)), readFileSync(join(source, path)))
    assert.equal(
      (lstatSync(join(destination, path)).mode & 0o111) !== 0,
      (lstatSync(join(source, path)).mode & 0o111) !== 0,
    )
  }
}

function assertManagedArtifacts(kind, destination) {
  const source = join(root, kind)
  for (const entry of readdirSync(source, { withFileTypes: true })) {
    assertEqualArtifacts(join(source, entry.name), join(destination, entry.name))
  }
}

test('publishes exact managed artifacts in skills-first order and then becomes a no-op', () => {
  const base = temporaryDirectory()
  const order = join(base, 'push-order')
  const hook = (kind) => `#!/bin/sh\nprintf '%s\\n' '${kind}' >> '${order}'\n`
  const skills = createHostedRepository(base, 'skills', { hook: hook('skills') })
  const plugins = createHostedRepository(base, 'plugins', { hook: hook('plugins') })

  const first = runPublisher(skills.checkout, plugins.checkout)
  assert.equal(first.status, 0, first.stderr)
  assert.deepEqual(readFileSync(order, 'utf8').trim().split('\n'), ['skills', 'plugins'])

  assert.equal(readFileSync(join(skills.checkout, 'unrelated-skill/SKILL.md'), 'utf8'), 'unrelated skill\n')
  assert.equal(readFileSync(join(plugins.checkout, 'unrelated.ts'), 'utf8'), 'export default function unrelated() {}\n')
  assert.equal(existsSync(join(skills.checkout, 'retired-phxagent')), false)
  assert.equal(existsSync(join(plugins.checkout, 'retired-phxagent.ts')), false)
  assert.equal(existsSync(join(skills.checkout, 'phx-watch-pr/scripts/obsolete.sh')), false)

  assertManagedArtifacts('skills', skills.checkout)
  assertManagedArtifacts('plugins', plugins.checkout)

  const skillsMarker = JSON.parse(readFileSync(join(skills.checkout, markerName), 'utf8'))
  const pluginsMarker = JSON.parse(readFileSync(join(plugins.checkout, markerName), 'utf8'))
  const wrapperRevision = git(root, 'rev-parse', 'HEAD')
  assert.equal(skillsMarker.wrapperRevision, wrapperRevision)
  assert.equal(pluginsMarker.wrapperRevision, wrapperRevision)
  assert.equal(skillsMarker.canonicalRevision, pluginsMarker.canonicalRevision)
  assert.equal(
    skillsMarker.distributionManifestSha256,
    pluginsMarker.distributionManifestSha256,
  )
  assert.equal(skillsMarker.managedEntries.length, 51)
  assert.deepEqual(pluginsMarker.managedEntries, ['elixir-phoenix.ts', 'phx-watch-pr.ts'])

  const heads = {
    skills: git(skills.checkout, 'rev-parse', 'HEAD'),
    plugins: git(plugins.checkout, 'rev-parse', 'HEAD'),
  }
  const second = runPublisher(skills.checkout, plugins.checkout)
  assert.equal(second.status, 0, second.stderr)
  assert.match(second.stdout, /skills: already current/)
  assert.match(second.stdout, /plugins: already current/)
  assert.equal(git(skills.checkout, 'rev-parse', 'HEAD'), heads.skills)
  assert.equal(git(plugins.checkout, 'rev-parse', 'HEAD'), heads.plugins)
  assert.deepEqual(readFileSync(order, 'utf8').trim().split('\n'), ['skills', 'plugins'])
})

test('prepares local commits without pushing by default', () => {
  const base = temporaryDirectory()
  const skills = createHostedRepository(base, 'skills')
  const plugins = createHostedRepository(base, 'plugins')
  const remoteHeads = {
    skills: git(skills.bare, 'rev-parse', 'main'),
    plugins: git(plugins.bare, 'rev-parse', 'main'),
  }

  const result = runPublisher(skills.checkout, plugins.checkout, false)
  assert.equal(result.status, 0, result.stderr)
  assert.notEqual(git(skills.checkout, 'rev-parse', 'HEAD'), remoteHeads.skills)
  assert.notEqual(git(plugins.checkout, 'rev-parse', 'HEAD'), remoteHeads.plugins)
  assert.equal(git(skills.bare, 'rev-parse', 'main'), remoteHeads.skills)
  assert.equal(git(plugins.bare, 'rev-parse', 'main'), remoteHeads.plugins)
})

test('a skills push failure leaves plugins untouched', () => {
  const base = temporaryDirectory()
  const skills = createHostedRepository(base, 'skills', {
    hook: '#!/bin/sh\necho rejected >&2\nexit 1\n',
  })
  const plugins = createHostedRepository(base, 'plugins')
  const pluginHead = git(plugins.checkout, 'rev-parse', 'HEAD')
  const pluginStatus = git(plugins.checkout, 'status', '--porcelain=v1')

  const result = runPublisher(skills.checkout, plugins.checkout)
  assert.notEqual(result.status, 0)
  assert.match(result.stderr, /git .* push .* failed/)
  assert.equal(git(plugins.checkout, 'rev-parse', 'HEAD'), pluginHead)
  assert.equal(git(plugins.checkout, 'status', '--porcelain=v1'), pluginStatus)
  assert.equal(existsSync(join(plugins.checkout, 'phx-watch-pr.ts')), false)
})

test('invalid plugin ownership metadata fails before skills are modified', () => {
  const base = temporaryDirectory()
  const skills = createHostedRepository(base, 'skills')
  const plugins = createHostedRepository(base, 'plugins')
  const invalid = JSON.parse(readFileSync(join(plugins.checkout, markerName), 'utf8'))
  invalid.managedEntries.push('../outside')
  writeFileSync(join(plugins.checkout, markerName), `${JSON.stringify(invalid, null, 2)}\n`)
  git(plugins.checkout, 'add', markerName)
  git(plugins.checkout, 'commit', '-m', 'add invalid marker fixture')
  git(plugins.checkout, 'push', 'origin', 'main')
  const skillHead = git(skills.checkout, 'rev-parse', 'HEAD')

  const result = runPublisher(skills.checkout, plugins.checkout)
  assert.notEqual(result.status, 0)
  assert.match(result.stderr, /unsafe managed entry/)
  assert.equal(git(skills.checkout, 'rev-parse', 'HEAD'), skillHead)
  assert.equal(git(skills.checkout, 'status', '--porcelain=v1'), '')
})

test('an uncommitted distribution payload fails before hosted repositories are modified', () => {
  const base = temporaryDirectory()
  const skills = createHostedRepository(base, 'skills')
  const plugins = createHostedRepository(base, 'plugins')
  const heads = {
    skills: git(skills.checkout, 'rev-parse', 'HEAD'),
    plugins: git(plugins.checkout, 'rev-parse', 'HEAD'),
  }
  const skill = join(root, 'skills/phx-plan/SKILL.md')
  const original = readFileSync(skill)
  writeFileSync(skill, Buffer.concat([original, Buffer.from('uncommitted\n')]))

  try {
    const result = runPublisher(skills.checkout, plugins.checkout)
    assert.notEqual(result.status, 0)
    assert.match(result.stderr, /distribution payload differs from the wrapper HEAD/)
  } finally {
    writeFileSync(skill, original)
  }
  assert.equal(git(skills.checkout, 'rev-parse', 'HEAD'), heads.skills)
  assert.equal(git(plugins.checkout, 'rev-parse', 'HEAD'), heads.plugins)
  assert.equal(git(skills.checkout, 'status', '--porcelain=v1'), '')
  assert.equal(git(plugins.checkout, 'status', '--porcelain=v1'), '')
})
