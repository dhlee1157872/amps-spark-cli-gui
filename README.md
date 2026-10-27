# Spark Workbench

A local React + TypeScript interface for the AMPS Spark CLI. Vite builds the UI;
an Express/Node.js backend owns Spark processes and streams their actual output.
No AMPS client library or simulated server responses are used in the app.

## Start

Requires Node.js 22.12 or later, npm, and the Java runtime required by your Spark
distribution. Run from this repository:

```bash
npm install
npm run dev
```

Open **http://localhost:4310**. You can explore the interface before installing
Spark. Command buttons remain unavailable until the backend finds an executable.
The app listens on loopback only; this prototype is for local use on Linux/WSL.

This checkout is configured in gitignored `spark.local.json` to use the existing
Spark installation directly, without copying it. Both `npm run dev` and `npm start`
read this file. For example:

```json
{
  "executable": "/absolute/path/to/bin/spark",
  "allowedExternalExecutables": ["/absolute/path/to/bin/spark"]
}
```

External executables require an exact absolute allowlist entry and cannot redirect
through symlinks. This exception applies only to launching Spark; command input
and output files remain workspace-restricted. Refresh the page after changing
local settings. Restart the backend after changing environment variables or code.

Without local configuration, the default is `./tools/spark/bin/spark`. To override
the configured executable (external overrides still require an allowlist entry):

```bash
SPARK_BIN=./path/inside/workspace/bin/spark npm run dev
```

The GUI does not download or copy Spark.
Java must be available to Spark through your normal environment. Inspect your
distribution's heap requirements before running multiple sessions; the GUI
allows up to six active processes. `PORT=4311 npm run dev` changes the port.

## Workflow

1. Enter the server as `hostname:port`, message type, and protocol. Optional
   username/password and TLS controls are under Authentication & security.
2. Optionally configure Topic discovery with an AMPS admin URL. Open the workspace;
   this selects a destination and loads topic names if configured. Spark starts
   only when a command runs.
3. Choose a command. Query, Subscribe, Publish, Query + subscribe, Ping, Latency,
   Delete, Log replay, and CLI help all launch the installed Spark executable.
4. Use advanced option rows for additional flags. CLI reference runs `spark help`
   for the selected command, so the help matches your installed version.
5. Keep a subscription open while opening a publisher. Send writes to the same
   publisher's stdin each time; JSON is validated and compacted to a single line.
6. Stop ends the process group, including Java children. A closed browser has a
   30-second reconnect grace period before unattended sessions are stopped.

Connection settings are remembered in browser storage; passwords are kept only
in memory. Authenticated commands currently require both username and password;
interactive password prompts are unsupported. Spark's command-line credential
format can expose passwords to local process inspection. Command previews redact
passwords. Treat server output as potentially sensitive when copying/exporting.

## Optional topic-name suggestions

Expand **Topic discovery** on the server entry screen and enter an admin base URL
such as `http://localhost:8085`, or the full endpoint
`http://localhost:8085/amps/instance/sow.json`. The AMPS HTTP admin interface must
already be enabled server-side; the GUI does not change AMPS configuration.

The local backend fetches the endpoint once when the workspace opens and returns
only the unique `amps.instance.sow[].topic` names. The URL is saved with the
connection profile. All topic inputs filter suggestions as you type; Arrow keys
and Enter select a name, Escape closes the list, and custom names remain valid.
Filtering happens in the browser without a request per keystroke. **Refresh**
beside Topic reloads names when server configuration changes. Changing servers
clears the prior suggestions.

The SOW list may not include every publish/subscribe topic. Suggestions never
restrict what you can enter. Unreachable endpoints, timeouts, and invalid
responses leave manual entry available. Admin lookup supports HTTP/HTTPS with a
five-second timeout and 8 MB response limit, rejects redirects, and does not send
Spark credentials. Authenticated admin endpoints are not yet supported. Spark
commands continue to use the CLI; the admin call only supplies topic names.

## Output and lifecycle

- Running means the process is running, not that the server accepted a connection.
- Sent means written to stdin, not acknowledged by AMPS.
- Raw stdout and stderr are preserved as stream chunks, not parsed into message
  records. The display retains the most recent 500 entries per session, each up
  to 8 KiB. Older output is discarded; downloads contain the current filtered
  display, not the full session history.
- Auto-scroll can be disabled while inspecting output. Clear affects only the
  display. Stop affects the actual process.
- Refresh restores session history and running processes while the backend stays
  alive. Passwords must be entered again before starting new authenticated work.
- Changing the selected server requires stopping active sessions first.
- Deletion requires an explicit filter and a confirmation. Replay/latency flags
  depend on your Spark version; consult CLI reference. File inputs must exist
  inside the workspace. Direct SOW file output is not supported in v1.
- Shutdown kills active children. A backend crash or OS termination cannot offer
  the same graceful cleanup guarantee. Do not use this prototype as a daemon.

## Build and verify

```bash
npm test
npm run build
npm start
```

`npm start` serves the production UI and API at the same local URL. `npm test`
uses an explicitly separate subprocess fixture to verify persistent stdin,
streaming, exit errors, cancellation, argument boundaries, and disconnect cleanup.
These tests do not claim live AMPS compatibility; verify with your Spark version
and a test server before using write operations.

## Layout

- `src/`: React UI and styling.
- `shared/`: command metadata and client/server types.
- `server/commands.ts`: validation, argument construction, executable resolution.
- `server/sessions.ts`: subprocess lifecycle, stdin, output, cleanup.
- `server/topics.ts`: optional AMPS admin lookup returning topic names only.
- `server/index.ts`: loopback API, event streaming, Vite/static serving.

The backend validates local Host/Origin headers and requires a per-run token for
session APIs. It does not expose a general shell endpoint. The local filesystem
and network configuration is not intended for multi-user hosting.
