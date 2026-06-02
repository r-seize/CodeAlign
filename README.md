# CodeAlign

Universal text alignment for VS Code - variables, operators, comments, tables and more, in any language or file format.

![CodeAlign demo](https://raw.githubusercontent.com/r-seize/CodeAlign/main/images/demo.gif)

## Features

| | |
|---|---|
| **Smart auto-detect** | Picks the best separator from your configured list and aligns. No setup needed for common cases. |
| **Align by regex** | Any regular expression as an alignment target - align SQL `AS`, Go channels, or any custom pattern. |
| **Sort & Align** | Sort selected lines (A–Z, Z–A, by length, by value) then align in one step. |
| **Git-diff aware** | Aligns only the groups that contain lines you've actually changed - leaves untouched code alone. |
| **Format as table** | Converts comma-, tab- or pipe-separated text into a clean Markdown table with a header separator row. |
| **Align to column** | Pad lines so a separator lands at a specific column number - great for trailing comments. |
| **Live preview** | Ghost text appears as you select lines, showing the aligned result before you commit. _(opt-in)_ |
| **Column indicator** | Status bar shows the column position of the aligned separator when the cursor is in an aligned block. |
| **Align folder** | Right-click any folder in the Explorer → **Align All Files in Folder** - recursive, with progress and cancellation. |
| **Profiles** | Named config presets switchable in one click. Auto-applied per language via `languageProfiles`. |
| **Auto-align** | Background alignment on save or while typing - opt-in, non-intrusive. |
| **Align on paste** | Automatically aligns multi-line pastes. _(opt-in)_ |
| **Inline comments** | Aligns `//`, `#`, `--`, `;` comment markers to the same column, separately from separators. |
| **Nth occurrence** | Align on the 2nd, 3rd… occurrence of a separator. |
| **Unalign** | Collapse padded spaces back to minimum - clean diffs, before re-aligning with a different separator. |
| **Preview** | Manual ghost-text preview with Apply / Cancel before touching the document. |
| **Group isolation** | Only consecutive lines at the same indent level are aligned together. Blank lines and indent changes create boundaries. |
| **Context-aware** | Separators inside strings, comments, and parentheses are ignored. Compound operators (`+=`, `-=`…) are never broken. |

## Installation

`Ctrl+Shift+X` → search **CodeAlign** → Install.

## Usage

- **With selection:** select lines → `Ctrl+Alt+A` (auto-detect) or right-click → **CodeAlign** submenu.
- **Without selection:** `Ctrl+Alt+A` aligns the entire file.
- **Folder:** right-click a folder in the Explorer → **Align All Files in Folder**.
- **Command Palette:** `Ctrl+Shift+P` → type `CodeAlign` to see all commands.

## Commands

| Command | Description |
|---|---|
| **Align Smart** | Auto-detect best separator and align |
| **Align by…** | QuickPick from your `separators` list |
| **Align by Custom Separator** | Any separator string |
| **Align by Regex** | Any regex pattern as the alignment target |
| **Align Changed Lines (Git Diff)** | Only align groups containing git-modified lines |
| **Sort & Align** | Sort lines then align (6 sort modes) |
| **Format as Table** | Convert delimited text to a Markdown table |
| **Align to Column** | Pad to a fixed column number |
| **Align Inline Comments** | Align `//`, `#`, `--`, `;` to the same column |
| **Preview Alignment** | Ghost text preview - apply or cancel |
| **Unalign** | Collapse aligned spaces back to minimum |
| **Switch Profile** | QuickPick between named config profiles |
| **Toggle Auto-Align** | Enable / disable background alignment |
| **Align All Files in Folder** | Align all files in a folder recursively |

## Keyboard Shortcuts

| Windows / Linux | macOS | Command |
|---|---|---|
| `Ctrl+Alt+A` | `Cmd+Alt+A` | Align Smart |
| `Ctrl+Alt+C` | `Cmd+Alt+C` | Align Inline Comments |
| `Ctrl+Alt+U` | `Cmd+Alt+U` | Unalign |
| `Ctrl+Alt+S` | `Cmd+Alt+S` | Sort & Align |

Rebind anything via `Ctrl+K Ctrl+S` → search `CodeAlign`.

## Configuration

`File > Preferences > Settings` → search `CodeAlign`, or edit `settings.json` directly.

### General

| Setting | Default | Description |
|---|---|---|
| `minimumSpacesBefore` | `1` | Spaces between content and separator |
| `minimumSpacesAfter` | `1` | Spaces after the separator |
| `separators` | `["="]` | Separator candidates for auto-detect and the **Align by…** QuickPick |
| `commentSeparators` | `["//","#","--",";"]` | Comment prefixes for inline comment alignment |
| `commentMinSpaces` | `2` | Min spaces between code and inline comment |
| `separatorOccurrence` | `1` | Which occurrence to align on (1 = first, 2 = second…) |
| `smartDetectionThreshold` | `0.5` | Fraction of lines that must have the separator for smart detection |
| `excludedLanguages` | `[]` | Language IDs where CodeAlign is disabled |
| `pasteAlign.enabled` | `false` | Auto-align multi-line pastes |
| `smartAlign.multiPass` | `false` | When enabled, `Align Smart` processes **all** separators in `separators` sequentially instead of picking only the best match - useful when your code mixes `=>` and `=` for example |
| `livePreview.enabled` | `false` | Show aligned ghost text as you select lines |
| `columnIndicator.enabled` | `true` | Show separator column in the status bar |

**Available separators** (multi-char must come before single-char):
```
:=  =>  ->  <-  !=  ==  =  :  |  ,
```

### Auto-align

| Setting | Default | Description |
|---|---|---|
| `autoAlign.enabled` | `false` | Enable background alignment |
| `autoAlign.trigger` | `"onSave"` | `"onSave"` or `"onType"` |
| `autoAlign.debounceMs` | `400` | Keystroke delay for `onType` mode |

Auto-align uses `codealign.separators` - no separate list needed.

### Profiles & language auto-detection

Define named presets in `codealign.profiles`. Each profile overrides `separators`, `minimumSpacesBefore`, and `minimumSpacesAfter`.

Switch manually with **Switch Profile**, or automatically by language using `codealign.languageProfiles`:

```json
"codealign.profiles": {
  "Python": { "separators": ["=", ":"], "minimumSpacesBefore": 1 },
  "YAML":   { "separators": [":"],      "minimumSpacesBefore": 0 },
  "Tables": { "separators": ["|", ","] }
},
"codealign.languageProfiles": {
  "python": "Python",
  "yaml":   "YAML"
}
```

The active profile is shown in the status bar. `languageProfiles` only applies when no profile is manually set.

### Complete settings.json example

```json
{
  // -- Spacing
  "codealign.minimumSpacesBefore": 1,
  "codealign.minimumSpacesAfter":  1,

  // -- Separators (single source of truth for all alignment operations)
  "codealign.separators":              ["=>", "=", ":"],
  "codealign.commentSeparators":       ["//", "#", "--", ";"],
  "codealign.commentMinSpaces":        2,
  "codealign.separatorOccurrence":     1,
  "codealign.smartDetectionThreshold": 0.5,

  // -- Paste & exclusions
  "codealign.pasteAlign.enabled":  true,
  "codealign.excludedLanguages":   ["markdown"],

  // -- Auto-align (uses codealign.separators)
  "codealign.autoAlign.enabled":    true,
  "codealign.autoAlign.trigger":    "onSave",
  "codealign.autoAlign.debounceMs": 400,

  // -- UI
  "codealign.smartAlign.multiPass":     false,
  "codealign.livePreview.enabled":      false,
  "codealign.columnIndicator.enabled":  true,

  // -- Profiles 
  "codealign.activeProfile": "",
  "codealign.profiles": {
    "Python": { "separators": ["=", ":"], "minimumSpacesBefore": 1, "minimumSpacesAfter": 1 },
    "YAML":   { "separators": [":"],      "minimumSpacesBefore": 0, "minimumSpacesAfter": 1 },
    "Tables": { "separators": ["|", ","] },
    "Go":     { "separators": [":=", "="] }
  },

  // -- Language auto-profile 
  "codealign.languageProfiles": {
    "python":     "Python",
    "yaml":       "YAML",
    "go":         "Go"
  }
}
```

## Examples

### Variable assignments
```js
// Before
const name = "John";
const age = 30;
const city = "New York";

// After - Align Smart (=)
const name = "John";
const age  = 30;
const city = "New York";
```

### YAML / config
```yaml
# Before
host: localhost
port: 5432
database: mydb

# After - Align by :
host     : localhost
port     : 5432
database : mydb
```

### Sort & Align
```js
// Before (selected, Sort A→Z + align)
const zebra = 3;
const apple = 1;
const mango = 2;

// After
const apple = 1;
const mango = 2;
const zebra = 3;
```

### Format as Table
```
// Before (CSV or pipe-separated, 2+ lines selected)
Name, Age, City
Alice, 30, Paris
Bob, 25, London

// After - Format as Table
| Name  | Age | City   |
| ----- | --- | ------ |
| Alice | 30  | Paris  |
| Bob   | 25  | London |
```

### Align by Regex
```sql
-- Pattern: \s+AS\s+
SELECT user_id AS id, email_address AS email, created_at AS created
-- becomes:
SELECT user_id       AS id,
       email_address AS email,
       created_at    AS created
```

### Git-diff aware
Only the group containing your modified lines gets aligned. Code you didn't touch is not reformatted - no noisy diffs.

### Align to Column
```python
# Target column: 40
x = 1               # short var
very_long_name = 2  # long var

# After - both separators at column 40
x              = 1               # short var
very_long_name = 2               # long var
```

### Inline comments
```python
# Before
name = "John"  # user name
age = 30  # age
city = "NYC"  # location

# After - Align Inline Comments
name = "John"  # user name
age  = 30      # age
city = "NYC"   # location
```

### Unalign
Collapses aligned spaces back to the configured minimum - useful before re-aligning with a different separator or to keep diffs clean.

## Alignment rules

- **Groups:** consecutive lines, same indentation, same separator. Blank lines and indent changes are boundaries. Minimum 2 lines to align.
- **Strings:** separators inside `'...'` or `"..."` are ignored.
- **Comments:** separators inside comment tails are ignored.
- **Parentheses:** `=` inside `(...)` is ignored (for-loops, default params).
- **Compound operators:** `+=`, `-=`, `*=`, `/=`, `%=`, `&=`, `|=`, `^=`, `~=`, `??=` are never broken.
- **Mixed indent:** tabs and spaces are normalised using the editor's `tabSize` for grouping; actual characters are preserved.

## Supported languages

Works on any file VS Code can open as text. Tested with Python, JavaScript, TypeScript, Rust, Go, C, C++, Java, Lua, PHP, Ruby, Swift, Kotlin, Bash, PowerShell, SQL, HTML, CSS, SCSS, JSON, YAML, TOML, XML, Markdown, Dockerfile, `.env`, and plain text.

## Contributing

Bug reports and feature requests welcome - [github.com/r-seize/CodeAlign/issues](https://github.com/r-seize/CodeAlign/issues). Include the text you were aligning and the result you expected.
