# Elixir and Phoenix Workflows for Amp

[![CI](https://github.com/oliver-kriska/amp-elixir-phoenix/actions/workflows/ci.yml/badge.svg)](https://github.com/oliver-kriska/amp-elixir-phoenix/actions/workflows/ci.yml)

Deterministic Elixir, Phoenix, LiveView, Ecto, Oban, testing, and security
workflows for [Amp](https://ampcode.com/). This distribution combines 51 Agent
Skills with two Amp plugins: the existing command-palette, specialist, parallel
analysis, and lifecycle guards plus the native `phx-watch-pr` worker watcher.

This repository is the installable Amp distribution generated from
[`oliver-kriska/claude-elixir-phoenix`](https://github.com/oliver-kriska/claude-elixir-phoenix),
which remains the canonical source and contribution repository.

## Managed Amp-hosted distribution

The maintained installation target is the owner's Amp-hosted **User Skills**
and **User Plugins** repositories. Amp makes those artifacts available in every
new thread and Orb independently of the application checkout. Existing sessions
can reload them without reinstalling files.

Application repositories do not own this distribution. In particular, Enaia
and similar applications must not copy these skills or plugins into
`.agents/skills/` or `.amp/plugins/`, pin this wrapper, or run an app-local
updater. The wrapper publishes the validated `stable` revision once per day;
see [Amp-hosted publishing](docs/amp-hosted-publishing.md).

## Public installation for other Amp users

Users who do not receive the owner's Amp-hosted repositories can install the
public `stable` distribution globally on one machine:

```bash
amp skill add \
  https://github.com/oliver-kriska/amp-elixir-phoenix/tree/stable/skills \
  --global

mkdir -p "$HOME/.config/amp/plugins"
for name in elixir-phoenix phx-watch-pr; do
  plugin="$HOME/.config/amp/plugins/${name}.ts"
  temporary="$(mktemp "${plugin}.XXXXXX")"
  curl --fail --silent --show-error --location \
    "https://raw.githubusercontent.com/oliver-kriska/amp-elixir-phoenix/stable/plugins/${name}.ts" \
    --output "$temporary" && mv "$temporary" "$plugin"
done
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
`elixir-phoenix.ts` and `phx-watch-pr.ts`.

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

### Native PR watcher

`phx-watch-pr` keeps the current worker thread alive while required CI and
actionable review threads are pending, then wakes it only for meaningful
changes. With `--fix`, it serializes review-fix turns. It never merges or
deploys. The workflow requires **both** the installed `phx-watch-pr` skill and
the native `phx-watch-pr.ts` plugin; the skill supplies operating guidance and
the plugin supplies keep-alive, durable thread, and webhook behavior.

The watcher's stable standalone URL is:

```text
https://raw.githubusercontent.com/oliver-kriska/amp-elixir-phoenix/stable/plugins/phx-watch-pr.ts
```

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

The owner's Amp-hosted installation is updated only by this wrapper's publisher.
Application repositories have nothing to update or remove. A new Amp thread
loads the hosted revision automatically; reload skills and plugins in an
existing session when an immediate refresh is needed.

The public one-machine installation is copied at installation time. Update its
skills explicitly, then download the plugins again with the loop from the
installation section:

```bash
amp skill add \
  https://github.com/oliver-kriska/amp-elixir-phoenix/tree/stable/skills \
  --global \
  --overwrite
```

Remove the one-machine plugins with:

```bash
rm "$HOME/.config/amp/plugins/elixir-phoenix.ts"
rm "$HOME/.config/amp/plugins/phx-watch-pr.ts"
```

Remove globally copied skill directories individually from
`~/.config/agents/skills/`; do not delete that shared root.

## Development and delivery

The repository intentionally contains generated distribution artifacts. Make
behavior changes in the
[source repository](https://github.com/oliver-kriska/claude-elixir-phoenix),
regenerate the Amp target there, and then sync that target here. Given a local
canonical checkout, the deterministic command copies all Amp skills, the
watcher plugin, and its lifecycle harness, records the canonical commit, and
refreshes the manifest:

```bash
npm run sync:canonical -- /path/to/claude-elixir-phoenix
npm run sync:canonical:check -- /path/to/claude-elixir-phoenix
# --dry-run is an alias for --check and does not modify files
```

Run `npm run manifest:update` only for independent wrapper artifact changes.
CI rejects missing, unexpected, modified, or mode-drifted distribution files.

Local verification does not invoke paid models:

```bash
npm ci
npm test
```

CI validates the exact manifest for all 51 skills and bundled resources,
type-checks both plugins against `@ampcode/plugin`, exercises the legacy plugin
and the watcher's model-free lifecycle harness, lints Markdown, audits
dependencies, and loads both plugins with the latest Amp CLI. Only a green push
to `main` promotes the exact validated commit to the `stable` distribution
branch; a final delivery job compares both promoted raw artifacts with their
validated files. Failed commits on `main` are never exposed through the
documented installation URLs.

A conservative daily/manual workflow checks canonical `main` and opens or
updates the single `automation/sync-canonical-amp` PR only when generated files
change. It never merges or pushes to wrapper `main`/`stable`; the existing main
CI remains the promotion authority. Repository Actions must be permitted to
create pull requests (Settings → Actions → General → Workflow permissions).

A separate daily/manual workflow publishes the already validated `stable`
revision to Amp-hosted User repositories, skills first and plugins second. It
requires an `AMP_PUBLISH_API_KEY` Actions secret and never writes this GitHub
repository. See the [operator guide](docs/amp-hosted-publishing.md) for local
review, ownership, failure, and recovery behavior.

## License

[MIT](LICENSE) © 2025-2026 Oliver Kriska
