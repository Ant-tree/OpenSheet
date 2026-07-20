#!/usr/bin/env node
// Bump the app version across every file that pins it, in one shot.
//
// The project has two independent version schemes:
//   • desktop / web  — semver (package.json, Tauri, Cargo)         e.g. 0.1.1
//   • mobile         — Android/iOS marketing version               e.g. 1.1
//
// Usage:
//   node scripts/bump-version.mjs <desktop> [--mobile <mobile>]
//     <desktop>   explicit semver (e.g. 0.1.2) or one of: patch | minor | major
//     --mobile    explicit mobile version (e.g. 1.2); Android versionCode and
//                 iOS build number auto-increment when set
//   node scripts/bump-version.mjs --mobile 1.2      # bump mobile only
//
// Examples:
//   node scripts/bump-version.mjs patch             # 0.1.1 -> 0.1.2
//   node scripts/bump-version.mjs 0.2.0 --mobile 1.2
//   npm run bump -- minor

import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const p = (...s) => join(ROOT, ...s)

/** Replace exactly one match of `re` in `text`; throw if it isn't found. */
function replaceOnce(text, re, replacement, label) {
  if (!re.test(text)) throw new Error(`bump: pattern not found in ${label}`)
  return text.replace(re, replacement)
}

function bumpSemver(current, kind) {
  const m = /^(\d+)\.(\d+)\.(\d+)$/.exec(current)
  if (!m) throw new Error(`bump: current desktop version "${current}" is not semver`)
  let [major, minor, patch] = m.slice(1).map(Number)
  if (kind === 'major') (major += 1), (minor = 0), (patch = 0)
  else if (kind === 'minor') (minor += 1), (patch = 0)
  else if (kind === 'patch') patch += 1
  else throw new Error(`bump: unknown keyword "${kind}" (use patch|minor|major)`)
  return `${major}.${minor}.${patch}`
}

const isExplicit = (v) => /^\d+(\.\d+)+$/.test(v)

/** Current desktop/web version, from package.json. */
export function currentDesktopVersion() {
  return JSON.parse(readFileSync(p('package.json'), 'utf8')).version
}

/** Resolve a desktop arg (explicit or keyword) to { from, to } without writing. */
export function resolveDesktopTarget(arg) {
  const from = currentDesktopVersion()
  return { from, to: isExplicit(arg) ? arg : bumpSemver(from, arg) }
}

/** desktop / web files. */
function bumpDesktop(next) {
  // package.json + package-lock.json (root + packages[""])
  for (const file of ['package.json', 'package-lock.json']) {
    const json = JSON.parse(readFileSync(p(file), 'utf8'))
    json.version = next
    if (json.packages && json.packages['']) json.packages[''].version = next
    writeFileSync(p(file), JSON.stringify(json, null, 2) + '\n')
  }
  // Tauri config
  const tauri = JSON.parse(readFileSync(p('src-tauri/tauri.conf.json'), 'utf8'))
  tauri.version = next
  writeFileSync(p('src-tauri/tauri.conf.json'), JSON.stringify(tauri, null, 2) + '\n')
  // Cargo.toml — the [package] version is the first `version = "…"` line
  writeFileSync(
    p('src-tauri/Cargo.toml'),
    replaceOnce(
      readFileSync(p('src-tauri/Cargo.toml'), 'utf8'),
      /^version = "[^"]*"/m,
      `version = "${next}"`,
      'Cargo.toml',
    ),
  )
  // Cargo.lock — the `name = "app"` package block
  writeFileSync(
    p('src-tauri/Cargo.lock'),
    replaceOnce(
      readFileSync(p('src-tauri/Cargo.lock'), 'utf8'),
      /(name = "app"\nversion = )"[^"]*"/,
      `$1"${next}"`,
      'Cargo.lock',
    ),
  )
}

/** Android + iOS files. Returns the new versionCode / build number. */
function bumpMobile(next) {
  // Android build.gradle: versionName + versionCode (auto-increment)
  let gradle = readFileSync(p('android/app/build.gradle'), 'utf8')
  const codeMatch = /versionCode\s+(\d+)/.exec(gradle)
  if (!codeMatch) throw new Error('bump: versionCode not found in build.gradle')
  const nextCode = Number(codeMatch[1]) + 1
  gradle = replaceOnce(gradle, /versionCode\s+\d+/, `versionCode ${nextCode}`, 'build.gradle')
  gradle = replaceOnce(gradle, /versionName\s+"[^"]*"/, `versionName "${next}"`, 'build.gradle')
  writeFileSync(p('android/app/build.gradle'), gradle)

  // iOS project.pbxproj: MARKETING_VERSION + CURRENT_PROJECT_VERSION (build no.)
  const pbxPath = p('ios/App/App.xcodeproj/project.pbxproj')
  let pbx = readFileSync(pbxPath, 'utf8')
  const buildMatch = /CURRENT_PROJECT_VERSION = (\d+);/.exec(pbx)
  const nextBuild = buildMatch ? Number(buildMatch[1]) + 1 : 1
  pbx = pbx.replace(/MARKETING_VERSION = [^;]*;/g, `MARKETING_VERSION = ${next};`)
  pbx = pbx.replace(/CURRENT_PROJECT_VERSION = \d+;/g, `CURRENT_PROJECT_VERSION = ${nextBuild};`)
  writeFileSync(pbxPath, pbx)

  return { versionCode: nextCode, build: nextBuild }
}

/** Programmatic entry point (used by release.mjs too). */
export function bumpVersions({ desktop, mobile } = {}) {
  const result = {}
  if (desktop) {
    const current = JSON.parse(readFileSync(p('package.json'), 'utf8')).version
    const next = isExplicit(desktop) ? desktop : bumpSemver(current, desktop)
    bumpDesktop(next)
    result.desktop = { from: current, to: next }
  }
  if (mobile) {
    if (!isExplicit(mobile)) throw new Error(`bump: mobile version must be explicit (e.g. 1.2), got "${mobile}"`)
    const info = bumpMobile(mobile)
    result.mobile = { to: mobile, ...info }
  }
  return result
}

/** Parse `<desktop>` positional + `--mobile <v>`. */
export function parseArgs(argv) {
  const args = { desktop: undefined, mobile: undefined }
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--mobile') args.mobile = argv[++i]
    else if (!args.desktop) args.desktop = argv[i]
  }
  return args
}

// Run as a CLI when invoked directly.
if (import.meta.url === `file://${process.argv[1]}`) {
  const { desktop, mobile } = parseArgs(process.argv.slice(2))
  if (!desktop && !mobile) {
    console.error('Usage: node scripts/bump-version.mjs <desktop|patch|minor|major> [--mobile <version>]')
    process.exit(1)
  }
  try {
    const r = bumpVersions({ desktop, mobile })
    if (r.desktop) console.log(`desktop/web:  ${r.desktop.from} -> ${r.desktop.to}`)
    if (r.mobile) console.log(`mobile:       -> ${r.mobile.to}  (Android versionCode ${r.mobile.versionCode}, iOS build ${r.mobile.build})`)
    console.log('\nFiles updated. Review with `git diff`, then commit — or use `npm run release`.')
  } catch (err) {
    console.error(err.message)
    process.exit(1)
  }
}
