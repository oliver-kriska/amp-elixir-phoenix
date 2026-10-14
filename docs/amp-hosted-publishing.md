# Amp-hosted publishing

This wrapper owns delivery of the validated phxagents distribution to the
maintainer's Amp-hosted **User Skills** and **User Plugins** repositories.
Application repositories do not install, pin, update, or remove these artifacts.

```text
canonical main → sync PR → full CI → automatic merge → main CI → stable
                                                                  │
                                                                  ├─▶ User Skills
                                                                  └─▶ User Plugins
```

Amp loads personal repository artifacts in new threads and Orbs. Existing
sessions must reload skills and plugins to pick up a publication immediately.
Canonical changes are checked daily. Successful main CI starts publication
immediately; a separate daily publication schedule also retries delivery.

## Safety and ownership

`scripts/publish-amp-hosted.mjs` accepts separate User Skills and User Plugins
checkouts. It verifies the wrapper distribution manifest and payload before it
touches either checkout, then preflights both repositories before preparing the
skills repository.

Each hosted repository receives `.phxagents-managed.json`, which records:

- the wrapper and canonical revisions;
- the distribution-manifest SHA-256;
- the repository kind; and
- the complete top-level entries owned by phxagents.

On every publication, the publisher replaces each currently managed entry and
removes entries recorded by the previous marker but absent from the new
distribution. This makes future removals deterministic. A managed skill
directory or plugin file is fully owned by this wrapper; stale files inside it
are removed. Unlisted top-level files and directories are preserved.

The first publication bootstraps ownership by replacing the current 51 skill
names and two plugin names. That replacement removes the older shell-based
`phx-watch-pr` resources while preserving unrelated hosted artifacts.

The publisher refuses dirty hosted checkouts, unsafe or foreign ownership
markers, an uncommitted distribution payload, or hosted branches that do not
match `origin/main` when `--push` is used. It never force-pushes.

## Local review and manual publication

Requirements:

- Node.js 22.22.2 or newer;
- the current Amp CLI, authenticated as the owner of writable User Skills and
  User Plugins repositories; and
- a Git author name and email.

Start from the promoted wrapper revision, then clone fresh hosted checkouts
outside this wrapper repository:

```bash
git fetch origin stable
git switch --detach origin/stable
workdir="$(mktemp -d)"
amp clone user-skills "$workdir/skills"
amp clone user-plugins "$workdir/plugins"
npm ci
npm test
```

Prepare local commits without changing hosted state:

```bash
npm run hosted:publish -- \
  --skills-repository "$workdir/skills" \
  --plugins-repository "$workdir/plugins"

git -C "$workdir/skills" show --stat --oneline HEAD
git -C "$workdir/plugins" show --stat --oneline HEAD
```

After review, publish those prepared commits in the required order:

```bash
git -C "$workdir/skills" push origin HEAD:main
git -C "$workdir/plugins" push origin HEAD:main
```

Alternatively, use fresh clean checkouts and let the publisher enforce the
ordering and verify each remote result:

```bash
npm run hosted:publish -- \
  --skills-repository "$workdir/skills" \
  --plugins-repository "$workdir/plugins" \
  --push
```

Without `--push`, no remote state changes. When both hosted repositories already
carry the same wrapper revision and bytes, the command creates no commits and
performs no pushes.

## Scheduled and manual GitHub workflow

`.github/workflows/sync-canonical.yml` runs daily at 06:23 UTC and supports manual
dispatch on `main`. It rebuilds the single generated sync PR, calls reusable CI
at the exact head SHA, and merges only after both quality and Amp runtime checks
pass. A changed PR head or wrapper base blocks the merge until the next sync.
The merge step explicitly dispatches main CI because `GITHUB_TOKEN` merges do
not trigger push workflows. Main CI revalidates the merged revision, promotes
`stable`, verifies raw delivery, and explicitly dispatches the publisher.

`.github/workflows/publish-amp-hosted.yml` also runs daily at 07:41 UTC as a
recovery path and supports manual `workflow_dispatch`. It is bounded to 15
minutes, checks out `stable`, runs the full test suite, installs the current Amp
CLI, clones both hosted repositories, and invokes the publisher with `--push`.

Create a repository Actions secret named `AMP_PUBLISH_API_KEY`. Its value must
be an Amp access token from **Personal Settings → Security** for the owner of the
writable User Skills and User Plugins repositories. The workflow maps that
secret to the CLI's documented `AMP_API_KEY` environment variable only for clone
and publish steps. Do not put the token in repository files, workflow arguments,
or logs.

No GitHub write permission, deployment credential, application-repository
secret, or Enaia workflow is required. The workflow does not merge, deploy, or
change wrapper branches.

## Failure and recovery

Failed sync validation leaves its PR open and does not merge or publish the
candidate. The next sync rebuilds from current wrapper and canonical `main`.
Even a no-change sync dispatches main CI, recovering from a previous interrupted
dispatch or failed promotion without requiring another canonical change.
To retry immediately, run **Sync canonical Amp artifacts** on `main`.

Both target repositories are validated before any managed file changes. During
publication:

1. Skills are prepared, committed, pushed, and remote-verified.
2. Only after success are plugins prepared, committed, pushed, and verified.

If validation or the skills push fails, plugins remain untouched. If the plugin
push fails after skills succeed, the hosted repositories can temporarily report
different marker revisions because Git cannot atomically update two repositories.
Rerun the workflow or run a fresh manual publication: the skills phase is a
no-op and the plugins phase completes the matching revision. Plugins are never
advanced before their corresponding skills.

The test harness uses local bare repositories and receive hooks to verify exact
artifact copies and executable modes, unrelated-file preservation, stale managed
entry cleanup, matching markers, skills-first ordering, no-op reruns, local-only
preparation, unsafe-marker rejection, and stop-on-skills-push-failure behavior.
