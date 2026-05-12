import * as vscode from 'vscode';
import {
  alignBySeparator,
  alignComments,
  alignMultiColumn,
  detectBestSeparator,
  COMMENT_PREFIXES,
} from './aligner/alignEngine';
import {
  getSelectedLines,
  applyAlignedLines,
  showAlignStatus,
} from './utils/editorUtils';

interface CodeAlignConfig {
  minSpacesBefore: number;
  minSpacesAfter: number;
  commentPrefixes: string[];
  smartSeparators: string[];
  commentMinSpaces: number;
  excludedLanguages: string[];
  smartDetectionThreshold: number;
}

interface AutoAlignConfig {
  enabled: boolean;
  trigger: 'onSave' | 'onType';
  debounceMs: number;
  separators: string[];
}

function readConfig(): CodeAlignConfig {
  const cfg = vscode.workspace.getConfiguration('codealign');
  return {
    minSpacesBefore:         cfg.get<number>('minimumSpacesBefore', 1),
    minSpacesAfter:          cfg.get<number>('minimumSpacesAfter', 1),
    commentPrefixes:         cfg.get<string[]>('commentSeparators', COMMENT_PREFIXES),
    smartSeparators:         cfg.get<string[]>('smartSeparators', ['=']),
    commentMinSpaces:        cfg.get<number>('commentMinSpaces', 2),
    excludedLanguages:       cfg.get<string[]>('excludedLanguages', []),
    smartDetectionThreshold: cfg.get<number>('smartDetectionThreshold', 0.5),
  };
}

function readAutoConfig(): AutoAlignConfig {
  const cfg = vscode.workspace.getConfiguration('codealign');
  return {
    enabled:     cfg.get<boolean>('autoAlign.enabled', false),
    trigger:     cfg.get<'onSave' | 'onType'>('autoAlign.trigger', 'onSave'),
    debounceMs:  cfg.get<number>('autoAlign.debounceMs', 400),
    separators:  cfg.get<string[]>('autoAlign.separators', ['=']),
  };
}

async function autoAlignEditor(editor: vscode.TextEditor): Promise<void> {
  const config     = readConfig();
  const autoConfig = readAutoConfig();

  if (!autoConfig.enabled) return;
  if (config.excludedLanguages.includes(editor.document.languageId)) return;

  const doc   = editor.document;
  const lines = Array.from({ length: doc.lineCount }, (_, i) => doc.lineAt(i).text);

  let aligned = [...lines];
  for (const sep of autoConfig.separators) {
    aligned = alignBySeparator(aligned, sep, {
      minSpacesBefore: config.minSpacesBefore,
      minSpacesAfter:  config.minSpacesAfter,
      commentPrefixes: config.commentPrefixes,
    });
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

    const config = readConfig();
    const sel    = getSelectedLines(editor, config.excludedLanguages);
    if (!sel) return;

    const aligned = fn(sel.lines, config);
    if (!aligned) return;

    await applyAlignedLines(editor, sel.range, aligned);
  });
  context.subscriptions.push(disposable);
}

export function activate(context: vscode.ExtensionContext): void {

  registerAlignCommand(context, 'codealign.alignSmart', (lines, config) => {
    const sep = detectBestSeparator(
      lines,
      config.smartSeparators,
      config.smartDetectionThreshold
    );

    if (!sep) {
      vscode.window.showInformationMessage(
        'CodeAlign: no alignable separator detected in the selection.'
      );
      return null;
    }

    showAlignStatus(sep);
    return alignBySeparator(lines, sep, {
      minSpacesBefore:  config.minSpacesBefore,
      minSpacesAfter:   config.minSpacesAfter,
      commentPrefixes:  config.commentPrefixes,
    });
  });

  registerAlignCommand(context, 'codealign.alignByEquals', (lines, config) => {
    showAlignStatus('=');
    return alignBySeparator(lines, '=', {
      minSpacesBefore:  config.minSpacesBefore,
      minSpacesAfter:   config.minSpacesAfter,
      commentPrefixes:  config.commentPrefixes,
    });
  });

  registerAlignCommand(context, 'codealign.alignByColon', (lines, config) => {
    showAlignStatus(':');
    return alignBySeparator(lines, ':', {
      minSpacesBefore:  config.minSpacesBefore,
      minSpacesAfter:   config.minSpacesAfter,
      commentPrefixes:  config.commentPrefixes,
    });
  });

  registerAlignCommand(context, 'codealign.alignByPipe', (lines, config) => {
    showAlignStatus('|');
    return alignBySeparator(lines, '|', {
      minSpacesBefore:  config.minSpacesBefore,
      minSpacesAfter:   config.minSpacesAfter,
      commentPrefixes:  config.commentPrefixes,
    });
  });

  registerAlignCommand(context, 'codealign.alignByArrow', (lines, config) => {
    const hasFatArrow  = lines.some(l => l.includes('=>'));
    const hasThinArrow = lines.some(l => l.includes('->'));
    const sep          = hasFatArrow ? '=>' : hasThinArrow ? '->' : '=>';
    showAlignStatus(sep);
    return alignBySeparator(lines, sep, {
      minSpacesBefore:  config.minSpacesBefore,
      minSpacesAfter:   config.minSpacesAfter,
      commentPrefixes:  config.commentPrefixes,
    });
  });

  registerAlignCommand(context, 'codealign.alignComments', (lines, config) => {
    showAlignStatus('comments');
    const aligned = alignComments(lines, config.commentPrefixes, config.commentMinSpaces);
    if (aligned.join('\n') === lines.join('\n')) {
      vscode.window.showInformationMessage(
        'CodeAlign: no inline comments found to align.'
      );
    }
    return aligned;
  });

  registerAlignCommand(context, 'codealign.alignMultiColumn', (lines, config) => {
    const sep = detectBestSeparator(
      lines,
      config.smartSeparators,
      config.smartDetectionThreshold
    );

    if (!sep) {
      vscode.window.showInformationMessage(
        'CodeAlign: no alignable separator detected for multi-column alignment.'
      );
      return null;
    }

    showAlignStatus(`${sep} + comments`);
    return alignMultiColumn(
      lines,
      sep,
      config.commentPrefixes,
      {
        minSpacesBefore: config.minSpacesBefore,
        minSpacesAfter:  config.minSpacesAfter,
        commentPrefixes: config.commentPrefixes,
      },
      config.commentMinSpaces
    );
  });

  context.subscriptions.push(
    vscode.commands.registerCommand('codealign.alignCustom', async () => {
      const editor = vscode.window.activeTextEditor;
      if (!editor) return;

      const input = await vscode.window.showInputBox({
        title:       'CodeAlign - Custom Separator',
        prompt:      'Enter the separator to align by',
        placeHolder: 'e.g.  =   :   |   =>   ->   !=   ==',
        validateInput: v => (!v || v.trim().length === 0) ? 'Separator cannot be empty' : null,
      });

      if (!input) return;
      const sep = input.trim();

      const config = readConfig();
      const sel    = getSelectedLines(editor, config.excludedLanguages);
      if (!sel) return;

      const aligned = alignBySeparator(sel.lines, sep, {
        minSpacesBefore:  config.minSpacesBefore,
        minSpacesAfter:   config.minSpacesAfter,
        commentPrefixes:  config.commentPrefixes,
      });

      await applyAlignedLines(editor, sel.range, aligned);
      showAlignStatus(sep);
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('codealign.setAlignmentDistance', async () => {
      const cfg     = vscode.workspace.getConfiguration('codealign');
      const current = cfg.get<number>('minimumSpacesBefore', 1);

      const input = await vscode.window.showInputBox({
        title:       'CodeAlign - Alignment Distance',
        prompt:      'Number of spaces between the longest variable and the separator (for the shortest padding)',
        value:       String(current),
        placeHolder: '1',
        validateInput: v => {
          const n = parseInt(v ?? '');
          if (isNaN(n) || n < 0 || n > 20) return 'Enter a whole number between 0 and 20';
          return null;
        },
      });

      if (input === undefined) return;
      const n = parseInt(input);
      await cfg.update('minimumSpacesBefore', n, vscode.ConfigurationTarget.Global);
      vscode.window.setStatusBarMessage(`CodeAlign: alignment distance set to ${n} space(s).`, 3000);
    })
  );

  const statusBar   = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 99);
  statusBar.command = 'codealign.toggleAutoAlign';
  statusBar.tooltip = 'CodeAlign - click to toggle auto-align';
  context.subscriptions.push(statusBar);

  function refreshStatusBar(): void {
    const { enabled, trigger } = readAutoConfig();
    statusBar.text             = enabled
      ? `$(check) CodeAlign: auto (${trigger})`
      : `$(circle-slash) CodeAlign: manual`;
    statusBar.show();
  }

  refreshStatusBar();

  context.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration(e => {
      if (e.affectsConfiguration('codealign.autoAlign')) refreshStatusBar();
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('codealign.toggleAutoAlign', async () => {
      const cfg     = vscode.workspace.getConfiguration('codealign');
      const current = cfg.get<boolean>('autoAlign.enabled', false);
      await cfg.update('autoAlign.enabled', !current, vscode.ConfigurationTarget.Global);
      refreshStatusBar();
      vscode.window.setStatusBarMessage(
        `CodeAlign auto-align: ${!current ? 'ON' : 'OFF'}`,
        3000
      );
    })
  );

  context.subscriptions.push(
    vscode.workspace.onDidSaveTextDocument(async doc => {
      const autoConfig = readAutoConfig();
      if (!autoConfig.enabled || autoConfig.trigger !== 'onSave') return;
      const editor = vscode.window.visibleTextEditors.find(e => e.document === doc);
      if (editor) await autoAlignEditor(editor);
    })
  );

  let debounceTimer: ReturnType<typeof setTimeout> | undefined;

  context.subscriptions.push(
    vscode.workspace.onDidChangeTextDocument(event => {
      const autoConfig = readAutoConfig();
      if (!autoConfig.enabled || autoConfig.trigger !== 'onType') return;

      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(async () => {
        const editor = vscode.window.visibleTextEditors.find(
          e => e.document === event.document
        );
        if (editor) await autoAlignEditor(editor);
      }, autoConfig.debounceMs);
    })
  );
}

export function deactivate(): void {}
