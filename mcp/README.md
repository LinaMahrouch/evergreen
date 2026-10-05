# openGym MCP server

A [Model Context Protocol](https://modelcontextprotocol.io) bridge that lets an external LLM
application (Claude Desktop, Claude Code, Cursor, Cline, Continue, etc.) read your openGym
profile — routines, workouts, body-weight log, estimated 1RMs, and muscle balance — and, when
you pair it, **plan your training**: create and edit routines, lay out the week, move a day.

It runs locally as a stdio process spawned by the LLM client and adds no new container. It
works in one of two modes, chosen by what it finds at start:

| | **File mode** (the original) | **Paired mode** |
|---|---|---|
| Reaches your data | by reading `./data/state-<uid>.json` | through a running openGym api, as a paired device |
| Can | read | read **and write** |
| Needs | the data folder on this machine | the server's address and a one-time pairing code |
| Runs | on the server's own machine | anywhere that can reach the server |
| Setup | none | `npm run pair -- <url> <code>`, once |

The LLM never sees passkeys, VAPID keys, or session secrets in either mode. In file mode it
can only read the files the api already writes; in paired mode it holds the same kind of token
a paired phone holds, kept in `mcp/.auth.json`, and can do what that phone could.

The numbers it answers with are computed by the **same pure functions the React UI uses**
(`frontend/src/lib/*.js`) — `estimate1RM`, `loadOfWorkouts`, `effectiveRoutine`, etc. — so a
"what's my bench 1RM?" answer matches the Stats screen exactly. The routines it writes are
built by the app's own plan importer (`plan-share.js`), so a routine an assistant creates is
exactly what importing the same plan as a file would have produced.

## Quick start

### 1. Install

```bash
cd mcp
npm install
```

### 2. Point it at your data

The MCP server reads the same `./data` directory `docker compose up` creates. Pick the profile
to answer for — its user id is in `./data/db.json` under `users[].id`:

```bash
# single-user instance (the common self-hosted case) — auto-detected:
node src/index.js

# multi-user instance, or just to be explicit:
OPENGYM_UID=<your-uid> OPENGYM_DATA=/path/to/openGym/data node src/index.js
```

### 3. Register with your LLM client

Add the server to your LLM client's MCP config. For Claude Desktop, edit
`claude_desktop_config.json` (macOS: `~/Library/Application Support/Claude/claude_desktop_config.json`):

```jsonc
{
  "mcpServers": {
    "opengym": {
      "command": "node",
      "args": ["/absolute/path/to/openGym/mcp/src/index.js"],
      "env": {
        "OPENGYM_DATA": "/absolute/path/to/openGym/data",
        "OPENGYM_UID": "<your-uid>"   // optional — auto-detected if you have one profile
      }
    }
  }
}
```

For Cursor and other MCP-compatible clients, see the client's MCP docs — the same `command` +
`args` + `env` shape is what every stdio MCP server expects.

Restart the client; you should see the openGym tools appear with "serving profile \<name\>" on
the server's stderr.

### 4. Let it plan (optional)

File mode can only read. To let the assistant write routines, pair the MCP server with your
running openGym, the same way the phone app is paired:

1. Open openGym in a browser, signed in. **Settings → "Pair the mobile app"** shows a code. It
   works once and for five minutes.
2. In this folder:

   ```bash
   npm run pair -- http://localhost:8080 ABCD1234
   ```

   Use the address you open openGym at. The token it gets back is saved to `mcp/.auth.json`
   (gitignored, mode 600) and renews itself as long as the server is used at least once every
   `SESSION_DAYS`.
3. Restart the LLM client. The server now logs `paired with <url> … (read + write)`.

Once paired, `OPENGYM_DATA` and `OPENGYM_UID` are not used: everything goes through the api,
so the MCP server no longer has to run on the machine that holds the data. To run it without
an auth file (a container, CI), set `OPENGYM_URL` and `OPENGYM_TOKEN` instead.

"Sign out everywhere" in openGym revokes this pairing along with every other device's; pair
again to restore it. To go back to read-only, delete `mcp/.auth.json`.

**Why through the api and not the file?** The api is the only writer of a state file, and its
compare-and-write on the document's revision is only atomic inside its own process. A second
process writing the file could overwrite a set your phone logged a second earlier and leave two
different documents under one revision number. So every write here is the api's own conditional
`PUT /api/data`: if another device wrote in between, the server answers 409 with the current
document and the change is applied again on top of it. Nothing is lost on either side.

## Tools

Nine read tools, available in both modes:

| Tool | What it answers |
|---|---|
| `list_routines` | What routines are saved in my profile? (names + exercise counts) |
| `get_routine` | What does the Push Day routine prescribe? (sets/reps/weight and rest per exercise) |
| `preview_session` | What will the app actually put on screen when I start this routine — after the progression policy and my history have overridden the plan? |
| `get_week_plan` | What's on my plan this week, including today with any date-specific override? |
| `list_workouts` | Recent sessions — newest first, with dates, sets done/planned, volume, duration, PRs. |
| `get_workout` | Full set-by-set breakdown of one session, by `workout_id` or by date. On a day with two sessions the date alone returns both ids to pick from rather than guessing at one. |
| `get_bodyweight` | Weigh-ins with the latest weight, the goal line, and deltas vs goal. |
| `estimate_1rm` | All-time best 1RM for an exercise + the trend, or a PR table across all exercises. |
| `muscle_balance` | Which muscles I've trained this week/month/all-time, ranked + which I've neglected. |

`get_routine` and `preview_session` answer two different questions, and confusing them is the
easiest way for a coach to give wrong advice. `get_routine` reports what the routine *stores*.
`preview_session` reports what the athlete will actually *see*: a routine holding "squat 3×8 @
60 kg" opens at 75 kg if the policy progressed or deloaded from that routine's last logged
session. The routine's own weight is the last fallback the session builder consults, not the
first; its reps hold unless a policy that moves reps moved them, or the profile starts planned
sessions from the last session (`starts_from`). Ask `preview_session` before naming a weight.

Each tool returns JSON the LLM can format as it likes; structured fields (sets, dates, levels)
are pre-formatted into human-readable labels in `src/labels.js` so the LLM doesn't need to
re-interpret them.

### Planning tools

Nine more. `planning_status` and `search_exercises` work in both modes; the seven that write
need paired mode and answer `EREADONLY`, with the steps to pair, in file mode.

| Tool | What it does |
|---|---|
| `planning_status` | Can this server write, or only read — and how to enable writing if not. |
| `search_exercises` | Find exercises in the 1,324-entry library (plus your own) by name, body part or equipment. Returns the ids every other planning tool needs. Tolerates typos. |
| `create_routine` | Add one new routine: a named list of exercises with sets, reps or a rep range, seconds for holds, minutes and speed for cardio, rest, warm-up sets, supersets, a note. |
| `create_plan` | Add several routines and put them on weekdays in one step: a whole programme in one save. |
| `update_routine` | Rename a routine, change its progression rule, or replace its exercise list. An exercise that stays keeps every setting you do not mention. |
| `delete_routine` | Delete a routine and take it off the week. Needs the routine's exact name as confirmation. Logged workouts are kept. |
| `set_week_plan` | Put routines on weekdays. An empty list makes a rest day; two ids make a combined session. |
| `set_day_override` | Change one calendar date without touching the weekly plan: another routine, a rest day, or back to the plan. |
| `log_bodyweight` | Log a weigh-in. One per day; the same date again replaces it. |

What an assistant can **not** do through these: log or edit a workout, change settings, delete
history. Nothing existing is ever overwritten by `create_*` — new routines get fresh ids and sit
beside yours — and anything a tool rejects is rejected before a byte is saved.

A plan made this way shows up in the app on its next sync, within about half a minute on a
device that is open.

**Good first prompts**

- *"Look at my last four weeks and my muscle balance, then build me a four-day upper/lower
  plan that fixes what I've been neglecting. Put it on Mon, Tue, Thu, Fri."*
- *"My bench has stalled for three sessions. What does `preview_session` say I'll be asked to
  lift next, and how would you change my push day?"*
- *"I can't train this Thursday. Move it to Friday."*

## How it reuses the training logic

The MCP server imports the training helpers under `frontend/src/lib/` directly as Node ESM
and calls the same functions the React UI does (`history.js`, `onerm.js`, `muscles.js`,
`exercises.js`). The numbers it returns match what the Stats screen shows, because they are
the same code.

The one lib file that wasn't Node-safe was `i18n.js` (Vite's `import.meta.glob` at module
top level) — split into `i18n-core.js` (pure, Node-safe) + `i18n.js` (Vite/React bits,
re-exports from core). `exercises.js` got a one-line `import.meta.env || {}` guard. No new
dependencies landed in `frontend/`, no public exports changed.

## Design constraints honoured

- **One runtime dependency beyond the MCP SDK:** none. No database driver, no HTTP framework;
  paired mode uses node's own `fetch`.
- **No new container.** stdio transport is spawned by the LLM client; nothing to add to
  `docker-compose.yml`.
- **No new auth, no new server route.** File mode: the filesystem is the boundary — same as
  `docker compose` running on the user's box. Paired mode: the pairing code and bearer token
  the phone app already uses (`/api/pair/redeem`, `/api/me`, `/api/data`). No passkey material,
  VAPID keys, or session secrets ever cross either.
- **No telemetry.** File mode makes no network request at all. Paired mode talks to the one
  openGym server you paired it with and nothing else. Exits when the LLM client disconnects.

## Tests

```bash
cd mcp && npm test
```

108 cases in two files, both seeding state from `frontend/src/lib/demoSeed.js` (the same
deterministic fixture the public demo runs on).

`test/tools.test.js` pins the read tools' JSON shape and the user-facing edge cases: rest-day
override, missing routine, zero-workout history, no synced state, superset links, three 1RM
formulas. "Today" is pinned via `vi.useFakeTimers({ now: ..., toFake: ['Date'] })` so
date-dependent tools see consistent values regardless of when the suite runs.

`test/plan-tools.test.js` covers the planning tools as pure functions over a draft (what each
write does and refuses), and the write path against a fake api that answers 409 the way the
real one does: a write from another device in between is kept and the change re-applied, a
rejected input writes nothing, a profile that never stops changing gives up without writing.

The pure lib functions have their own tests in `frontend/src/lib/*.test.js`.

## Roadmap

- **Done (Phase 1):** read-only stdio, 8 tools, direct `./data` access.
- **Done (Phase 1.5):** `preview_session` — the policy's next prescription, the opening set
  rows it produces, and which of plan / confirmed weight / history each number came from.
- **Done (Phase 2, planning):** read+write over stdio as a paired device. The two things this
  phase was waiting on turned out to exist already: the token is the mobile pairing
  (`/api/pair/*`), and the write-lock is the api's conditional `PUT /api/data` (`baseRev` → 409),
  so neither `./data/tokens.json` nor a file lock was needed. Tools: `create_routine`,
  `create_plan`, `update_routine`, `delete_routine`, `set_week_plan`, `set_day_override`,
  `log_bodyweight`, plus `search_exercises`.
- **Not yet:** `log_workout`. Saving a session is more than appending it — records, kept
  weights and progression all read it back (`finish-workout.js`, `sheets.jsx doFinishWorkout`)
  — and it should go through the same pure helpers before an assistant is allowed to do it.
- **Phase 3:** Streamable HTTP transport, opt-in 4th container in `docker-compose.yml`. Same
  tool implementations, second transport — the MCP SDK supports both behind one tool registration.

## License

AGPL-3.0-or-later, same as openGym.
