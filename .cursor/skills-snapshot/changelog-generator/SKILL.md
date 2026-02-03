---
name: changelog-generator
description: Generates user-facing changelogs from git history. Use when the user asks to update CHANGELOG.md, generate a changelog from commits, summarize changes since last release, or produce release notes.
---

# Changelog Generator

## Quick Start

When asked to update or generate a changelog:

1. **Identify the scope**: Since last release/tag, since a date, or for a specific range of commits
2. **Fetch commits**: Use `git log` to get the relevant commit history
3. **Categorize changes**: Group by type (Added, Fixed, Changed, etc.) following [Keep a Changelog](https://keepachangelog.com/)
4. **Write entries**: User-facing, non-technical language; one line per logical change

## Workflow

1. Find the last release/tag or base reference:
   ```bash
   git tag -l --sort=-version:refname | head -5
   git log -1 --format=%H <last-version-tag>
   ```

2. Get commits since that point:
   ```bash
   git log <base>..HEAD --pretty=format:"%s (%h)" --no-merges
   ```

3. Parse and categorize commit messages. Common prefixes: `feat:`, `fix:`, `chore:`, `docs:`, `refactor:`, `perf:`, `style:`, `test:`

4. Use this output structure:
   ```markdown
   ## [Unreleased] or [X.Y.Z] - YYYY-MM-DD

   ### Added
   - User-facing description of new feature

   ### Fixed
   - User-facing description of bug fix

   ### Changed
   - User-facing description of change
   ```

## Conventions

- **Keep a Changelog** format: Use `Added`, `Changed`, `Deprecated`, `Removed`, `Fixed`, `Security`
- **User-facing**: Describe impact, not implementation (e.g., "Improve load time for schedule page" not "Optimize useMemo deps")
- **Concise**: One clear line per change; avoid redundancy
- **Order**: Newest/most significant changes first within each section

## Examples

**Input**: "Update CHANGELOG.md from commits since last release"

**Process**: Run `git log $(git describe --tags --abbrev=0)..HEAD --oneline`, group by type, write entries in Keep a Changelog format.
