# Changelog

All notable changes to CodeAlign are documented here.
Format based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).

## [0.2.0] - 2026-11-21

### Added
- **Multi-column alignment**: `Align Smart` now also aligns trailing inline comments to the same column in the same pass (`codealign.smartAlign.alignComments`, on by default) - true multi-column output instead of a single separator.
- **Align Block at Cursor** (`Ctrl+Alt+B`): no selection needed - detects the logical block around the cursor (same indentation, bounded by blank lines, indent changes, and code fences) and aligns only that block.
- **Re-align Last** (`Ctrl+Alt+R`): repeats the last alignment operation (separator, regex pattern, or table) on the current selection.
- **Safe mode**: `codealign.safeMode.enabled` + `codealign.maxLineLength` - leaves a line untouched instead of padding it past a configured maximum length.
- `codealign.smartAlign.maxColumns` to cap how many separators are processed in multi-pass mode.

### Fixed
- **Markdown table formatting broke on "complicated" tables**: a pipe inside an inline code span (`` `a|b` ``) or an escaped pipe (`\|`) split cells incorrectly, and per-column alignment markers (`:---`, `---:`, `:---:`) were silently discarded on every reformat. Table parsing now respects code spans and escaped pipes, and preserves column alignment.
- **Shell injection risk** in the git-diff helper used by `Align Changed Lines`: a crafted file path could break out of the shell command. Switched to `execFileSync` with argument arrays.
- **CRLF line endings were corrupted**: alignment operations always rejoined lines with `\n`, mixing endings into CRLF files. All write paths now preserve the document's actual line ending.
- `Align by Regex` ignored code fences (` ``` `/`~~~`), unlike every other alignment command - markdown code blocks could be reformatted by mistake.

## [0.1.7] - 2026-07-07

### Added
- Markdown table auto-detection: `Ctrl+Alt+A` on pipe-separated lines automatically formats column widths, even when cells contain `=` or other separators that would normally interfere with detection.
- Code fence protection: content inside ` ``` ` and `~~~` blocks is never touched during alignment.

### Improved
- Clearer message when nothing aligns, explaining why and suggesting what to try next.
- README badges (version, installs, license, maintenance status).
- Documentation on why `Ctrl+Alt+A` may not trigger on a full file, and how to target specific blocks instead.

## [0.1.6] - 2026-06-26

### Fixed
- Markdown table alignment: `Align Smart` now detects pipe-separated tables and applies column-by-column formatting instead of misaligning the leading `|`.
- README incorrectly listed Markdown as excluded - it works out of the box with no configuration.

### Improved
- Added a Markdown profile example (`|`, `,` separators) to the documentation, with auto-activation via `languageProfiles` for `.md` files.

## [0.1.5] - 2026-06-02

### Fixed
- Double alignment on paste: `autoAlign.trigger: onType` no longer fires a second pass on top of a paste-align result.
- Live preview ghost text now clears immediately when the document changes, instead of persisting after alignment.

### Improved
- `Align by…` includes a "Custom separator…" entry - type any separator inline without a separate command.
- `Format as Table` preserves the leading indentation of the source block.

## [0.1.4] - 2026-06-02

### Added
- `Align by Regex` - any regular expression as the alignment target.
- `Sort & Align` (`Ctrl+Alt+S`) - sort selected lines (A-Z, Z-A, by length, by value) then align in one step.
- `Align Changed Lines (Git Diff)` - aligns only groups containing lines you've modified.
- `Format as Table` - converts CSV, tab- or pipe-separated text into a Markdown table.
- `Align to Column` - pads lines so a separator lands at a specific column number.
- Live preview (`codealign.livePreview.enabled`) - ghost text showing the aligned result as you select lines.
- Column indicator (`codealign.columnIndicator.enabled`) - status bar shows the aligned separator's column.
- `Align All Files in Folder` - recursive, with progress and cancellation.
- Multi-pass alignment (`codealign.smartAlign.multiPass`) - processes all configured separators sequentially instead of picking only the best match.

### Changed
- `codealign.separators` is now the single source of truth for all alignment operations (smart detection, auto-align, QuickPick, multi-pass).

## [0.1.3] - 2026-06-02

### Improved
- Status bar shows the active profile name.
- `languageProfiles` auto-detection only applies when no profile is manually set.
- Minor alignment edge-case fixes.

## [0.1.2] - 2026-06-02

### Added
- `Align by…` - QuickPick to choose any separator from your configured list.
- Profiles (`codealign.profiles`) - named config presets switchable with `Switch Profile`.
- Language auto-profiles (`codealign.languageProfiles`) - applies a profile automatically per file language.
- Nth occurrence (`codealign.separatorOccurrence`) - align on the 2nd, 3rd... occurrence of a separator.
- Align on paste (`codealign.pasteAlign.enabled`) - opt-in auto-alignment of multi-line pastes.
- `Preview Alignment` - ghost text preview before committing an alignment.

## [0.1.1] - 2026-06-02

### Fixed
- Compound operators (`+=`, `-=`, `*=`, `/=`, `%=`, `&=`, `|=`, `^=`, `~=`, `??=`) no longer split incorrectly.
- Mixed indentation: tabs and spaces are normalised using the editor's `tabSize` for grouping; original characters are preserved.

### Added
- `Unalign` (`Ctrl+Alt+U`) - collapse aligned spaces back to minimum.

## [0.1.0] - 2026-06-02

Initial release - core alignment engine for VS Code.

- Align by `=` (auto-detect).
- Group isolation - consecutive lines, same indentation.
- String and comment awareness - separators inside quotes and comment tails are ignored.
- Compound operator protection - `+=`, `-=`, `*=`... are never broken.
- Full-file fallback when no selection.
