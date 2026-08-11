# Elixir and Phoenix Workflows for Amp

[![CI](https://github.com/oliver-kriska/amp-elixir-phoenix/actions/workflows/ci.yml/badge.svg)](https://github.com/oliver-kriska/amp-elixir-phoenix/actions/workflows/ci.yml)

Deterministic Elixir, Phoenix, LiveView, Ecto, Oban, testing, and security
workflows for [Amp](https://ampcode.com/). This distribution combines 51 Agent
Skills with one Amp plugin that exposes 40 paired-local workflow wrappers,
read-only specialists, bounded parallel analysis, and lifecycle safety guards.

This repository is the installable Amp distribution generated from
[`oliver-kriska/claude-elixir-phoenix`](https://github.com/oliver-kriska/claude-elixir-phoenix),
which remains the canonical source and contribution repository.

## Choose a profile

- **Hosted-native:** publish skills and the plugin independently to Amp personal
  or workspace repositories, skills first. Use native `skill: invoke` for
  deterministic skill loading. Specialists, parallel commands, and edit lock
  work, but filesystem wrappers cannot load hosted-only skill bodies and native
  `phx-full` does not arm the plugin gate.
- **Paired-full:** install matching skills and plugin locally. Native
  `skill: invoke` works, and all 40 wrappers can inject the paired skill. The
  paired `phx: full` wrapper also activates the bounded verification gate.

Personal and workspace hosted repositories are account scopes. They are not the
same as `amp skill add --global`, which installs a machine-local copy. Keep the
GitHub/curl path below for pinned, reproducible, and backward-compatible
installation.

## Install paired-full in one project

Run these commands from the Elixir/Phoenix project where Amp should use the
workflows:

```bash
amp skill add \
  https://github.com/oliver-kriska/amp-elixir-phoenix/tree/stable/skills \
  --target "$PWD/.agents/skills"

mkdir -p .amp/plugins
plugin=".amp/plugins/elixir-phoenix.ts"
temporary="$(mktemp "${plugin}.XXXXXX")"
curl --fail --silent --show-error --location \
  https://raw.githubusercontent.com/oliver-kriska/amp-elixir-phoenix/stable/plugins/elixir-phoenix.ts \
  --output "$temporary" && mv "$temporary" "$plugin"
```

Project-local installation is recommended because the guidance is intentionally
opinionated. Decide independently whether your team should commit
`.agents/skills/` and `.amp/plugins/elixir-phoenix.ts`.

## Install paired-full on one machine

Use a machine-local installation only when most of your work on that computer is
Elixir/Phoenix:

```bash
amp skill add \
  https://github.com/oliver-kriska/amp-elixir-phoenix/tree/stable/skills \
  --global

mkdir -p "$HOME/.config/amp/plugins"
plugin="$HOME/.config/amp/plugins/elixir-phoenix.ts"
temporary="$(mktemp "${plugin}.XXXXXX")"
curl --fail --silent --show-error --location \
  https://raw.githubusercontent.com/oliver-kriska/amp-elixir-phoenix/stable/plugins/elixir-phoenix.ts \
  --output "$temporary" && mv "$temporary" "$plugin"
```

Amp installs machine-local skills under `~/.config/agents/skills/` and system
plugins under `~/.config/amp/plugins/`. These copies do not follow your Amp
account to another machine or orb.

Amp currently restricts `amp plugins add` and directive-based auto-updates to
Amp-hosted plugins, so third-party GitHub plugins must be downloaded directly.
The commands above are the tested installation path; review downloaded plugin
code before running it.

## Verify the installation

Start a fresh Amp process from the target project, then run:

```bash
amp skills list --json
amp plugins list
```

The skill list should include entries such as `phx-investigate`, `phx-review`,
`testing`, and `liveview-patterns`. Inspect `baseDir` and `source` to confirm the
intended copy won. The plugin list should include `elixir-phoenix.ts`.

Open Amp's command palette with <kbd>Ctrl</kbd>+<kbd>O</kbd>, run
`skill: invoke`, choose `phx-investigate` or `phx-review`, and send the task in
your next prompt. This native path resolves local, built-in, personal hosted,
and workspace hosted skills. A paired-full install also exposes wrappers such
as **phx: investigate** and **phx: review**.

## What is included

### 40 paired-local workflow wrappers

The plugin exposes 40 workflow wrappers plus five native controls:

- `phx: clear pending workflow`
- `phx: specialist`
- `phx: parallel review`
- `phx: parallel investigate`
- `phx: edit lock`

Familiar workflows keep their namespace, including `phx: investigate`,
`phx: review`, `phx: plan`, `phx: full`, `ecto: n1-check`, and `lv: assigns`.

### Five read-only specialists

Elixir, Ecto, LiveView, security, and testing specialists are restricted to
Amp's `Read` and `finder` tools. They cannot edit files, invoke shell commands,
or recursively spawn more agents.

Specialists default to `anthropic/claude-haiku-4-5-20251001`. List the models
available in your Amp version and optionally override the child model before
starting Amp:

```bash
amp plugins show-agent-options
ELIXIR_PHOENIX_AMP_SPECIALIST_MODEL=openai/gpt-5-mini amp
```

Starting the plugin makes no model call. A specialist command runs and bills
only its selected child agents plus the normal parent synthesis turn.

### Bounded parallel review and investigation

Parallel review fans out to five specialists. Parallel investigation uses four
read-only tracks: reproduction, root cause, impact, and fix strategy. Child
threads run locally, remain linked to the parent, time out after five minutes,
and use `Promise.allSettled` so one failure does not discard successful work.
The parent receives the successful evidence and covers only failed concerns
sequentially.

### Edit and verification guards

`phx: edit lock` persists an Amp workspace configuration that either freezes
recognized edits or allows them only under selected workspace-relative paths.
Shell tools are disabled while locked because arbitrary shell commands cannot
be proven read-only. Corrupt, unreadable, or workspace-escaping lock state
fails closed.

Only the paired-full `phx: full` wrapper arms the plugin gate. The plugin then
observes recognized edits and requires a later Elixir verification command with
exit code exactly zero. A missing check gets one bounded continuation rather
than an unbounded loop. Piped, chained, echoed, neutralized, or pre-edit checks
do not satisfy the gate. `mix format --check-formatted` is a check; plain
`mix format` is not. Native `skill: invoke` → `phx-full` follows the skill's
verification instructions but does not execute this wrapper hook.

## Boundaries

- This is not complete Claude Code hook or agent parity. Five of 26 canonical
  specialists are ported.
- Amp's Plugin API does not expose effective skill resolution, programmatic
  skill invocation, or the original nested invocation directory. Wrappers can
  resolve only supported machine-local roots and `.agents/skills` or
  `.claude/skills` from exposed `workspaceRoot` through its parents. Use native
  `skill: invoke` for hosted-only, built-in, plugin-cache, custom-path, or
  unexposed nested skills.
- Edit enforcement covers tools Amp's file-modification classifier recognizes.
  Unknown third-party mutating tools remain outside that boundary.
- Tidewave and other MCP servers remain project-specific configuration.
- A few administration skills retain Claude-oriented guidance as reference;
  the core review, investigation, planning, implementation, and verification
  workflows are adapted for Amp.
- Plugins execute trusted code. Review the plugin before installing it from a
  repository you do not trust.

## Update or remove

Skills are copied at installation time. Update them explicitly:

```bash
amp skill add \
  https://github.com/oliver-kriska/amp-elixir-phoenix/tree/stable/skills \
  --target "$PWD/.agents/skills" \
  --overwrite
```

Use `--global --overwrite` instead for a machine-local skill update. Update a
project-local plugin by downloading the current file again:

```bash
plugin=".amp/plugins/elixir-phoenix.ts"
temporary="$(mktemp "${plugin}.XXXXXX")"
curl --fail --silent --show-error --location \
  https://raw.githubusercontent.com/oliver-kriska/amp-elixir-phoenix/stable/plugins/elixir-phoenix.ts \
  --output "$temporary" && mv "$temporary" "$plugin"
```

Use the machine-local output path from the installation section for a system
plugin update. Native third-party auto-update can replace this manual step if
Amp opens that capability in the future.

Remove a workspace plugin with:

```bash
amp plugins remove elixir-phoenix.ts --target workspace
```

Remove package-owned skill directories from `.agents/skills/` individually.
Do not delete a shared skill root that also contains unrelated skills.

## Development and delivery

The repository intentionally contains generated distribution artifacts. Make
behavior changes in the
[source repository](https://github.com/oliver-kriska/claude-elixir-phoenix),
regenerate the Amp target there, and then publish that target here.
Run `npm run manifest:update` whenever generated plugin or skill artifacts
change; CI rejects missing, unexpected, modified, or mode-drifted artifacts.

The snapshot in this branch was generated from canonical commit
`e5b8b6d1dab928657f09f99d3ef99c57bc014452`. The distribution manifest records
the SHA-256 and executable bit for every generated artifact. The review PR also
records the standalone commit and aggregate hashes so the projection can be
audited before merge or `stable` promotion.

Local verification does not invoke paid models:

```bash
npm ci
npm test
```

CI validates the exact manifest for all 51 skills and bundled resources, type-checks
the plugin against `@ampcode/plugin`, exercises command/specialist/lock/gate
behavior, lints Markdown, audits dependencies, and loads the plugin with the
latest Amp CLI. Only a green push to `main` promotes the exact validated commit
to the `stable` distribution branch; a final delivery job compares that
promoted raw artifact with the validated plugin. Failed commits on `main` are
never exposed through the documented installation URLs.

## License

[MIT](LICENSE) © 2025-2026 Oliver Kriska
