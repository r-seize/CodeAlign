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

  const doc       = editor.document;
  const selection = editor.selection;

  // No selection → fall back to entire document
  const startLine = selection.isEmpty ? 0 : selection.start.line;
  let   endLine   = selection.isEmpty ? doc.lineCount - 1 : selection.end.line;

  // When dragging or using shift+click, VSCode places the end cursor at column 0
  // of the line AFTER the last visually selected line. Exclude that line so it
  // doesn't silently break the last alignment group.
  if (!selection.isEmpty && selection.end.character === 0 && endLine > startLine) {
    endLine -= 1;
  }

  const lines: string[] = [];
  for (let i = startLine; i <= endLine; i++) {
    lines.push(doc.lineAt(i).text);
  }

  const range = new vscode.Range(
    new vscode.Position(startLine, 0),
    new vscode.Position(endLine, doc.lineAt(endLine).text.length)
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
