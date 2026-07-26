# Elixir and Phoenix Workflows for Amp

[![CI](https://github.com/oliver-kriska/amp-elixir-phoenix/actions/workflows/ci.yml/badge.svg)](https://github.com/oliver-kriska/amp-elixir-phoenix/actions/workflows/ci.yml)

Deterministic Elixir, Phoenix, LiveView, Ecto, Oban, testing, and security
workflows for [Amp](https://ampcode.com/). This distribution combines 51 Agent
Skills with one Amp plugin that exposes explicit command-palette workflows,
read-only specialists, bounded parallel analysis, and lifecycle safety guards.

This repository is the installable Amp distribution generated from
[`oliver-kriska/claude-elixir-phoenix`](https://github.com/oliver-kriska/claude-elixir-phoenix),
which remains the canonical source and contribution repository.

## Install in one project

Run these commands from the Elixir/Phoenix project where Amp should use the
workflows:

```bash
amp skill add \
  https://github.com/oliver-kriska/amp-elixir-phoenix/tree/main/skills \
  --target "$PWD/.agents/skills"

mkdir -p .amp/plugins
curl --fail --silent --show-error --location \
  https://raw.githubusercontent.com/oliver-kriska/amp-elixir-phoenix/main/plugins/elixir-phoenix.ts \
  --output .amp/plugins/elixir-phoenix.ts
```

Project-local installation is recommended because the guidance is intentionally
opinionated. Decide independently whether your team should commit
`.agents/skills/` and `.amp/plugins/elixir-phoenix.ts`.

## Install globally

Use a global installation only when most of your Amp work is Elixir/Phoenix:

```bash
amp skill add \
  https://github.com/oliver-kriska/amp-elixir-phoenix/tree/main/skills \
  --global

mkdir -p "$HOME/.config/amp/plugins"
curl --fail --silent --show-error --location \
  https://raw.githubusercontent.com/oliver-kriska/amp-elixir-phoenix/main/plugins/elixir-phoenix.ts \
  --output "$HOME/.config/amp/plugins/elixir-phoenix.ts"
```

Amp installs global skills under `~/.config/agents/skills/` and system plugins
under `~/.config/amp/plugins/`.

Amp currently restricts `amp plugins add` and directive-based auto-updates to
Amp-hosted plugins, so third-party GitHub plugins must be downloaded directly.
The commands above are the tested installation path; review downloaded plugin
code before running it.

## Verify the installation

Start a fresh Amp process from the target project, then run:

```bash
amp skill list
amp plugins list
```

The skill list should include entries such as `phx-investigate`, `phx-review`,
`testing`, and `liveview-patterns`. The plugin list should include
`elixir-phoenix.ts`.

Open Amp's command palette with <kbd>Ctrl</kbd>+<kbd>O</kbd>. Choose a workflow
such as **phx: investigate** or **phx: review**, then send the task in your next
prompt. The plugin injects that installed skill for exactly one turn, so its use
does not depend on model-driven skill selection.

## What is included

### 45 deterministic palette commands

The plugin exposes 40 existing workflows plus five native controls:

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

When `phx: full` is explicitly armed, the plugin observes recognized edits and
requires a later Elixir verification command with exit code exactly zero. A
missing check gets one bounded continuation rather than an unbounded loop.
Piped, chained, echoed, neutralized, or pre-edit checks do not satisfy the
gate. `mix format --check-formatted` is a check; plain `mix format` is not.

## Boundaries

- This is not complete Claude Code hook or agent parity. Five of 26 canonical
  specialists are ported.
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
  https://github.com/oliver-kriska/amp-elixir-phoenix/tree/main/skills \
  --target "$PWD/.agents/skills" \
  --overwrite
```

Use `--global --overwrite` instead for a global skill update. Update a
project-local plugin by downloading the current file again:

```bash
curl --fail --silent --show-error --location \
  https://raw.githubusercontent.com/oliver-kriska/amp-elixir-phoenix/main/plugins/elixir-phoenix.ts \
  --output .amp/plugins/elixir-phoenix.ts
```

Use the global output path from the installation section for a global plugin
update. Native third-party auto-update can replace this manual step if Amp
opens that capability in the future.

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

Local verification does not invoke paid models:

```bash
npm ci
npm test
```

CI validates all 51 skill frontmatter blocks and bundled resources, type-checks
the plugin against `@ampcode/plugin`, exercises command/specialist/lock/gate
behavior, lints Markdown, audits dependencies, and loads the plugin with the
latest Amp CLI. Every green push to `main` is immediately installable through
GitHub's raw URL; a final delivery job compares that published artifact with the
committed plugin.

## License

[MIT](LICENSE) © 2025-2026 Oliver Kriska
