import * as vscode from 'vscode';
import {
  alignBySeparator,
  alignComments,
  detectBestSeparator,
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
  minSpacesBefore:         number;
  minSpacesAfter:          number;
  commentPrefixes:         string[];
  smartSeparators:         string[];
  commentMinSpaces:        number;
  excludedLanguages:       string[];
  smartDetectionThreshold: number;
  tabSize:                 number;
  separatorOccurrence:     number;
  pasteAlignEnabled:       boolean;
  activeProfile:           string;
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
  const cfg         = vscode.workspace.getConfiguration('codealign');
  const activeProfile = cfg.get<string>('activeProfile', '');
  const profiles      = cfg.get<Record<string, ProfileConfig>>('profiles', {});
  const profileCfg    = activeProfile && profiles[activeProfile] ? profiles[activeProfile] : {};

  return {
    minSpacesBefore:         profileCfg.minimumSpacesBefore ?? cfg.get<number>('minimumSpacesBefore', 1),
    minSpacesAfter:          profileCfg.minimumSpacesAfter  ?? cfg.get<number>('minimumSpacesAfter', 1),
    commentPrefixes:         cfg.get<string[]>('commentSeparators', COMMENT_PREFIXES),
    smartSeparators:         profileCfg.separators          ?? cfg.get<string[]>('smartSeparators', ['=']),
    commentMinSpaces:        cfg.get<number>('commentMinSpaces', 2),
    excludedLanguages:       cfg.get<string[]>('excludedLanguages', []),
    smartDetectionThreshold: cfg.get<number>('smartDetectionThreshold', 0.5),
    tabSize:                 editor ? getTabSize(editor) : 4,
    separatorOccurrence:     cfg.get<number>('separatorOccurrence', 1),
    pasteAlignEnabled:       cfg.get<boolean>('pasteAlign.enabled', false),
    activeProfile,
  };
}

function readAutoConfig(): AutoAlignConfig {
  const cfg = vscode.workspace.getConfiguration('codealign');
  return {
    enabled:    cfg.get<boolean>('autoAlign.enabled', false),
    trigger:    cfg.get<'onSave' | 'onType'>('autoAlign.trigger', 'onSave'),
    debounceMs: cfg.get<number>('autoAlign.debounceMs', 400),
    separators: cfg.get<string[]>('autoAlign.separators', ['=']),
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

    await applyAlignedLines(editor, sel.range, aligned);
  });
  context.subscriptions.push(disposable);
}

let isPasteAligning = false;

export function activate(context: vscode.ExtensionContext): void {

  // ── Align Smart ──────────────────────────────────────────────────────────
  registerAlignCommand(context, 'codealign.alignSmart', (lines, config) => {
    const sep = detectBestSeparator(lines, config.smartSeparators, config.smartDetectionThreshold);
    if (!sep) {
      vscode.window.showInformationMessage('CodeAlign: no alignable separator detected in the selection.');
      return null;
    }
    showAlignStatus(sep);
    return alignBySeparator(lines, sep, buildAlignOpts(config));
  });

  // ── Align by… (QuickPick from smartSeparators) ───────────────────────────
  context.subscriptions.push(
    vscode.commands.registerCommand('codealign.alignBy', async () => {
      const editor = vscode.window.activeTextEditor;
      if (!editor) return;

      const config = readConfig(editor);
      const items  = config.smartSeparators.map(sep => ({
        label:       sep,
        description: separatorLabel(sep),
      }));

      const picked = await vscode.window.showQuickPick(items, {
        title:       'CodeAlign - Align by separator',
        placeHolder: 'Select a separator from your configured list',
      });
      if (!picked) return;

      const sel = getSelectedLines(editor, config.excludedLanguages);
      if (!sel) return;

      const aligned = alignBySeparator(sel.lines, picked.label, buildAlignOpts(config));
      await applyAlignedLines(editor, sel.range, aligned);
      showAlignStatus(picked.label);
    })
  );

  // ── Align by Custom Separator ─────────────────────────────────────────────
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

  // ── Align Inline Comments ─────────────────────────────────────────────────
  registerAlignCommand(context, 'codealign.alignComments', (lines, config) => {
    showAlignStatus('comments');
    const aligned = alignComments(lines, config.commentPrefixes, config.commentMinSpaces, config.tabSize);
    if (aligned.join('\n') === lines.join('\n')) {
      vscode.window.showInformationMessage('CodeAlign: no inline comments found to align.');
    }
    return aligned;
  });

  // ── Unalign ───────────────────────────────────────────────────────────────
  registerAlignCommand(context, 'codealign.unalign', (lines, config) => {
    const sep    = detectBestSeparator(lines, config.smartSeparators, config.smartDetectionThreshold);
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

  // ── Preview ───────────────────────────────────────────────────────────────
  context.subscriptions.push(
    vscode.commands.registerCommand('codealign.preview', async () => {
      const editor = vscode.window.activeTextEditor;
      if (!editor) return;

      const config = readConfig(editor);
      const sel    = getSelectedLines(editor, config.excludedLanguages);
      if (!sel) return;

      const sep = detectBestSeparator(sel.lines, config.smartSeparators, config.smartDetectionThreshold);
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

  // ── Switch Profile ────────────────────────────────────────────────────────
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

  // ── Status bar ────────────────────────────────────────────────────────────
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

  // ── Toggle Auto-Align ─────────────────────────────────────────────────────
  context.subscriptions.push(
    vscode.commands.registerCommand('codealign.toggleAutoAlign', async () => {
      const cfg     = vscode.workspace.getConfiguration('codealign');
      const current = cfg.get<boolean>('autoAlign.enabled', false);
      await cfg.update('autoAlign.enabled', !current, vscode.ConfigurationTarget.Global);
      refreshStatusBar();
      vscode.window.setStatusBarMessage(`CodeAlign auto-align: ${!current ? 'ON' : 'OFF'}`, 3000);
    })
  );

  // ── Auto-align on Save ────────────────────────────────────────────────────
  context.subscriptions.push(
    vscode.workspace.onDidSaveTextDocument(async doc => {
      const autoConfig = readAutoConfig();
      if (!autoConfig.enabled || autoConfig.trigger !== 'onSave') return;
      const editor = vscode.window.visibleTextEditors.find(e => e.document === doc);
      if (editor) await autoAlignEditor(editor);
    })
  );

  // ── Auto-align on Type (debounced) ────────────────────────────────────────
  let debounceTimer: ReturnType<typeof setTimeout> | undefined;

  context.subscriptions.push(
    vscode.workspace.onDidChangeTextDocument(event => {
      const autoConfig = readAutoConfig();
      if (!autoConfig.enabled || autoConfig.trigger !== 'onType') return;

      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(async () => {
        const editor = vscode.window.visibleTextEditors.find(e => e.document === event.document);
        if (editor) await autoAlignEditor(editor);
      }, autoConfig.debounceMs);
    })
  );

  // ── Align on Paste ────────────────────────────────────────────────────────
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

      const sep = detectBestSeparator(lines, config.smartSeparators, config.smartDetectionThreshold);
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
}

export function deactivate(): void {}

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
