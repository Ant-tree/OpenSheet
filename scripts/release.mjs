#!/usr/bin/env node
// Cut a release: bump versions, commit, and tag — in one command.
//
// Usage:
//   node scripts/release.mjs <desktop> [--mobile <mobile>] [options]
//     <desktop>        explicit semver (e.g. 0.1.2) or patch | minor | major
//     --mobile <v>     also bump the mobile (Android/iOS) version to <v>
//     --push           push the commit and tag to origin when done
//     --no-tag         skip creating the git tag
//     --dry-run        show what would happen, change nothing
//
// Examples:
//   npm run release -- patch                 # 0.1.1 -> 0.1.2, commit, tag v0.1.2
//   npm run release -- 0.2.0 --mobile 1.2 --push
//
// The version bump touches package.json, package-lock.json, Tauri config,
// Cargo.toml/lock, Android build.gradle and the iOS project. The release commit
// therefore contains only version changes, so the working tree must be clean.

import { execSync } from 'node:child_process'
import { bumpVersions, parseArgs, resolveDesktopTarget } from './bump-version.mjs'

function git(cmd, opts = {}) {
  return execSync(`git ${cmd}`, { encoding: 'utf8', stdio: opts.capture ? 'pipe' : 'inherit' })
}
function gitOut(cmd) {
  return execSync(`git ${cmd}`, { encoding: 'utf8' }).trim()
}

const rawArgs = process.argv.slice(2)
const flags = new Set(rawArgs.filter((a) => a.startsWith('--') && a !== '--mobile'))
const dryRun = flags.has('--dry-run')
const doPush = flags.has('--push')
const noTag = flags.has('--no-tag')
// strip our own flags before handing the rest to the shared arg parser
const versionArgs = []
for (let i = 0; i < rawArgs.length; i++) {
  if (rawArgs[i] === '--mobile') {
    versionArgs.push(rawArgs[i], rawArgs[++i])
  } else if (!rawArgs[i].startsWith('--')) {
    versionArgs.push(rawArgs[i])
  }
}
const { desktop, mobile } = parseArgs(versionArgs)

if (!desktop && !mobile) {
  console.error('Usage: node scripts/release.mjs <desktop|patch|minor|major> [--mobile <version>] [--push] [--no-tag] [--dry-run]')
  process.exit(1)
}

// 1. Working tree must be clean so the release commit is version-only.
const dirty = gitOut('status --porcelain')
if (dirty && !dryRun) {
  console.error('release: working tree is not clean. Commit or stash your changes first:\n' + dirty)
  process.exit(1)
}

// 2. Bump the versions.
const result = dryRun ? previewOnly({ desktop, mobile }) : bumpVersions({ desktop, mobile })
if (result.desktop) console.log(`desktop/web:  ${result.desktop.from ?? '?'} -> ${result.desktop.to}`)
if (result.mobile) console.log(`mobile:       -> ${result.mobile.to}${result.mobile.versionCode ? `  (Android versionCode ${result.mobile.versionCode}, iOS build ${result.mobile.build})` : ''}`)

const desktopVersion = result.desktop?.to
const tag = desktopVersion ? `v${desktopVersion}` : `mobile-v${result.mobile.to}`
const parts = []
if (result.desktop) parts.push(`v${result.desktop.to}`)
if (result.mobile) parts.push(`mobile ${result.mobile.to}`)
const message = `Release ${parts.join(' / ')}`

if (dryRun) {
  console.log(`\n[dry-run] would commit: "${message}"`)
  if (!noTag) console.log(`[dry-run] would tag:    ${tag}`)
  if (doPush) console.log('[dry-run] would push:   git push --follow-tags')
  process.exit(0)
}

// 3. Guard against re-tagging.
if (!noTag) {
  const existing = gitOut('tag --list ' + tag)
  if (existing) {
    console.error(`release: tag ${tag} already exists. Bump to a new version or pass --no-tag.`)
    process.exit(1)
  }
}

// 4. Commit + tag.
git('add -A')
git(`commit -m ${JSON.stringify(message)}`)
if (!noTag) git(`tag -a ${tag} -m ${JSON.stringify(message)}`)

// 5. Push, or print the command.
if (doPush) {
  git('push')
  if (!noTag) git('push origin ' + tag)
} else {
  console.log(`\nCommitted${noTag ? '' : ` and tagged ${tag}`}. Push with:`)
  console.log(noTag ? '  git push' : '  git push --follow-tags')
}

console.log('\nBuild artifacts (as needed):')
console.log('  npm run build         # web bundle -> dist/')
console.log('  npm run tauri build   # desktop app + installer')
console.log('  npm run cap:android   # Android (Android Studio)')
console.log('  npm run cap:ios       # iOS (Xcode)')

// Report intended bumps without writing anything (for --dry-run).
function previewOnly({ desktop, mobile }) {
  const r = {}
  if (desktop) r.desktop = resolveDesktopTarget(desktop)
  if (mobile) r.mobile = { to: mobile }
  return r
}
