import * as vscode from 'vscode';

export interface SelectionLines {
  lines: string[];
  range: vscode.Range;
}

/**
 * Get the full lines covered by the current selection, expanded to line boundaries.
 * Returns null if selection is empty or the language is excluded.
 */
export function getSelectedLines(
  editor: vscode.TextEditor,
  excludedLanguages: string[]
): SelectionLines | null {
  const langId = editor.document.languageId;
  if (excludedLanguages.includes(langId)) {
    vscode.window.showInformationMessage(
      `CodeAlign: disabled for language "${langId}".`
    );
    return null;
  }

  const selection = editor.selection;
  if (selection.isEmpty) {
    vscode.window.showInformationMessage('CodeAlign: select the lines you want to align first.');
    return null;
  }

  const startLine       = selection.start.line;
  const endLine         = selection.end.line;
  const lines: string[] = [];

  for (let i = startLine; i <= endLine; i++) {
    lines.push(editor.document.lineAt(i).text);
  }

  const range = new vscode.Range(
    new vscode.Position(startLine, 0),
    new vscode.Position(endLine, editor.document.lineAt(endLine).text.length)
  );

  return { lines, range };
}

/**
 * Apply aligned lines back to the editor, replacing the given range.
 */
export async function applyAlignedLines(
  editor: vscode.TextEditor,
  range: vscode.Range,
  aligned: string[]
): Promise<void> {
  const newText = aligned.join('\n');
  await editor.edit(edit => edit.replace(range, newText));
}

/**
 * Show a temporary status bar message indicating which separator was used.
 */
export function showAlignStatus(separator: string): void {
  vscode.window.setStatusBarMessage(`CodeAlign: aligned by "${separator}"`, 3000);
}
