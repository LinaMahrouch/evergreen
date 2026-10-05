# Evergreen (the app)

A minimalist gym tracker for iOS, Android and the web, from one React Native (Expo) codebase.
Black, white and one dark green.

It plans routines, runs guided workouts, logs body weight and shows progress. It works on its
own with everything kept on the device, and can pair with an [openGym](../README.md) server to
sync across devices and let an AI assistant plan your training ([../EVERGREEN.md](../EVERGREEN.md)).

## Run it

```bash
npm install
npm run web          # in a browser, with live reload
npm run android      # on a connected Android phone or emulator (needs the Android SDK)
npm run ios          # on a Mac with Xcode
```

## Build it

| Command | What you get |
|---|---|
| `npm run export:web` | `dist/`: a static site, installable to a home screen, works offline. Any static host serves it. |
| `npm run serve:web` | Serves `dist/` on <http://localhost:8081> to look at it. |
| `npm run build:android` | `build/Evergreen-<version>.apk` (install directly) and `.aab` (Google Play), signed. |
| `npx eas-cli build -p ios` | An iOS build in Expo's cloud. Needs an Expo account and an Apple Developer membership. |

`build:android` needs a JDK 17 and the Android SDK (`JAVA_HOME`, `ANDROID_HOME`). On Windows it
mirrors the project to `C:\eg\app` first, because the native build cannot cope with long paths;
the results are copied back to `build/`. To try the app on the Android emulator on a PC, build
with `EVERGREEN_ABIS=x86_64` set (and `--apk`); that file is for the emulator only, so build
again without it before you publish.

**The signing key is in `credentials/`. Back that folder up.** It is gitignored. Every update
has to be signed with the same key: lose it and you cannot update the app on phones that have
it, or on Google Play.

## How it is put together

```
src/app/        the screens. One file per screen (Expo Router).
  (tabs)/         Today · Plan · Coach · Log · Progress
  workout.tsx     the session in progress
  routine/[id]    a routine and its exercises;  slot.tsx  one exercise's sets, reps, weight
  pick.tsx        the exercise library;         exercise/[id]  one exercise
  connect.tsx     pairing with a server;        settings.tsx, assistant.tsx
src/ui/         the design system: theme.ts (three colours), index.tsx (every component)
src/store/      useStore.ts (the profile, the session, sync), api.ts, storage.ts
src/coach/      the built-in coach: client.ts (the request to Anthropic), tools.ts (what it can
                read and change), useCoach.ts (the conversation)
src/lib/        text formatting, stats, backup, config
src/engine/     openGym's training logic. lib/ is copied in, index.js is the door to it.
scripts/        sync-engine, make-icons, finish-web, build-android, serve-web
```

### The engine

The app does not re-implement what decides your next weight, how a finished session is saved,
or how two devices' copies merge. It runs the same pure JavaScript openGym's own web app runs
(`../frontend/src/lib`), copied into `src/engine/lib` by:

```bash
npm run sync:engine
```

Run that after pulling changes from openGym. Never edit `src/engine/lib` by hand. Screens import
from `@/engine` (`src/engine/index.js`, typed by `index.d.ts`), never from `lib/` directly.

Because of this the profile the app keeps is an openGym state document, field for field. A
backup exported here imports into openGym, a workout logged here opens correctly there, and
fields this app never shows (set in openGym's own web app) are kept intact through a sync.

### The coach

`src/coach/`. A chat with Claude, called straight from the device with the user's own Anthropic
API key (kept in the keychain; in a browser, in its storage). Each turn sends fixed
instructions, the profile as it is now, and the conversation; Claude answers with words or with
tool calls, which `tools.ts` runs against the store and sends back, until it has nothing more
to do.

The writes are not written here. They are `../frontend/src/lib/plan-apply.js`, the same
functions the MCP server runs, so the coach and an outside assistant change a profile in
exactly the same way and one set of tests (`../mcp/test`) covers both. A write is tried on a
copy first: a request the engine refuses changes nothing.

### Sync

`src/store/useStore.ts`. The app is a paired device of the server, like openGym's phone app:
a one-time code is exchanged for a bearer token (`/api/pair/redeem`), then

- every change is written to the device first, then pushed with the revision it was based on
  (`PUT /api/data` with `baseRev`);
- if the server has moved on (409), the two copies are merged by openGym's own `mergeStates`
  and pushed again, so a workout logged offline and a plan written elsewhere both survive;
- while open, it asks for the server's revision every 30 seconds and pulls when it changed.

The session in progress never leaves the device.

### Design rules

- Three colours, in `src/ui/theme.ts`. Hierarchy comes from the opacity of white, never a
  fourth colour. Green means "press this" or "done".
- Words over icons. The tab bar is text.
- One column, at most 560 wide, on every screen size.
- Exercise animations are the one place colour comes in. They are third-party content with an
  unresolved licence (`../NOTICE.md`): never bundled, loaded from the network by
  `src/ui/ExerciseMedia.tsx`, and every screen reads fine without them (Settings can hide them).

## Changing the name, the icon, the ids

- Name, bundle id, Android package: `app.json`. **Change the ids before the first store
  release**; they cannot be changed afterwards.
- Icon: edit the mark in `scripts/make-icons.mjs`, then `npm run icons`.
- Colours: `src/ui/theme.ts`.
- The "source code" link (see below): `src/lib/config.ts`.

## Licence

AGPL-3.0-or-later, like openGym, whose code this app contains. If you give the app to other
people, on a store or on a public website, they must be able to get the source of the version
they are using: publish this repository and point `SOURCE_URL` in `src/lib/config.ts` at it.
