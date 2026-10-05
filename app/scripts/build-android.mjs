#!/usr/bin/env node
/* Builds the signed Android release on this machine:
 *
 *   npm run build:android
 *
 *   build/Evergreen-<version>.apk   install it on a phone directly
 *   build/Evergreen-<version>.aab   upload it to Google Play
 *
 * Needs a JDK (17+) and the Android SDK; set JAVA_HOME and ANDROID_HOME, or keep them at
 * C:\Android\jdk-17 and C:\Android\sdk where this project's setup put them.
 *
 * Signing uses credentials/keystore.properties (storeFile, storePassword, keyAlias,
 * keyPassword). KEEP THAT FOLDER: every update of the app has to be signed with the same key,
 * or phones refuse to install it over the old one and Google Play rejects the upload. It is
 * gitignored on purpose — back it up somewhere that is not this computer.
 *
 * The cloud alternative, which needs no local toolchain, is `npx eas-cli build -p android`.
 */
import fs from 'node:fs'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const APP = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const win = process.platform === 'win32'
const fail = msg => { console.error('\n' + msg + '\n'); process.exit(1) }

// Windows: CMake refuses object files whose full path is over 250 characters, and the native
// modules under node_modules get there from any ordinary project folder ("…cannot be safely
// placed under this directory") — the project's own path is in there twice, once for the build
// folder and once for the source file. So from a long path the app is mirrored into a short
// real folder, built there, and the results are copied back.
//
// It has to be a real folder. A drive letter (`subst`) or a junction standing in for this one
// does not work: node resolves both back to the long path, the build then sees half its files
// under one root and half under the other, and React Native's codegen refuses ("this and base
// files have different roots").
const SHORT = process.env.EVERGREEN_BUILD_DIR || 'C:\\eg\\app'
if (win && APP.length > 24 && !process.env.EVERGREEN_SHORT_PATH && path.resolve(APP).toLowerCase() !== path.resolve(SHORT).toLowerCase()) {
  console.log(`This folder's path is too long for the Android native build on Windows.\nMirroring it to ${SHORT} and building there…`)
  fs.mkdirSync(SHORT, { recursive: true })
  // /MIR keeps the copy exact, so a second build only moves what changed. Left out: build
  // output and caches, which are large, stale, and full of absolute paths from here. Only
  // `.cxx` and `.gradle` are left out by name wherever they are; `dist` and `build` are named
  // by full path, because npm packages keep their own code in folders called exactly that.
  const skipDirs = [
    '.cxx', '.gradle',
    ...['.expo', 'dist', 'build', path.join('android', 'build'), path.join('android', 'app', 'build')].map(d => path.join(APP, d)),
  ]
  const copy = spawnSync('robocopy', [APP, SHORT, '/MIR', '/MT:16', '/NFL', '/NDL', '/NJH', '/NJS', '/NP', '/R:1', '/W:1', '/XD', ...skipDirs], { stdio: 'inherit' })
  // robocopy: 0–7 are degrees of success, 8 and up are failures.
  if (copy.status == null || copy.status >= 8) fail(`Could not mirror the project to ${SHORT} (robocopy exit ${copy.status}).`)
  const built = spawnSync(process.execPath, [path.join(SHORT, 'scripts', 'build-android.mjs'), ...process.argv.slice(2)], {
    cwd: SHORT, stdio: 'inherit', env: { ...process.env, EVERGREEN_SHORT_PATH: '1' },
  })
  // The signing key was mirrored along with everything else; one copy of it is enough.
  fs.rmSync(path.join(SHORT, 'credentials'), { recursive: true, force: true })
  if (built.status === 0) {
    const out = path.join(APP, 'build')
    fs.mkdirSync(out, { recursive: true })
    for (const file of fs.readdirSync(path.join(SHORT, 'build'))) fs.copyFileSync(path.join(SHORT, 'build', file), path.join(out, file))
    console.log(`\nCopied back → ${out}`)
  }
  process.exit(built.status ?? 1)
}

const JAVA_HOME = process.env.JAVA_HOME || (win && fs.existsSync('C:/Android/jdk-17') ? 'C:/Android/jdk-17' : '')
const ANDROID_HOME = process.env.ANDROID_HOME || process.env.ANDROID_SDK_ROOT || (win && fs.existsSync('C:/Android/sdk') ? 'C:/Android/sdk' : '')
if (!JAVA_HOME) fail('No JDK found. Install JDK 17 and set JAVA_HOME.')
if (!ANDROID_HOME) fail('No Android SDK found. Install it and set ANDROID_HOME.')

const propsFile = path.join(APP, 'credentials', 'keystore.properties')
if (!fs.existsSync(propsFile)) fail(`No signing key. Expected ${propsFile} (see the top of this script).`)
const props = Object.fromEntries(
  fs.readFileSync(propsFile, 'utf8').split(/\r?\n/).map(l => l.match(/^([^=#]+)=(.*)$/)).filter(Boolean).map(m => [m[1].trim(), m[2].trim()]))
const storeFile = path.resolve(APP, props.storeFile || '')
if (!fs.existsSync(storeFile)) fail(`The keystore ${storeFile} does not exist.`)

const env = { ...process.env, JAVA_HOME, ANDROID_HOME, ANDROID_SDK_ROOT: ANDROID_HOME, NODE_ENV: 'production' }
const run = (label, cmd, args, cwd) => {
  console.log(`\n── ${label}`)
  const out = spawnSync(cmd, args, { cwd, env, stdio: 'inherit', shell: win })
  if (out.status !== 0) fail(`${label} failed (exit ${out.status}).`)
}

// The native project is generated from app.json, never edited by hand.
if (!fs.existsSync(path.join(APP, 'android', 'gradlew'))) {
  run('generate the android project', win ? 'npx.cmd' : 'npx', ['expo', 'prebuild', '--platform', 'android', '--no-install'], APP)
}

const only = process.argv.includes('--apk') ? ['assembleRelease'] : process.argv.includes('--aab') ? ['bundleRelease'] : ['assembleRelease', 'bundleRelease']
// By its full path: cmd.exe does not always look in the working directory for a .bat.
const gradlew = win ? `"${path.join(APP, 'android', 'gradlew.bat')}"` : './gradlew'
run('gradle ' + only.join(' '), gradlew, [
  ...only,
  // Every phone is ARM; the x86 builds only serve emulators and double the build time.
  // EVERGREEN_ABIS=x86_64 makes a build for the emulator on a PC.
  `-PreactNativeArchitectures=${process.env.EVERGREEN_ABIS || 'arm64-v8a,armeabi-v7a'}`,
  // Sign with the release key without touching the generated build.gradle.
  `-Pandroid.injected.signing.store.file=${storeFile}`,
  `-Pandroid.injected.signing.store.password=${props.storePassword}`,
  `-Pandroid.injected.signing.key.alias=${props.keyAlias}`,
  `-Pandroid.injected.signing.key.password=${props.keyPassword}`,
  '--no-daemon',
], path.join(APP, 'android'))

const version = JSON.parse(fs.readFileSync(path.join(APP, 'app.json'), 'utf8')).expo.version
const outDir = path.join(APP, 'build')
fs.mkdirSync(outDir, { recursive: true })
const copies = [
  ['android/app/build/outputs/apk/release/app-release.apk', `Evergreen-${version}.apk`],
  ['android/app/build/outputs/bundle/release/app-release.aab', `Evergreen-${version}.aab`],
]
for (const [from, to] of copies) {
  const src = path.join(APP, from)
  if (!fs.existsSync(src)) continue
  fs.copyFileSync(src, path.join(outDir, to))
  console.log(`  ${to}  ${(fs.statSync(src).size / 1048576).toFixed(1)} MB`)
}
console.log(`\nDone → ${outDir}`)
