# CodeAlign

Universal text alignment extension for Visual Studio Code.

CodeAlign aligns variables, operators, comments, tables, configuration files and any text structure - across every language and file format supported by VS Code.

![CodeAlign demo](https://raw.githubusercontent.com/r-seize/CodeAlign/main/images/demo.gif)

## Table of Contents

- [Overview](#overview)
- [Features](#features)
- [Installation](#installation)
- [Usage](#usage)
- [Commands](#commands)
- [Keyboard Shortcuts](#keyboard-shortcuts)
- [Auto-Align](#auto-align)
- [Configuration](#configuration)
- [Alignment Rules](#alignment-rules)
- [Examples](#examples)
- [Supported Languages](#supported-languages)

## Overview

CodeAlign is a dedicated alignment tool, not a formatter. It does not modify indentation, style or syntax - it only aligns separators vertically within qualifying groups of lines.

The alignment engine works entirely on raw text, making it language-agnostic and compatible with any file format VS Code can open.


## Features

| Feature | Description |
|---|---|
| **Smart auto-detection** | Detects the most appropriate separator in the selected lines and aligns accordingly. No configuration needed for common cases. |
| **Group-based alignment** | Only consecutive lines that share the same separator and the same indentation level are aligned together. Isolated lines are never touched. |
| **Comment-aware** | Separators found inside comments (`// ...`, `# ...`, `-- ...`, `; ...`) are completely ignored. A commented-out line never influences the alignment of surrounding code. |
| **String-aware** | Separators found inside string literals (`'='`, `"key => value"`) are ignored. Only separators in actual code positions are considered. |
| **Parenthesis-aware** | For `=`, occurrences inside parentheses are ignored. This prevents for-loop initialisers (`for (let i = 0; ...)`) and function parameter defaults from being treated as alignment targets. |
| **Compound operator safe** | Compound assignments (`+=`, `-=`, `*=`, `/=`, `%=`, `&=`, `\|=`, `^=`, `~=`, `??=`) are never broken by the `=` rule. |
| **Inline comment alignment** | Aligns inline comments (`//`, `#`, `--`, `;`) to the same column across consecutive lines, separately from separator alignment. |
| **Nth occurrence** | Align on the 2nd, 3rd… occurrence of a separator - useful for lines with multiple separators of the same type. |
| **Auto-align** | Optional background alignment that runs automatically on save or while typing, without any manual action required. |
| **Align on Paste** | Automatically aligns code pasted as multi-line blocks (opt-in via settings). |
| **Preview** | Shows ghost text of the aligned result before applying - accept or cancel without touching the document. |
| **Profiles** | Named configuration presets (separators + spacing) switchable in one click. Perfect for switching between Python, YAML, Markdown table modes. |
| **Custom separator** | Any character or sequence can be used as the alignment target via the custom separator command. |


## Installation

1. Open VS Code
2. Press `Ctrl+Shift+X` to open the Extensions panel
3. Search for **CodeAlign**
4. Click Install


## Usage

1. Select the lines you want to align
2. Press `Ctrl+Alt+A` (smart auto-detect) or open the Command Palette (`Ctrl+Shift+P`) and type `CodeAlign`
3. Choose the appropriate command

CodeAlign is also accessible via the right-click context menu under the **CodeAlign** submenu.


## Commands

All commands are available in the Command Palette (`Ctrl+Shift+P`) under the `CodeAlign` category.

| Command | Description |
|---|---|
| Align Smart (Auto-detect) | Detects the best separator and aligns. Uses the configured `smartSeparators` list. |
| Align by... | QuickPick populated from your `codealign.smartSeparators` list - choose which separator to use |
| Align by Custom Separator... | Prompts for any separator string not in your configured list |
| Align Inline Comments | Aligns inline comment markers to the same column |
| Unalign (Collapse Spaces) | Reverses alignment: collapses padded spaces around the detected separator and inline comments back to a single space |
| Preview Alignment | Shows a ghost text preview of the aligned result - apply or cancel without committing the change |
| Switch Profile | QuickPick to switch between named configuration profiles defined in `codealign.profiles` |
| Toggle Auto-Align | Enables or disables automatic background alignment |

## Keyboard Shortcuts

| Shortcut (Windows / Linux) | Shortcut (macOS) | Command |
|---|---|---|
| `Ctrl+Alt+A` | `Cmd+Alt+A` | Align Smart (Auto-detect) |
| `Ctrl+Alt+C` | `Cmd+Alt+C` | Align Inline Comments |
| `Ctrl+Alt+U` | `Cmd+Alt+U` | Unalign (Collapse Spaces) |

All shortcuts are only active when text is selected and the editor is focused.

To rebind them to your own preference, open the Keyboard Shortcuts editor (`Ctrl+K Ctrl+S`), search for `CodeAlign` and assign any key combination you want.

## Auto-Align

CodeAlign can automatically align your code as you work, without requiring any manual trigger.

### Enabling auto-align

- Press `Ctrl+Shift+P` and run **CodeAlign: Toggle Auto-Align**
- Or click the CodeAlign item in the status bar (bottom right)

The status bar shows the current state at all times:

```
CodeAlign: auto (onSave)    -- auto-align is active
CodeAlign: manual           -- auto-align is off
```

### Trigger modes

**onSave** (default): alignment runs each time you save the file. This is the recommended mode - it is non-intrusive and does not interfere with typing.

**onType**: alignment runs automatically after a short delay following your last keystroke. Useful for real-time feedback. The delay is configurable (`autoAlign.debounceMs`, default 400 ms).

### Auto-align scope

By default, auto-align only processes the `=` separator to avoid unintended changes in complex files. You can extend this list via the `codealign.autoAlign.separators` setting.


## Configuration

All settings are available under `File > Preferences > Settings` by searching for `CodeAlign`, or by editing your `settings.json` directly.

### General

| Setting | Type | Default | Description |
|---|---|---|---|
| `codealign.minimumSpacesBefore` | number | `1` | Minimum spaces between the content and the separator |
| `codealign.minimumSpacesAfter` | number | `1` | Minimum spaces after the separator |
| `codealign.commentSeparators` | string[] | `["//","#","--",";"]` | Comment prefixes used to detect and align inline comments |
| `codealign.smartSeparators` | string[] | `["="]` | Separator candidates for smart auto-detection and the **Align by…** QuickPick |
| `codealign.commentMinSpaces` | number | `2` | Minimum spaces between code and an inline comment |
| `codealign.excludedLanguages` | string[] | `[]` | Language IDs where CodeAlign is disabled |
| `codealign.smartDetectionThreshold` | number | `0.5` | Fraction of lines that must contain a separator for it to be chosen |
| `codealign.separatorOccurrence` | number | `1` | Which occurrence of the separator to align on (1 = first, 2 = second…) |
| `codealign.pasteAlign.enabled` | boolean | `false` | Auto-align multi-line pastes using the configured `smartSeparators` |

**Default smart separator:** `=` only. The `smartSeparators` list also populates the **Align by…** QuickPick, so whatever you configure here appears as choices in the palette.

To enable additional separators, add them to `codealign.smartSeparators`. The full list of available values, in recommended priority order:

```
:=  =>  ->  <-  !=  ==  =  :  |  ,
```

Multi-character operators must be listed before single-character ones to avoid false matches. For example, `=>` must come before `=`, and `:=` before `:`.

**Example** - enable `=`, `:` and `=>`:

```json
"codealign.smartSeparators": ["=>", "=", ":"]
```

### Auto-align

| Setting | Type | Default | Description |
|---|---|---|---|
| `codealign.autoAlign.enabled` | boolean | `false` | Enable automatic alignment |
| `codealign.autoAlign.trigger` | string | `"onSave"` | `"onSave"` or `"onType"` |
| `codealign.autoAlign.debounceMs` | number | `400` | Delay in milliseconds for onType mode |
| `codealign.autoAlign.separators` | string[] | `["="]` | Separators processed during auto-alignment |

### Profiles

Profiles let you switch between named sets of alignment settings in one click. Each profile can override `separators`, `minimumSpacesBefore`, and `minimumSpacesAfter`. The active profile is shown in the status bar.

**Define profiles in `settings.json`:**

```json
"codealign.profiles": {
  "Python": {
    "separators":          ["=", ":"],
    "minimumSpacesBefore": 1,
    "minimumSpacesAfter":  1
  },
  "YAML": {
    "separators":          [":"],
    "minimumSpacesBefore": 0,
    "minimumSpacesAfter":  1
  },
  "Tables": {
    "separators":          ["|", ","]
  }
}
```

**Switch profiles:**
- Run `CodeAlign: Switch Profile` from the Command Palette, or
- Set `codealign.activeProfile` to a profile name directly in settings.

Leave `codealign.activeProfile` empty (default) to use the base settings.

### Example settings.json

```json
{
  "codealign.minimumSpacesBefore": 1,
  "codealign.minimumSpacesAfter": 1,
  "codealign.smartSeparators": ["=>", "=", ":"],
  "codealign.pasteAlign.enabled": true,
  "codealign.autoAlign.enabled": true,
  "codealign.autoAlign.trigger": "onSave",
  "codealign.autoAlign.separators": ["="],
  "codealign.profiles": {
    "Python": { "separators": ["=", ":"] },
    "YAML":   { "separators": [":"], "minimumSpacesBefore": 0 }
  }
}
```

## Alignment Rules

### Grouping

Lines are grouped for alignment only when all of the following conditions are met:

1. **Consecutive**: each line in the group immediately follows the previous one, with no blank lines or lines missing the separator in between.
2. **Same indentation**: all lines in the group start with the exact same leading whitespace. A change in indentation level starts a new group.
3. **Minimum size**: a group must contain at least two lines. An isolated line with a separator is never modified.

### Separator filtering

The following occurrences are ignored when searching for a separator:

- Separators inside **string literals**: `'='`, `"key: value"`, etc.
- Separators inside **comments**: `// align =`, `# key: val`
- For `=` specifically: occurrences inside **parentheses** such as for-loop headers (`for (i = 0; ...)`) and function parameter defaults

### Operator disambiguation

CodeAlign distinguishes single-character operators from their multi-character counterparts:

| Looking for | Ignores |
|---|---|
| `=` | `==`, `!=`, `<=`, `>=`, `:=`, `=>`, and compound assignments `+=`, `-=`, `*=`, `/=`, `%=`, `&=`, `\|=`, `^=`, `~=`, `??=` |
| `:` | `::`, `:=` |
| `\|` | `\|\|` |

### Mixed indentation (tabs vs spaces)

When grouping lines for alignment, CodeAlign normalises leading whitespace using the editor's current `tabSize`. A line indented with one tab and a line indented with the equivalent number of spaces are treated as the same indentation level and grouped together. The actual indentation characters are preserved - only the comparison is normalised.

## Examples

### Variable assignments

Before:

```javascript
const name = "John";
const age = 30;
const city = "New York";
```

After **Align by =**:

```javascript
const name = "John";
const age  = 30;
const city = "New York";
```

### YAML / configuration

Before:

```yaml
host: localhost
port: 5432
database: mydb
password: secret
```

After **Align by :**:

```yaml
host     : localhost
port     : 5432
database : mydb
password : secret
```

### Arrow operators

Before:

```javascript
const map = {
    home: path => "/",
    about: path => "/about",
    contact: path => "/contact/us",
};
```

After **Align by =>**:

```javascript
const map = {
    home    : path =>  "/",
    about   : path =>  "/about",
    contact : path =>  "/contact/us",
};
```

OR 

```javascript
const map = {
    home: path      =>  "/",
    about: path     =>  "/about",
    contact; path   =>  "/contact/us",
};
```

### Inline comments

Before:

```python
name = "John"  # user name
age = 30  # user age
city = "NYC"  # location
```

After **Align Inline Comments**:

```python
name    = "John"  # user name
age     = 30        # user age
city    = "NYC"    # location
```

### Multi-column

Before:

```
name : value # comment
username : admin # login
password : secret123 # auth
```

After **Align Multi-Column**:

```
name     : value      # comment
username : admin      # login
password : secret123  # auth
```

### Unalign (collapse)

Reverses any previous alignment by collapsing the padded spaces around the detected separator and inline comments back to a single space. Useful before re-aligning with a different separator, or to produce a clean diff.

Before:

```javascript
const name     = "John";       // user name
const age      = 30;           // user age
const city     = "New York";   // location
```

After **Unalign (Collapse Spaces)**:

```javascript
const name = "John"; // user name
const age = 30; // user age
const city = "New York"; // location
```

Compound operators are recognised and not modified - `total += 1` stays as `total += 1`.

### Nth occurrence

Set `codealign.separatorOccurrence` to align on the 2nd, 3rd… occurrence instead of the first. Useful when lines contain multiple separators of the same type.

With `"codealign.separatorOccurrence": 2`:

Before:

```
a = val = x
bb = val = yy
```

After **Align Smart**:

```
a  = val  = x
bb = val  = yy
```

The first `=` is used as normal code; the second `=` is the alignment target.

### Align on Paste

Enable `"codealign.pasteAlign.enabled": true` in settings. When you paste multi-line code containing a consistent separator, CodeAlign automatically aligns the pasted block - no selection or command needed.

### Preview

Run **Preview Alignment** (`CodeAlign: Preview Alignment` in the palette). Lines that would change are dimmed and the aligned version appears as ghost text to the right. A notification offers **Apply** or **Cancel** - the document is not touched until you choose.

### Group isolation

CodeAlign does not align across blank lines or indentation changes:

```javascript
x = 1;                       // isolated (group of 1) - untouched

const name = "John";        // group 1 - aligned together
const age  = 30;

    let host = "localhost";  // group 2 (deeper indent) - aligned separately
    let port = 8080;

z = 99;                      // isolated (group of 1) - untouched
```

### Comments and strings ignored

A line whose `=` only appears inside a comment or a string is excluded from every group:

```javascript
const prev = idx > 0 ? line[idx - 1] : '';
const next = idx < line.length - 1 ? line[idx + 1] : '';
// Skip !=, <=, >=, :=, == and => in comments - this line is ignored
if (next === '-' || next === '=' || next === '<') { ... }  // '=' is inside a string
```

Only the two `const` lines form a valid group and are aligned. The comment line and the `if` line are excluded.

### Parenthesis-aware (for-loops)

```javascript
let depth = 0;
for (let i = 0; i < idx; i++) {   // = is inside () - excluded from alignment
```

The `=` inside `for (...)` is ignored. `let depth = 0` is left as a group of one and is not touched.

## Supported Languages

CodeAlign works on any file VS Code can open as text. It has been tested with:

Python, JavaScript, TypeScript, Rust, Go, C, C++, Java, Lua, PHP, Ruby, Swift, Kotlin, Bash, PowerShell, SQL, HTML, CSS, SCSS, JSON, YAML, TOML, XML, Markdown, Dockerfile, `.env` files, log files, and plain text.

Because the engine operates on raw text with no language parser, it is compatible with any format that uses consistent separator characters.


## Contributing

Found a bug or have a feature in mind? Open an issue on GitHub - all feedback is welcome.

[github.com/r-seize/CodeAlign/issues](https://github.com/r-seize/CodeAlign/issues)

When reporting a bug, include the text you were trying to align and the result you expected. For a feature request, a short description and an example is enough.
