import * as vscode from 'vscode';
import { execSync } from 'child_process';
import * as path from 'path';
import {
  alignBySeparator,
  alignByRegex,
  alignComments,
  alignToColumn,
  alignWithChangedLines,
  detectBestSeparator,
  findSeparatorIndex,
  formatAsTable,
  unalignBySeparator,
  unalignComments,
  COMMENT_PREFIXES,
} from './aligner/alignEngine';
import {
  getSelectedLines,
  applyAlignedLines,
  showAlignStatus,
} from './utils/editorUtils';

interface ProfileConfig {
  separators?:          string[];
  minimumSpacesBefore?: number;
  minimumSpacesAfter?:  number;
}

interface CodeAlignConfig {
  minSpacesBefore:          number;
  minSpacesAfter:           number;
  commentPrefixes:          string[];
  separators:               string[];
  commentMinSpaces:         number;
  excludedLanguages:        string[];
  smartDetectionThreshold:  number;
  tabSize:                  number;
  separatorOccurrence:      number;
  pasteAlignEnabled:        boolean;
  activeProfile:            string;
  livePreviewEnabled:       boolean;
  columnIndicatorEnabled:   boolean;
  smartAlignMultiPass:      boolean;
}

interface AutoAlignConfig {
  enabled:    boolean;
  trigger:    'onSave' | 'onType';
  debounceMs: number;
  separators: string[];
}

function getTabSize(editor: vscode.TextEditor): number {
  const t = editor.options.tabSize;
  return typeof t === 'number' ? t : 4;
}

function readConfig(editor?: vscode.TextEditor): CodeAlignConfig {
  const cfg = vscode.workspace.getConfiguration('codealign');

  // Use manual profile, or auto-detect from file language if none is set
  let activeProfile = cfg.get<string>('activeProfile', '');
  if (!activeProfile && editor) {
    const langProfiles = cfg.get<Record<string, string>>('languageProfiles', {});
    activeProfile      = langProfiles[editor.document.languageId] ?? '';
  }

  const profiles   = cfg.get<Record<string, ProfileConfig>>('profiles', {});
  const profileCfg = activeProfile && profiles[activeProfile] ? profiles[activeProfile] : {};

  return {
    minSpacesBefore:         profileCfg.minimumSpacesBefore ?? cfg.get<number>('minimumSpacesBefore', 1),
    minSpacesAfter:          profileCfg.minimumSpacesAfter  ?? cfg.get<number>('minimumSpacesAfter', 1),
    commentPrefixes:         cfg.get<string[]>('commentSeparators', COMMENT_PREFIXES),
    separators:              profileCfg.separators          ?? cfg.get<string[]>('separators', ['=']),
    commentMinSpaces:        cfg.get<number>('commentMinSpaces', 2),
    excludedLanguages:       cfg.get<string[]>('excludedLanguages', []),
    smartDetectionThreshold: cfg.get<number>('smartDetectionThreshold', 0.5),
    tabSize:                 editor ? getTabSize(editor) : 4,
    separatorOccurrence:     cfg.get<number>('separatorOccurrence', 1),
    pasteAlignEnabled:       cfg.get<boolean>('pasteAlign.enabled', false),
    activeProfile,
    livePreviewEnabled:      cfg.get<boolean>('livePreview.enabled', false),
    columnIndicatorEnabled:  cfg.get<boolean>('columnIndicator.enabled', true),
    smartAlignMultiPass:     cfg.get<boolean>('smartAlign.multiPass', false),
  };
}

function readAutoConfig(): AutoAlignConfig {
  const cfg = vscode.workspace.getConfiguration('codealign');
  return {
    enabled:    cfg.get<boolean>('autoAlign.enabled', false),
    trigger:    cfg.get<'onSave' | 'onType'>('autoAlign.trigger', 'onSave'),
    debounceMs: cfg.get<number>('autoAlign.debounceMs', 400),
    separators: cfg.get<string[]>('separators', ['=']),
  };
}

function buildAlignOpts(config: CodeAlignConfig) {
  return {
    minSpacesBefore:     config.minSpacesBefore,
    minSpacesAfter:      config.minSpacesAfter,
    commentPrefixes:     config.commentPrefixes,
    tabSize:             config.tabSize,
    separatorOccurrence: config.separatorOccurrence,
  };
}

async function autoAlignEditor(editor: vscode.TextEditor): Promise<void> {
  const config     = readConfig(editor);
  const autoConfig = readAutoConfig();

  if (!autoConfig.enabled) return;
  if (config.excludedLanguages.includes(editor.document.languageId)) return;

  const doc   = editor.document;
  const lines = Array.from({ length: doc.lineCount }, (_, i) => doc.lineAt(i).text);

  let aligned = [...lines];
  for (const sep of autoConfig.separators) {
    aligned = alignBySeparator(aligned, sep, buildAlignOpts(config));
  }

  if (aligned.join('\n') === lines.join('\n')) return;

  const fullRange = new vscode.Range(
    new vscode.Position(0, 0),
    new vscode.Position(doc.lineCount - 1, doc.lineAt(doc.lineCount - 1).text.length)
  );

  await editor.edit(edit => edit.replace(fullRange, aligned.join('\n')));
}

type AlignFn = (lines: string[], config: CodeAlignConfig) => string[] | null;

function registerAlignCommand(
  context: vscode.ExtensionContext,
  commandId: string,
  fn: AlignFn
): void {
  const disposable = vscode.commands.registerCommand(commandId, async () => {
    const editor = vscode.window.activeTextEditor;
    if (!editor) return;

    const config = readConfig(editor);
    const sel    = getSelectedLines(editor, config.excludedLanguages);
    if (!sel) return;

    const aligned = fn(sel.lines, config);
    if (!aligned) return;

    if (aligned.join('\n') === sel.lines.join('\n')) {
      vscode.window.showInformationMessage('CodeAlign: already aligned - no changes needed.');
      return;
    }

    await applyAlignedLines(editor, sel.range, aligned);
  });
  context.subscriptions.push(disposable);
}

let isPasteAligning = false;

export function activate(context: vscode.ExtensionContext): void {

  // -- Align Smart ----------------------------------------------------------
  registerAlignCommand(context, 'codealign.alignSmart', (lines, config) => {
    if (config.smartAlignMultiPass) {
      const opts = buildAlignOpts(config);
      let result = [...lines];
      for (const sep of config.separators) {
        result = alignBySeparator(result, sep, opts);
      }
      if (result.join('\n') === lines.join('\n')) {
        vscode.window.showInformationMessage('CodeAlign: nothing to align in the selection.');
        return null;
      }
      showAlignStatus(config.separators.join(' · '));
      return result;
    }

    const sep = detectBestSeparator(lines, config.separators, config.smartDetectionThreshold);
    if (!sep) {
      vscode.window.showInformationMessage('CodeAlign: no alignable separator detected in the selection.');
      return null;
    }

    // Markdown table: when | is the best separator and lines look like a table, use Format as Table
    const dataLines = lines.filter(l => l.trim().length > 0);
    if (sep === '|' && dataLines.length >= 2 && dataLines.every(l => l.trim().startsWith('|'))) {
      showAlignStatus('| (table)');
      return formatAsTable(lines);
    }

    showAlignStatus(sep);
    return alignBySeparator(lines, sep, buildAlignOpts(config));
  });

  // -- Align by… (QuickPick from smartSeparators) ---------------------------
  context.subscriptions.push(
    vscode.commands.registerCommand('codealign.alignBy', async () => {
      const editor = vscode.window.activeTextEditor;
      if (!editor) return;

      const config = readConfig(editor);
      const items: (vscode.QuickPickItem & { value?: string })[] = [
        ...config.separators.map(sep => ({
          label:       sep,
          description: separatorLabel(sep),
        })),
        { label: '$(edit) Custom separator…', description: 'enter any separator', value: '__custom__' },
      ];

      const picked = await vscode.window.showQuickPick(items, {
        title:       'CodeAlign - Align by separator',
        placeHolder: 'Select a separator from your configured list',
      });
      if (!picked) return;

      let sep = picked.label;
      if ((picked as { value?: string }).value === '__custom__') {
        const input = await vscode.window.showInputBox({
          title:         'CodeAlign - Custom Separator',
          prompt:        'Enter the separator to align by',
          placeHolder:   'e.g.  =   :   |   =>   ->',
          validateInput: v => (!v || v.trim().length === 0) ? 'Separator cannot be empty' : null,
        });
        if (!input) return;
        sep = input.trim();
      }

      const sel = getSelectedLines(editor, config.excludedLanguages);
      if (!sel) return;

      const aligned = alignBySeparator(sel.lines, sep, buildAlignOpts(config));
      await applyAlignedLines(editor, sel.range, aligned);
      showAlignStatus(sep);
    })
  );

  // -- Align by Custom Separator ---------------------------------------------
  context.subscriptions.push(
    vscode.commands.registerCommand('codealign.alignCustom', async () => {
      const editor = vscode.window.activeTextEditor;
      if (!editor) return;

      const input = await vscode.window.showInputBox({
        title:         'CodeAlign - Custom Separator',
        prompt:        'Enter the separator to align by',
        placeHolder:   'e.g.  =   :   |   =>   ->   !=   ==',
        validateInput: v => (!v || v.trim().length === 0) ? 'Separator cannot be empty' : null,
      });
      if (!input) return;

      const sep    = input.trim();
      const config = readConfig(editor);
      const sel    = getSelectedLines(editor, config.excludedLanguages);
      if (!sel) return;

      const aligned = alignBySeparator(sel.lines, sep, buildAlignOpts(config));
      await applyAlignedLines(editor, sel.range, aligned);
      showAlignStatus(sep);
    })
  );

  // -- Align Inline Comments -------------------------------------------------
  registerAlignCommand(context, 'codealign.alignComments', (lines, config) => {
    showAlignStatus('comments');
    const aligned = alignComments(lines, config.commentPrefixes, config.commentMinSpaces, config.tabSize);
    if (aligned.join('\n') === lines.join('\n')) {
      vscode.window.showInformationMessage('CodeAlign: no inline comments found to align.');
    }
    return aligned;
  });

  // -- Unalign ---------------------------------------------------------------
  registerAlignCommand(context, 'codealign.unalign', (lines, config) => {
    const sep    = detectBestSeparator(lines, config.separators, config.smartDetectionThreshold);
    const opts   = buildAlignOpts(config);
    const after  = sep ? unalignBySeparator(lines, sep, opts) : lines;
    const result = unalignComments(after, config.commentPrefixes, 1);

    if (result.join('\n') === lines.join('\n')) {
      vscode.window.showInformationMessage('CodeAlign: nothing to unalign in the selection.');
    } else {
      showAlignStatus(sep ? `unalign ${sep}` : 'unalign comments');
    }
    return result;
  });

  // -- Preview ---------------------------------------------------------------
  context.subscriptions.push(
    vscode.commands.registerCommand('codealign.preview', async () => {
      const editor = vscode.window.activeTextEditor;
      if (!editor) return;

      const config = readConfig(editor);
      const sel    = getSelectedLines(editor, config.excludedLanguages);
      if (!sel) return;

      const sep = detectBestSeparator(sel.lines, config.separators, config.smartDetectionThreshold);
      if (!sep) {
        vscode.window.showInformationMessage('CodeAlign: no separator detected for preview.');
        return;
      }

      const aligned = alignBySeparator(sel.lines, sep, buildAlignOpts(config));
      if (aligned.join('\n') === sel.lines.join('\n')) {
        vscode.window.showInformationMessage('CodeAlign: selection is already aligned.');
        return;
      }

      const dimType   = vscode.window.createTextEditorDecorationType({ opacity: '0.4' });
      const ghostType = vscode.window.createTextEditorDecorationType({
        after: { color: new vscode.ThemeColor('editorGhostText.foreground'), fontStyle: 'italic' },
      });

      const dimRanges:    vscode.Range[]              = [];
      const ghostOptions: vscode.DecorationOptions[]  = [];
      let   changedCount = 0;

      for (let i = 0; i < sel.lines.length; i++) {
        if (aligned[i] === sel.lines[i]) continue;
        changedCount++;
        const lineNum = sel.range.start.line + i;
        const lineLen = sel.lines[i].length;
        dimRanges.push(new vscode.Range(lineNum, 0, lineNum, lineLen));
        ghostOptions.push({
          range: new vscode.Range(lineNum, lineLen, lineNum, lineLen),
          renderOptions: { after: { contentText: `  →  ${aligned[i].trim()}` } },
        });
      }

      editor.setDecorations(dimType, dimRanges);
      editor.setDecorations(ghostType, ghostOptions);

      const answer = await vscode.window.showInformationMessage(
        `CodeAlign preview (${sep}): ${changedCount} line(s) will change - apply?`,
        'Apply', 'Cancel'
      );

      dimType.dispose();
      ghostType.dispose();

      if (answer === 'Apply' && vscode.window.activeTextEditor === editor) {
        await applyAlignedLines(editor, sel.range, aligned);
        showAlignStatus(sep);
      }
    })
  );

  // -- Switch Profile --------------------------------------------------------
  context.subscriptions.push(
    vscode.commands.registerCommand('codealign.switchProfile', async () => {
      const cfg      = vscode.workspace.getConfiguration('codealign');
      const profiles = cfg.get<Record<string, ProfileConfig>>('profiles', {});
      const current  = cfg.get<string>('activeProfile', '');
      const names    = Object.keys(profiles);

      if (names.length === 0) {
        vscode.window.showInformationMessage(
          'No profiles configured. Add profiles in codealign.profiles in your settings.json.'
        );
        return;
      }

      const items = [
        { label: 'Default', description: 'Use base settings', value: '' },
        ...names.map(n => ({
          label:       current === n ? `$(check) ${n}` : n,
          description: current === n ? 'active' : '',
          value:       n,
        })),
      ];

      const picked = await vscode.window.showQuickPick(items, {
        title:       'CodeAlign - Switch Profile',
        placeHolder: 'Select a profile',
      });
      if (picked === undefined) return;

      await cfg.update('activeProfile', picked.value, vscode.ConfigurationTarget.Global);
      vscode.window.setStatusBarMessage(
        `CodeAlign: profile "${picked.value || 'Default'}" activated`, 3000
      );
    })
  );

  // -- Status bar ------------------------------------------------------------
  const statusBar   = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 99);
  statusBar.command = 'codealign.toggleAutoAlign';
  statusBar.tooltip = 'CodeAlign - click to toggle auto-align';
  context.subscriptions.push(statusBar);

  function refreshStatusBar(): void {
    const { enabled, trigger } = readAutoConfig();
    const { activeProfile }    = readConfig();
    const profilePart          = activeProfile ? ` [${activeProfile}]` : '';
    statusBar.text             = enabled
      ? `$(check) CodeAlign${profilePart}: auto (${trigger})`
      : `$(circle-slash) CodeAlign${profilePart}: manual`;
    statusBar.show();
  }

  refreshStatusBar();

  context.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration(e => {
      if (
        e.affectsConfiguration('codealign.autoAlign') ||
        e.affectsConfiguration('codealign.activeProfile')
      ) refreshStatusBar();
    })
  );

  // -- Toggle Auto-Align -----------------------------------------------------
  context.subscriptions.push(
    vscode.commands.registerCommand('codealign.toggleAutoAlign', async () => {
      const cfg     = vscode.workspace.getConfiguration('codealign');
      const current = cfg.get<boolean>('autoAlign.enabled', false);
      await cfg.update('autoAlign.enabled', !current, vscode.ConfigurationTarget.Global);
      refreshStatusBar();
      vscode.window.setStatusBarMessage(`CodeAlign auto-align: ${!current ? 'ON' : 'OFF'}`, 3000);
    })
  );

  // -- Auto-align on Save ----------------------------------------------------
  context.subscriptions.push(
    vscode.workspace.onDidSaveTextDocument(async doc => {
      const autoConfig = readAutoConfig();
      if (!autoConfig.enabled || autoConfig.trigger !== 'onSave') return;
      const editor = vscode.window.visibleTextEditors.find(e => e.document === doc);
      if (editor) await autoAlignEditor(editor);
    })
  );

  // -- Auto-align on Type (debounced) ----------------------------------------
  let debounceTimer: ReturnType<typeof setTimeout> | undefined;

  context.subscriptions.push(
    vscode.workspace.onDidChangeTextDocument(event => {
      const autoConfig = readAutoConfig();
      if (!autoConfig.enabled || autoConfig.trigger !== 'onType') return;
      if (isPasteAligning) return;

      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(async () => {
        const editor = vscode.window.visibleTextEditors.find(e => e.document === event.document);
        if (editor) await autoAlignEditor(editor);
      }, autoConfig.debounceMs);
    })
  );

  // -- Align Folder ---------------------------------------------------------
  context.subscriptions.push(
    vscode.commands.registerCommand('codealign.alignFolder', async (folderUri?: vscode.Uri) => {
      if (!folderUri) {
        const picked = await vscode.window.showOpenDialog({
          canSelectFiles:   false,
          canSelectFolders: true,
          canSelectMany:    false,
          openLabel:        'Select folder to align',
        });
        if (!picked || picked.length === 0) return;
        folderUri = picked[0];
      }

      const config = readConfig();
      const opts   = buildAlignOpts(config);

      const pattern = new vscode.RelativePattern(folderUri, '**/*');
      const exclude = '{**/node_modules/**,**/.git/**,**/out/**,**/dist/**,**/*.vsix,**/*.png,**/*.jpg,**/*.jpeg,**/*.ico,**/*.gif,**/*.svg,**/*.ttf,**/*.woff,**/*.woff2,**/*.eot,**/*.mp4,**/*.mp3,**/*.zip,**/*.tar,**/*.gz}';

      let files: vscode.Uri[];
      try {
        files = await vscode.workspace.findFiles(pattern, exclude);
      } catch {
        vscode.window.showErrorMessage('CodeAlign: failed to list files in folder.');
        return;
      }

      if (files.length === 0) {
        vscode.window.showInformationMessage('CodeAlign: no files found in the selected folder.');
        return;
      }

      let alignedCount   = 0;
      let unchangedCount = 0;
      let errorCount     = 0;

      await vscode.window.withProgress(
        { location: vscode.ProgressLocation.Notification, title: 'CodeAlign: Aligning folder...', cancellable: true },
        async (progress, token) => {
          const total = files.length;

          for (let i = 0; i < files.length; i++) {
            if (token.isCancellationRequested) break;

            progress.report({
              message:   `${i + 1}/${total}: ${vscode.workspace.asRelativePath(files[i])}`,
              increment: 100 / total,
            });

            try {
              const doc = await vscode.workspace.openTextDocument(files[i]);

              if (config.excludedLanguages.includes(doc.languageId)) {
                unchangedCount++;
                continue;
              }

              const lines  = Array.from({ length: doc.lineCount }, (_, j) => doc.lineAt(j).text);
              let   result = [...lines];

              for (const sep of config.separators) {
                result = alignBySeparator(result, sep, opts);
              }

              if (result.join('\n') === lines.join('\n')) {
                unchangedCount++;
                continue;
              }

              const fullRange = new vscode.Range(
                new vscode.Position(0, 0),
                new vscode.Position(doc.lineCount - 1, doc.lineAt(doc.lineCount - 1).text.length)
              );

              const edit = new vscode.WorkspaceEdit();
              edit.replace(files[i], fullRange, result.join('\n'));
              await vscode.workspace.applyEdit(edit);
              await doc.save();
              alignedCount++;
            } catch {
              errorCount++;
            }
          }
        }
      );

      const parts = [`CodeAlign: ${alignedCount} file(s) aligned`];
      if (unchangedCount > 0) parts.push(`${unchangedCount} unchanged`);
      if (errorCount > 0)     parts.push(`${errorCount} error(s)`);
      vscode.window.showInformationMessage(parts.join(', ') + '.');
    })
  );

  // -- Align on Paste --------------------------------------------------------
  context.subscriptions.push(
    vscode.workspace.onDidChangeTextDocument(async event => {
      if (isPasteAligning) return;

      const config = readConfig();
      if (!config.pasteAlignEnabled) return;

      // Detect multi-line paste: exactly one content change inserting ≥ 2 lines
      if (event.contentChanges.length !== 1) return;
      const change        = event.contentChanges[0];
      const insertedLines = change.text.split('\n');
      if (insertedLines.length < 2) return;

      const editor = vscode.window.visibleTextEditors.find(e => e.document === event.document);
      if (!editor) return;
      if (config.excludedLanguages.includes(editor.document.languageId)) return;

      const startLine = change.range.start.line;
      const endLine   = startLine + insertedLines.length - 1;
      const lines     = Array.from(
        { length: endLine - startLine + 1 },
        (_, i) => editor.document.lineAt(startLine + i).text
      );

      const sep = detectBestSeparator(lines, config.separators, config.smartDetectionThreshold);
      if (!sep) return;

      const opts    = buildAlignOpts(readConfig(editor));
      const aligned = alignBySeparator(lines, sep, opts);
      if (aligned.join('\n') === lines.join('\n')) return;

      const range = new vscode.Range(
        new vscode.Position(startLine, 0),
        new vscode.Position(endLine, editor.document.lineAt(endLine).text.length)
      );

      isPasteAligning = true;
      try {
        await editor.edit(edit => edit.replace(range, aligned.join('\n')));
      } finally {
        isPasteAligning = false;
      }
    })
  );

  // -- Feature 1: Align Changed Lines (Git Diff) -----------------------------
  context.subscriptions.push(
    vscode.commands.registerCommand('codealign.alignDiff', async () => {
      const editor   = vscode.window.activeTextEditor;
      if (!editor) return;
      const config   = readConfig(editor);
      const filePath = editor.document.uri.fsPath;

      if (!filePath) {
        vscode.window.showWarningMessage('CodeAlign: save the file before using git diff alignment.');
        return;
      }

      const changed = getGitChangedLines(filePath);
      if (changed.size === 0) {
        vscode.window.showInformationMessage('CodeAlign: no changed lines found (git diff HEAD).');
        return;
      }

      const doc   = editor.document;
      const lines = Array.from({ length: doc.lineCount }, (_, i) => doc.lineAt(i).text);
      const sep   = detectBestSeparator(
        [...changed].map(i => lines[i] ?? '').filter(Boolean),
        config.separators,
        config.smartDetectionThreshold
      );

      if (!sep) {
        vscode.window.showInformationMessage('CodeAlign: no alignable separator found in changed lines.');
        return;
      }

      const aligned = alignWithChangedLines(lines, sep, changed, buildAlignOpts(config));
      if (aligned.join('\n') === lines.join('\n')) {
        vscode.window.showInformationMessage('CodeAlign: changed lines are already aligned.');
        return;
      }

      const fullRange = new vscode.Range(
        new vscode.Position(0, 0),
        new vscode.Position(doc.lineCount - 1, doc.lineAt(doc.lineCount - 1).text.length)
      );
      await editor.edit(edit => edit.replace(fullRange, aligned.join('\n')));
      showAlignStatus(`${sep} (diff)`);
    })
  );

  // -- Feature 2: Align by Regex ---------------------------------------------
  context.subscriptions.push(
    vscode.commands.registerCommand('codealign.alignRegex', async () => {
      const editor = vscode.window.activeTextEditor;
      if (!editor) return;
      const config = readConfig(editor);

      const input = await vscode.window.showInputBox({
        title:         'CodeAlign - Align by Regex',
        prompt:        'Enter a regex. Lines where it matches are grouped and padded to align the match.',
        placeHolder:   'e.g.  \\s+as\\s+   or   =>   or   \\|',
        validateInput: v => {
          if (!v || !v.trim()) return 'Pattern cannot be empty';
          try { new RegExp(v); return null; }
          catch (e: any) { return `Invalid regex: ${e.message}`; }
        },
      });
      if (!input) return;

      const sel = getSelectedLines(editor, config.excludedLanguages);
      if (!sel) return;

      const aligned = alignByRegex(sel.lines, input.trim(), buildAlignOpts(config));
      if (!aligned) { vscode.window.showErrorMessage('CodeAlign: invalid regex pattern.'); return; }

      await applyAlignedLines(editor, sel.range, aligned);
      showAlignStatus(`/${input}/`);
    })
  );

  // -- Feature 3: Sort & Align -----------------------------------------------
  context.subscriptions.push(
    vscode.commands.registerCommand('codealign.sortAndAlign', async () => {
      const editor = vscode.window.activeTextEditor;
      if (!editor) return;
      const config = readConfig(editor);
      const sel    = getSelectedLines(editor, config.excludedLanguages);
      if (!sel) return;

      const modes = [
        { label: 'A → Z',              description: 'alphabetical ascending',    value: 'az' },
        { label: 'Z → A',              description: 'alphabetical descending',   value: 'za' },
        { label: 'Shortest → Longest', description: 'by line length ascending',  value: 'len-asc' },
        { label: 'Longest → Shortest', description: 'by line length descending', value: 'len-desc' },
        { label: 'By value  A → Z',    description: 'content after separator',   value: 'val-az' },
        { label: 'By value  Z → A',    description: 'content after separator',   value: 'val-za' },
      ];

      const picked = await vscode.window.showQuickPick(modes, {
        title: 'CodeAlign - Sort & Align', placeHolder: 'Choose sort order',
      });
      if (!picked) return;

      const sep      = detectBestSeparator(sel.lines, config.separators, config.smartDetectionThreshold);
      const getValue = (line: string) => {
        if (!sep) return line.trim();
        const idx = findSeparatorIndex(line, sep);
        return idx >= 0 ? line.substring(idx + sep.length).trim() : line.trim();
      };

      const sorted = [...sel.lines].sort((a, b) => {
        switch (picked.value) {
          case 'az':       return a.localeCompare(b);
          case 'za':       return b.localeCompare(a);
          case 'len-asc':  return a.length - b.length;
          case 'len-desc': return b.length - a.length;
          case 'val-az':   return getValue(a).localeCompare(getValue(b));
          case 'val-za':   return getValue(b).localeCompare(getValue(a));
          default:         return 0;
        }
      });

      const aligned = sep ? alignBySeparator(sorted, sep, buildAlignOpts(config)) : sorted;
      await applyAlignedLines(editor, sel.range, aligned);
      showAlignStatus(sep ? `sort + ${sep}` : 'sort');
    })
  );

  // -- Feature 5: Format as Table --------------------------------------------
  context.subscriptions.push(
    vscode.commands.registerCommand('codealign.formatTable', async () => {
      const editor = vscode.window.activeTextEditor;
      if (!editor) return;
      const config = readConfig(editor);
      const sel    = getSelectedLines(editor, config.excludedLanguages);
      if (!sel) return;

      if (sel.lines.length < 2) {
        vscode.window.showInformationMessage('CodeAlign: select at least 2 lines to format as a table.');
        return;
      }

      const formatted = formatAsTable(sel.lines);
      await applyAlignedLines(editor, sel.range, formatted);
      showAlignStatus('table');
    })
  );

  // -- Feature 6: Align to Column --------------------------------------------
  context.subscriptions.push(
    vscode.commands.registerCommand('codealign.alignToColumn', async () => {
      const editor = vscode.window.activeTextEditor;
      if (!editor) return;
      const config = readConfig(editor);
      const sel    = getSelectedLines(editor, config.excludedLanguages);
      if (!sel) return;

      const colInput = await vscode.window.showInputBox({
        title:         'CodeAlign - Align to Column',
        prompt:        'Target column number (1-based). The separator will be padded to reach that column.',
        placeHolder:   'e.g.  40',
        validateInput: v => {
          const n = parseInt(v ?? '', 10);
          return isNaN(n) || n < 1 ? 'Enter a positive integer' : null;
        },
      });
      if (!colInput) return;

      const column  = parseInt(colInput, 10) - 1;
      const sep     = detectBestSeparator(sel.lines, config.separators, config.smartDetectionThreshold);
      const aligned = alignToColumn(sel.lines, column, sep ?? undefined, buildAlignOpts(config));

      await applyAlignedLines(editor, sel.range, aligned);
      showAlignStatus(`col ${parseInt(colInput, 10)}`);
    })
  );

  // -- Feature 7: Column indicator status bar --------------------------------
  const columnBar       = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 98);
  columnBar.tooltip     = 'Aligned separator column - CodeAlign';
  context.subscriptions.push(columnBar);

  function updateColumnIndicator(editor: vscode.TextEditor | undefined): void {
    if (!editor) { columnBar.hide(); return; }
    const config = readConfig(editor);
    if (!config.columnIndicatorEnabled) { columnBar.hide(); return; }

    const doc     = editor.document;
    const lineNum = editor.selection.active.line;
    const line    = doc.lineAt(lineNum).text;
    const cols:   string[] = [];

    for (const sep of config.separators) {
      const pos = findSeparatorIndex(line, sep);
      if (pos < 0) continue;
      let confirmed = false;
      for (const delta of [-1, 1]) {
        const adj = lineNum + delta;
        if (adj < 0 || adj >= doc.lineCount) continue;
        if (findSeparatorIndex(doc.lineAt(adj).text, sep) === pos) { confirmed = true; break; }
      }
      if (confirmed) cols.push(`${sep}:${pos + 1}`);
    }

    if (cols.length === 0) { columnBar.hide(); return; }
    columnBar.text = `$(list-ordered) ${cols.join('  ')}`;
    columnBar.show();
  }

  context.subscriptions.push(
    vscode.window.onDidChangeTextEditorSelection(e => updateColumnIndicator(e.textEditor))
  );
  context.subscriptions.push(
    vscode.window.onDidChangeActiveTextEditor(e => updateColumnIndicator(e))
  );

  // -- Feature 8: Live inline preview ---------------------------------------
  let livePreviewDim:   vscode.TextEditorDecorationType | undefined;
  let livePreviewGhost: vscode.TextEditorDecorationType | undefined;
  let livePreviewTimer: ReturnType<typeof setTimeout> | undefined;

  const clearLivePreview = () => {
    livePreviewDim?.dispose();   livePreviewDim   = undefined;
    livePreviewGhost?.dispose(); livePreviewGhost = undefined;
  };

  context.subscriptions.push(
    vscode.workspace.onDidChangeTextDocument(() => {
      clearTimeout(livePreviewTimer);
      clearLivePreview();
    })
  );

  context.subscriptions.push(
    vscode.window.onDidChangeTextEditorSelection(event => {
      clearTimeout(livePreviewTimer);
      clearLivePreview();

      const editor = event.textEditor;
      const config = readConfig(editor);
      if (!config.livePreviewEnabled) return;
      if (editor.selection.isEmpty) return;

      const startLine = editor.selection.start.line;
      const endLine   = editor.selection.end.line;
      if (endLine <= startLine) return;

      livePreviewTimer = setTimeout(() => {
        const doc     = editor.document;
        const lines   = Array.from({ length: endLine - startLine + 1 }, (_, i) =>
          doc.lineAt(startLine + i).text
        );
        const sep = detectBestSeparator(lines, config.separators, config.smartDetectionThreshold);
        if (!sep) return;

        const aligned      = alignBySeparator(lines, sep, buildAlignOpts(config));
        const dimRanges:   vscode.Range[]             = [];
        const ghostOpts:   vscode.DecorationOptions[] = [];

        for (let i = 0; i < lines.length; i++) {
          if (aligned[i] === lines[i]) continue;
          const ln  = startLine + i;
          const len = lines[i].length;
          dimRanges.push(new vscode.Range(ln, 0, ln, len));
          ghostOpts.push({
            range:         new vscode.Range(ln, len, ln, len),
            renderOptions: { after: { contentText: `  →  ${aligned[i].trimStart()}` } },
          });
        }
        if (dimRanges.length === 0) return;

        livePreviewDim = vscode.window.createTextEditorDecorationType({ opacity: '0.45' });
        livePreviewGhost = vscode.window.createTextEditorDecorationType({
          after: { color: new vscode.ThemeColor('editorGhostText.foreground'), fontStyle: 'italic' },
        });
        editor.setDecorations(livePreviewDim,   dimRanges);
        editor.setDecorations(livePreviewGhost, ghostOpts);
      }, 250);
    })
  );
}

export function deactivate(): void {}

// -- Git diff helper -------------------------------------------------------
function getGitChangedLines(filePath: string): Set<number> {
  try {
    const out = execSync(`git diff HEAD -U0 -- "${filePath}"`, {
      cwd:      path.dirname(filePath),
      encoding: 'utf-8',
      stdio:    ['pipe', 'pipe', 'pipe'],
    });
    const changed = new Set<number>();
    const re      = /^@@ -\d+(?:,\d+)? \+(\d+)(?:,(\d+))? @@/gm;
    let   m:        RegExpExecArray | null;
    while ((m = re.exec(out)) !== null) {
      const start = parseInt(m[1], 10);
      const count = m[2] !== undefined ? parseInt(m[2], 10) : 1;
      for (let i = 0; i < count; i++) changed.add(start + i - 1);
    }
    return changed;
  } catch {
    return new Set();
  }
}

function separatorLabel(sep: string): string {
  const labels: Record<string, string> = {
    '=':  'assignment',
    ':=': 'walrus / Go short assignment',
    '=>': 'fat arrow',
    '->': 'thin arrow',
    '<-': 'left arrow (Go channel)',
    '!=': 'not equal',
    '==': 'equal comparison',
    ':':  'colon - YAML, JSON, dicts',
    '|':  'pipe - tables',
    ',':  'comma',
  };
  return labels[sep] ?? '';
}
