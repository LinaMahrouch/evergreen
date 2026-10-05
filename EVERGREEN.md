# Evergreen

A minimalist gym tracker for web, Android and iOS, in black, white and dark green, with an AI
assistant that can plan your training.

It is built on [openGym](README.md): this repository is openGym, plus three things.

| Folder | What it is |
|---|---|
| `app/` | **The Evergreen app.** One React Native (Expo) codebase for the web, Android and iOS, with a coach you chat with built in. New. |
| `mcp/` | **The assistant bridge.** openGym's MCP server, which could only read. It can now also plan: create routines, set your week. |
| `scripts/` | **A launcher** that runs the server without Docker (`npm run setup`, `npm run server`). New. |

Everything else (`api/`, `frontend/`, `docs/`) is openGym as its author wrote it. The one edit
is an optional `HOST` setting in `api/server.js`.

## How the pieces fit

```
   Evergreen app                openGym server                 Your AI assistant
   (phone or browser)           (your computer or a host)      (Claude, through MCP)
        │                              │                              │
        │   your workouts ───────────► │ ◄──────── reads your history │
        │                              │                              │
        │ ◄─────────── your next plan  │ ◄──────── writes your plan   │
```

The app works on its own, with everything kept on the device. The server is what lets a second
device, and the assistant, see the same profile. The assistant never talks to your phone: it
writes to the server, and the app picks the change up on its next sync.

## The coach

The **Coach** tab is a chat. You say what you want ("I can only train three days this week,
rearrange it"), and it reads your plan and your log and changes your routines and your week.

It runs on Claude with **your own Anthropic API key**, which you enter once in the tab. Get one
at <https://console.anthropic.com/settings/keys>; it is separate from a Claude subscription and
you pay for what you use, a few cents a conversation. Settings lets you pick a cheaper model or
remove the key.

- The key stays on the device. Messages, with your plan and log, go from the device straight
  to Anthropic; there is no server of yours or mine in between.
- It needs no openGym server. If the app is paired with one, what the coach changes syncs like
  any other change.
- It can do exactly what the assistant bridge below can: routines, the week, single days,
  weigh-ins. It cannot log or delete workouts or change settings.
- Other people who use your published app need their own key. Letting them chat without one
  means a small server that holds your key and pays for their messages; that is not built.

## 1. Try the app (two minutes, nothing to set up)

```bash
cd app
npm install
npm run export:web
npm run serve:web
```

Open <http://localhost:8081>. Choose a starter plan, start a workout. Everything you do is saved
in that browser.

## 2. Run the whole thing

You need [Node 22](https://nodejs.org). No Docker.

```bash
npm run setup      # once: installs everything and builds both web apps (a few minutes)
npm run server     # every time
```

That starts:

| Address | What |
|---|---|
| <http://localhost:8080> | openGym's own web app. You create your profile here and get pairing codes here. |
| <http://localhost:8081> | The Evergreen web app. |

Your data is in the `data/` folder. Back it up; it is everything.

### Create your profile

Open <http://localhost:8080> and tap **Create profile**. It uses a passkey (your fingerprint,
face or PIN).

### Connect the Evergreen app

1. At <http://localhost:8080>: **Settings → Pair the mobile app**. A code appears. It works
   once, for five minutes.
2. In Evergreen (<http://localhost:8081>): the gear icon → **Connect to a server**. Enter
   `localhost:8080` and the code.

Anything you had already logged in Evergreen is added to your profile, not replaced.

### Connect your own assistant (instead of, or beside, the Coach tab)

1. Get a second code the same way (**Settings → Pair the mobile app**).
2. In this folder:

   ```bash
   npm run pair -- http://localhost:8080 THECODE
   ```

3. Open this folder in Claude Code. It finds the assistant bridge by itself (`.mcp.json`) and
   asks once whether to allow it. For Claude Desktop or Cursor, see [mcp/README.md](mcp/README.md).

Then ask, in your own words:

> Look at my last month and build me a four-day plan that fixes what I've been neglecting.

> I can only train Monday, Wednesday and Saturday now. Rearrange my week.

> I can't make Thursday. Move it to Friday.

The plan appears in the app within about half a minute. The assistant can read everything, and
write routines, the weekly schedule, single-day changes and weigh-ins. It cannot log or edit
workouts, change settings, or delete your history, and it never overwrites a routine you made:
what it creates is added beside yours.

## 3. The phone app

### Android

```bash
cd app
npm run build:android
```

gives you, in `app/build/`:

- `Evergreen-1.0.0.apk`: send it to your phone and open it to install. Android asks once to
  allow installs from outside the Play Store.
- `Evergreen-1.0.0.aab`: the file Google Play wants.

It needs a JDK and the Android SDK. On this computer they are already in `C:\Android`.

> **Back up `app/credentials/` now.** It holds the key the app is signed with, and its password.
> It is not in git, on purpose. Every future update must be signed with that same key. If it is
> lost, phones will refuse your updates and Google Play will reject them, for good.

### iPhone

Apple only lets a Mac build iPhone apps, or Expo's cloud service:

```bash
cd app
npx eas-cli login
npx eas-cli build -p ios
```

That needs a free Expo account and a paid Apple Developer membership ($99 a year). Until then,
an iPhone can use the web version: open it in Safari, then Share → **Add to Home Screen**. It
opens full-screen and works offline.

### Using the phone app with your server

On the phone the app works alone straight away. To sync it, the phone has to reach your server:

- **At home, same Wi-Fi:** in `.env` set `BIND=0.0.0.0` and `ORIGIN=http://YOUR-PC-IP:8080`
  (find the IP with `ipconfig`). Without `BIND` the server answers this computer only. With
  it, anyone on your Wi-Fi can open openGym and create a profile of their own (not read
  yours); add `INVITE_ONLY=1` to stop that. Then restart `npm run server`, and enter `YOUR-PC-IP:8080` in the app. It only syncs
  while you are home.
- **Anywhere:** the server has to be on the internet with HTTPS, on a small cloud server or
  through a tunnel. [docs/SELF_HOSTING.md](docs/SELF_HOSTING.md) walks through the options
  (Cloudflare Tunnel is the usual one from a home computer). Then enter that address in the app.

The app keeps working with no connection either way. It sends what you logged when it next
reaches the server.

## 4. Before you publish anything

Read this before the app goes on a store or a public web address.

**The licence.** openGym is free software under the GNU AGPL 3.0, and Evergreen contains its
code, so Evergreen is under it too. In practice that means one thing: anyone you give the app
to, or who uses it on your website, must be able to get the source code of *your* version. So:

1. Keep this repository public (<https://github.com/LinaMahrouch/evergreen>) and push to it
   whenever you publish a new version.
2. `SOURCE_URL` in `app/src/lib/config.ts` points there. The app links to it from
   Settings → About.
3. Keep the `LICENSE` and `NOTICE.md` files, and the credit to openGym in the app.

You may charge for the app. You may not make it closed-source.

**The name and ids.** In `app/app.json`:

- `name` is "Evergreen", a working name. Check the stores for a clash before you settle on it.
- `android.package` and `ios.bundleIdentifier` are `com.linamahrouch.evergreen`. **These cannot
  be changed after the first release**, so choose them now.

**Exercise pictures.** The animations and thumbnails are not yours and not openGym's: they
belong to third parties and their licence is unresolved ([NOTICE.md](NOTICE.md)). Evergreen
does not contain them. It loads them over the internet from the public dataset openGym uses
(`MEDIA_BASE` in `app/src/lib/config.ts`), and Settings → Exercise animations hides them. On a
store or a public site a rights holder may still ask you to take them down: clear it with
them first, or ship with `animations: false` as the default in `app/src/store/usePrefs.ts`.

### Publishing the web version

`app/dist/` is a plain static site and already carries the settings Vercel needs.

```bash
cd app
npm run export:web
npx vercel deploy dist --prod
```

Any static host works (Netlify, Cloudflare Pages, GitHub Pages).

### Publishing on Google Play

A [developer account](https://play.google.com/console) ($25, once), then upload
`app/build/Evergreen-1.0.0.aab`. For each later release raise `version` and
`android.versionCode` in `app/app.json` first.

## What works today, and what does not

Checked by actually running it:

- The app, in a browser: plan, routines, the exercise library, a full workout with rest timer,
  the log, body weight, progress, backup, and reloading without losing anything.
- App ↔ server ↔ assistant, end to end: the app pairs and takes the server's plan; a workout
  logged in the app reaches the server; a routine the assistant writes reaches the app; when
  both change the profile at the same moment, both changes survive (16 of 16 checks).
- The assistant bridge: 108 automated tests.
- The coach, in a browser, against a scripted stand-in for Anthropic's API: building a plan,
  changing a routine, moving a day, logging a weigh-in, a refused request, an empty account,
  a reload (18 of 18 checks).
- The Android app, on an emulated Pixel 7 (Android 15): first launch, a starter plan, a workout
  with typed weights and the rest timer, finishing, the log and progress, duplicating a routine,
  keeping its data through an update, and pairing with a server and syncing both ways.

Not done, or not checked:

- **The coach has not talked to the real Claude.** I had no API key. The request it sends follows
  Anthropic's published format and every step around it is tested, but the first real
  conversation is yours. If it fails, the message in the chat says why.

- **The app has not been run on a physical phone**, only on the emulator above (the same code,
  built for a PC's processor). Expect small things the first time you hold it: the feel of the
  buttons, vibration, a screen size nobody tried.
- **No iPhone build.** That needs a Mac or Expo's cloud, and your Apple account.
- **The rest timer makes no sound and sends no notification** if the app is in the background.
  It vibrates if the app is open.
- **Supersets, drop-sets and per-side reps** made in openGym or by the assistant are kept and
  shown, but the app cannot create or edit them.
- **The server is not on the internet.** `npm run server` is for your own computer. Hosting it
  is yours to choose and set up.
- **21 of openGym's own 473 api tests fail on this Windows machine**, the same 21 before and
  after my one-line change there. They pass on Linux, where openGym is developed and tested.

## Keeping up with openGym

```bash
git fetch upstream
git merge upstream/main
cd app && npm run sync:engine     # copy openGym's updated training logic into the app
```

## Where things are

| | |
|---|---|
| This guide | `EVERGREEN.md` |
| The app, for developers | [app/README.md](app/README.md) |
| The assistant bridge | [mcp/README.md](mcp/README.md) |
| openGym itself | [README.md](README.md), [docs/](docs/) |
| Colours | `app/src/ui/theme.ts` |
| Name, ids, version | `app/app.json` |
| Signing key | `app/credentials/` (back it up) |
| Your data | `data/` (back it up) |
