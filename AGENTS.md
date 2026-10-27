# Workspace boundary

These instructions apply to every task and new chat started in this repository,
including resumed sessions after a restart.

- Keep all project file reads, searches, writes, and command working directories
  inside `/home/dlee/ai-slop/amps-spark-cli-gui` and its descendants.
- Do not inspect parent or sibling directories, other repositories, home-directory
  files, or external installations. Do not follow symlinks outside this boundary.
- Do not search outside this directory for missing tools, including Spark, or
  inspect their external launcher scripts. If a required project resource is
  unavailable here, explain what is missing and ask the user to provide it here.
- Installed system tools may execute as needed, including their required runtime
  libraries; this does not authorize browsing unrelated filesystem content.
- Keep task-created temporary files and caches inside this repository's `tmp/`
  directory. Set tool-specific cache or temporary paths accordingly when needed.
- Do not broaden filesystem permissions or bypass the sandbox to reach outside
  this directory. An exception requires an explicit user instruction for the
  specific external path and action.

## Authorized Spark exception

The user explicitly authorized using the existing Spark installation in place:
`/home/dlee/ampsVersion/AMPS-5.3.5.131-Release-Linux/bin/spark`.
Configure and execute this exact launcher, with its required runtime JAR
`/home/dlee/ampsVersion/AMPS-5.3.5.131-Release-Linux/bin/lib/amps_spark.jar`.
Do not copy the installation, modify it, or browse other external paths.
The local `spark.local.json` records this exact executable exception; input/output
file paths remain restricted to the workspace.

## Persistent enforcement

This installation currently uses this repository as `CODEX_HOME`. Its local,
gitignored `config.toml` selects a `workspace-only` permission profile that denies
filesystem access outside workspace roots except Codex's minimal system-runtime
paths and the explicitly authorized Spark launcher/JAR, and denies system temporary directories. Restart the Codex runtime to
load changes. Legacy sandbox flags, higher-priority settings, or a different
`CODEX_HOME` can override or omit this profile; these instructions still apply.

AGENTS.md is persistent agent guidance, not an operating-system security boundary.
