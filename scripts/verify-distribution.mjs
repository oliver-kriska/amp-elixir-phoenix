import { spawnSync } from 'node:child_process'
import {
  readFileSync,
  readdirSync,
  statSync,
} from 'node:fs'
import { extname, join, relative, resolve } from 'node:path'
import { parseDocument } from 'yaml'

const root = resolve(import.meta.dirname, '..')
const skillsRoot = join(root, 'skills')
const pluginPath = join(root, 'plugins', 'elixir-phoenix.ts')
const expectedDistribution =
  '// Distribution: https://github.com/oliver-kriska/amp-elixir-phoenix\n'

function check(condition, message) {
  if (!condition) throw new Error(message)
}

function filesBelow(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    if (entry.isDirectory() && ['.git', 'node_modules'].includes(entry.name)) {
      return []
    }
    const path = join(directory, entry.name)
    return entry.isDirectory() ? filesBelow(path) : [path]
  })
}

function parseFrontmatter(path) {
  const content = readFileSync(path, 'utf8')
  const match = content.match(/^---\n([\s\S]*?)\n---(?:\n|$)/)
  check(match, `${relative(root, path)} has no YAML frontmatter`)
  const document = parseDocument(match[1])
  check(
    document.errors.length === 0,
    `${relative(root, path)} has invalid YAML: ${document.errors.join('; ')}`,
  )
  return document.toJS()
}

const skillDirectories = readdirSync(skillsRoot, { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name)
  .sort()

check(skillDirectories.length === 51, `expected 51 skills, found ${skillDirectories.length}`)

for (const directory of skillDirectories) {
  const skillFile = join(skillsRoot, directory, 'SKILL.md')
  check(statSync(skillFile).isFile(), `${directory}/SKILL.md is missing`)
  const frontmatter = parseFrontmatter(skillFile)
  check(frontmatter.name === directory, `${directory} has frontmatter name ${frontmatter.name}`)
  check(
    /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(frontmatter.name),
    `${directory} has an invalid skill name`,
  )
  check(
    typeof frontmatter.description === 'string' &&
      frontmatter.description.trim().length > 0,
    `${directory} has no description`,
  )
}

const plugin = readFileSync(pluginPath, 'utf8')
check(
  plugin.startsWith(expectedDistribution),
  'plugin distribution URL does not point at this repository',
)
check(!plugin.includes('@amp-plugin'), 'unsupported third-party auto-update directive is present')
check((plugin.match(/"skillName":/g) ?? []).length === 40, 'expected 40 workflow definitions')

for (const required of [
  "amp.createAgent",
  "tools: ['Read', 'finder']",
  'Promise.allSettled',
  "name: 'elixir_phoenix_parallel_review'",
  "name: 'elixir_phoenix_parallel_investigate'",
  "amp.on('tool.call'",
  "amp.on('agent.start'",
  "amp.on('agent.end'",
  "action: 'continue'",
]) {
  check(plugin.includes(required), `plugin is missing required behavior: ${required}`)
}

for (const path of filesBelow(root)) {
  const extension = extname(path)
  if (extension === '.json') JSON.parse(readFileSync(path, 'utf8'))
  if (extension === '.yaml' || extension === '.yml') {
    const document = parseDocument(readFileSync(path, 'utf8'))
    check(document.errors.length === 0, `${relative(root, path)} has invalid YAML`)
  }
  if (extension === '.sh') {
    const result = spawnSync('bash', ['-n', path], { encoding: 'utf8' })
    check(result.status === 0, `${relative(root, path)}: ${result.stderr.trim()}`)
  }
  if (extension === '.py') {
    const result = spawnSync(
      'python3',
      [
        '-c',
        'import ast, pathlib, sys; ast.parse(pathlib.Path(sys.argv[1]).read_text(), filename=sys.argv[1])',
        path,
      ],
      { encoding: 'utf8' },
    )
    check(result.status === 0, `${relative(root, path)}: ${result.stderr.trim()}`)
  }

  const content = readFileSync(path)
  check(!content.includes(0), `${relative(root, path)} contains a NUL byte`)
}

for (const token of ['${CLAUDE_SKILL_DIR}', '${CLAUDE_PLUGIN_ROOT}']) {
  check(!filesBelow(skillsRoot).some((path) => readFileSync(path).includes(token)), `unresolved token: ${token}`)
}

console.log('Distribution verification passed: 51 skills, 40 workflows, 1 plugin')
