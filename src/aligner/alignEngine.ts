export interface AlignOptions {
    minSpacesBefore:     number;
    minSpacesAfter:      number;
    commentPrefixes:     string[];
    tabSize:             number;
    separatorOccurrence: number;
}

const DEFAULT_OPTIONS: AlignOptions = {
    minSpacesBefore:     1,
    minSpacesAfter:      1,
    commentPrefixes:     [],
    tabSize:             4,
    separatorOccurrence: 1,
};

export const KNOWN_SEPARATORS = [
    ':=', '=>', '->', '<-', '!=', '==',
    '=', ':', '|', ',',
];

export const COMMENT_PREFIXES = ['//', '#', '--', ';'];

/**
 * Find the first valid occurrence of a separator in a line.
 * Skips occurrences that are part of a longer operator.
 */
export function findSeparatorIndex(line: string, separator: string, occurrence = 1): number {
    let pos   = 0;
    let found = 0;

    while (pos < line.length) {
        const idx = line.indexOf(separator, pos);
        if (idx === -1) return -1;

        // Universal: skip any separator that falls inside a string literal
        if (isLikelyInsideString(line.substring(0, idx), separator)) {
            pos = idx + 1;
            continue;
        }

        if (separator === '=') {
            const prev = idx > 0 ? line[idx - 1] : '';
            const next = idx < line.length - 1 ? line[idx + 1] : '';
            // Skip !=, <=, >=, :=, ==, => and the second = in ==.
            // Also skip compound assignments: +=, -=, *=, /=, %=, &=, |=, ^=, ~=, ?= (??=)
            if ('!<>:=+-*/%&|^~?'.includes(prev) || '=>'.includes(next)) {
                pos = idx + 1;
                continue;
            }
            // Skip = inside () - for-loop initialisers, default parameters, conditions
            if (parenDepthAt(line, idx) > 0) {
                pos = idx + 1;
                continue;
            }
        }

        if (separator === ':') {
            const next = idx < line.length - 1 ? line[idx + 1] : '';
            const prev = idx > 0 ? line[idx - 1] : '';
            // Skip :=, ::
            if (next === '=' || next === ':' || prev === ':') {
                pos = idx + 1;
                continue;
            }
        }

        if (separator === '<') {
            const next = idx < line.length - 1 ? line[idx + 1] : '';
            if (next === '-' || next === '=' || next === '<') {
                pos = idx + 1;
                continue;
            }
        }

        if (separator === '>') {
            const next = idx < line.length - 1 ? line[idx + 1] : '';
            const prev = idx > 0 ? line[idx - 1] : '';
            if (next === '=' || next === '>' || prev === '-' || prev === '=') {
                pos = idx + 1;
                continue;
            }
        }

        if (separator === '|') {
            const next = idx < line.length - 1 ? line[idx + 1] : '';
            const prev = idx > 0 ? line[idx - 1] : '';
            // Skip || (logical or)
            if (next === '|' || prev === '|') {
                pos = idx + 1;
                continue;
            }
        }

        if (separator === ',') {
            // Skip commas inside balanced brackets (basic check)
            let depth = 0;
            for (let i = 0; i < idx; i++) {
                const ch = line[i];
                if ('([{'.includes(ch)) depth++;
                else if (')]}'.includes(ch)) depth--;
            }
            if (depth > 0) {
                pos = idx + 1;
                continue;
            }
        }

        // Valid occurrence - return if this is the one we want, otherwise keep looking
        found++;
        if (found === occurrence) return idx;
        pos = idx + separator.length;
    }

    return -1;
}

function getIndent(line: string): string {
    return line.match(/^(\s*)/)?.[1] ?? '';
}

/**
 * Expand tabs to spaces using the given tab size so that visually-equivalent
 * indentations compare equal across mixed tab/space files.
 */
function normalizeIndent(indent: string, tabSize: number): string {
    let col = 0;
    for (const ch of indent) {
        if (ch === '\t') col += tabSize - (col % tabSize);
        else col += 1;
    }
    return ' '.repeat(col);
}

/**
 * Returns true if the line opens a multi-line block after the separator.
 * e.g.  "const x = {"  or  "const arr = ["  - these should not join an alignment group.
 * A single-line assignment like "const obj = { a: 1 };" is fine (last char is ";").
 */
function opensBlock(line: string, commentPrefixes: string[]): boolean {
    const codePart = getCodePart(line, commentPrefixes).trimEnd();
    return codePart.endsWith('{') || codePart.endsWith('[') || codePart.endsWith('(');
}

/**
 * Return the code portion of a line (everything before the first inline comment).
 * Returns an empty string for full-line comments.
 * The returned string is a prefix of the original line, so indices are preserved.
 */
function getCodePart(line: string, commentPrefixes: string[]): string {
    for (const prefix of commentPrefixes) {
        const idx = line.indexOf(prefix);
        if (idx < 0) continue;
        const before = line.substring(0, idx);
        if (before.trim().length === 0) return ''; // full-line comment
        if (!isLikelyInsideString(before, prefix)) return before;
    }
    return line;
}

/**
 * Split line indices into consecutive groups that all contain the separator
 * AND share the same leading indentation.
 * Separators found inside comments (as identified by commentPrefixes) are ignored.
 * A change in indentation level, a missing separator, or a blank line all break the group.
 * A group must have at least 2 lines to be worth aligning.
 */
function findConsecutiveGroups(
    lines: string[],
    separator: string,
    commentPrefixes:     string[] = [],
    tabSize                       = 4,
    separatorOccurrence           = 1
): Array<{ start: number; end: number }> {
    const groups: Array<{ start: number; end: number }> = [];
    let groupStart  = -1;
    let groupIndent = '';

    const closeGroup = (end: number) => {
        if (groupStart !== -1 && end - groupStart >= 2) {
            groups.push({ start: groupStart, end: end - 1 });
        }
        groupStart  = -1;
        groupIndent = '';
    };

    for (let i = 0; i <= lines.length; i++) {
        if (i === lines.length) {
            closeGroup(i);
            break;
        }

        const line     = lines[i];
        const codePart = getCodePart(line, commentPrefixes);
        const hasSep   = codePart.length > 0
            && findSeparatorIndex(codePart, separator, separatorOccurrence) >= 0
            && !opensBlock(line, commentPrefixes);
        const indent = normalizeIndent(getIndent(line), tabSize);

        if (!hasSep) {
            closeGroup(i);
            continue;
        }

        if (groupStart === -1) {
            // Start a new group
            groupStart  = i;
            groupIndent = indent;
        } else if (indent !== groupIndent) {
            // Different indentation - close current group, start a fresh one
            closeGroup(i);
            groupStart  = i;
            groupIndent = indent;
        }
        // else: same indent + has separator → extend current group
    }

    return groups;
}

/**
 * Align a single group of lines (all assumed to have the separator) by that separator.
 * Separators inside comments are ignored.
 */
function alignGroup(
    lines: string[],
    separator: string,
    opts: AlignOptions
): string[] {
    const sepIndices = lines.map(line => {
        const codePart = getCodePart(line, opts.commentPrefixes);
        return codePart.length > 0 ? findSeparatorIndex(codePart, separator, opts.separatorOccurrence) : -1;
    });

    const beforeTexts = lines.map((line, i) =>
        sepIndices[i] >= 0 ? line.substring(0, sepIndices[i]).trimEnd() : null
    );

    const maxLen = Math.max(
        ...beforeTexts.filter((t): t is string => t !== null).map(t => t.length)
    );

    return lines.map((line, i) => {
        if (sepIndices[i] < 0) return line;

        const before   = beforeTexts[i]!;
        const rawAfter = line.substring(sepIndices[i] + separator.length);
        const after    = rawAfter.trimStart();

        const pad         = ' '.repeat(maxLen - before.length + opts.minSpacesBefore);
        const spacesAfter = after.length > 0 ? ' '.repeat(opts.minSpacesAfter) : '';

        return before + pad + separator + spacesAfter + after;
    });
}

/**
 * Align lines by a given separator.
 * Only consecutive groups of lines that all contain the separator are aligned together.
 * Isolated lines (no separator on adjacent lines) are left untouched.
 */
export function alignBySeparator(
    lines: string[],
    separator: string,
    options: Partial<AlignOptions> = {}
): string[] {
    const opts   = { ...DEFAULT_OPTIONS, ...options };
    const groups = findConsecutiveGroups(lines, separator, opts.commentPrefixes, opts.tabSize, opts.separatorOccurrence);

    if (groups.length === 0) return lines;

    const result = [...lines];

    for (const { start, end } of groups) {
        const groupLines = lines.slice(start, end + 1);
        const aligned    = alignGroup(groupLines, separator, opts);
        for (let i = 0; i < aligned.length; i++) {
            result[start + i] = aligned[i];
        }
    }

    return result;
}

/**
 * Detect the best separator from a set of candidates for smart alignment.
 * Returns null if no separator meets the threshold.
 */
export function detectBestSeparator(
    lines: string[],
    candidates: string[],
    threshold = 0.5
): string | null {
    const minCount = Math.max(2, Math.floor(lines.length * threshold));

    const countOf = (sep: string) =>
        lines.filter(l => findSeparatorIndex(l, sep) >= 0).length;

    // Try candidates in list order - first one that meets the threshold wins.
    // This gives explicit priority to = over : so that TypeScript type annotations
    // (:) do not outrank assignment operators (=) when both are present.
    for (const sep of candidates) {
        if (countOf(sep) >= minCount) return sep;
    }

    // Relaxed fallback: first candidate with at least 2 occurrences.
    for (const sep of candidates) {
        if (countOf(sep) >= 2) return sep;
    }

    return null;
}

interface CommentInfo {
    code: string;
    comment: string;
}

function parseInlineComment(
    line: string,
    prefixes: string[]
): CommentInfo | null {
    for (const prefix of prefixes) {
        const idx = line.indexOf(prefix);
        if (idx <= 0) continue;

        const before = line.substring(0, idx);
        if (before.trim().length === 0) continue; // full-line comment

        if (isLikelyInsideString(before, prefix)) continue;

        return { code: before.trimEnd(), comment: line.substring(idx) };
    }
    return null;
}

/**
 * Align inline comments to the same column.
 * Only consecutive groups of lines that all have an inline comment are aligned together.
 * Full-line comments and isolated lines are left untouched.
 */
export function alignComments(
    lines: string[],
    commentPrefixes: string[],
    minSpacesBefore = 2,
    tabSize         = 4
): string[] {
    const parsed = lines.map(line => parseInlineComment(line, commentPrefixes));

    // Find consecutive groups of lines that all have an inline comment
    // AND share the same leading indentation.
    const groups: Array<{ start: number; end: number }> = [];
    let groupStart  = -1;
    let groupIndent = '';

    const closeCommentGroup = (end: number) => {
        if (groupStart !== -1 && end - groupStart >= 2) {
            groups.push({ start: groupStart, end: end - 1 });
        }
        groupStart  = -1;
        groupIndent = '';
    };

    for (let i = 0; i <= lines.length; i++) {
        if (i === lines.length) { closeCommentGroup(i); break; }

        const hasComment = parsed[i] !== null;
        const indent     = normalizeIndent(getIndent(lines[i]), tabSize);

        if (!hasComment) {
            closeCommentGroup(i);
            continue;
        }

        if (groupStart === -1) {
            groupStart  = i;
            groupIndent = indent;
        } else if (indent !== groupIndent) {
            closeCommentGroup(i);
            groupStart  = i;
            groupIndent = indent;
        }
    }

    if (groups.length === 0) return lines;

    const result = [...lines];

    for (const { start, end } of groups) {
        const groupInfos = parsed.slice(start, end + 1) as CommentInfo[];
        const maxCodeLen = Math.max(...groupInfos.map(c => c.code.length));

        for (let i = start; i <= end; i++) {
            const info = parsed[i]!;
            const pad  = ' '.repeat(maxCodeLen - info.code.length + minSpacesBefore);
            result[i]  = info.code + pad + info.comment;
        }
    }

    return result;
}

/**
 * Perform multi-column alignment: first align by separator, then align comments.
 */
export function alignMultiColumn(
    lines: string[],
    separator: string,
    commentPrefixes: string[],
    options: Partial<AlignOptions> = {},
    commentMinSpaces               = 2
): string[] {
    const opts     = { ...DEFAULT_OPTIONS, ...options };
    const afterSep = alignBySeparator(lines, separator, opts);
    return alignComments(afterSep, commentPrefixes, commentMinSpaces, opts.tabSize);
}

/**
 * Collapse the run of spaces immediately around the separator on a single line
 * down to opts.minSpacesBefore / opts.minSpacesAfter. Leading indent is preserved.
 * Returns the line untouched if it has no top-level separator.
 */
function unalignLine(
    line: string,
    separator: string,
    opts: AlignOptions
): string {
    const indent  = line.match(/^(\s*)/)?.[1] ?? '';
    const body    = line.substring(indent.length);

    const commentInfo = parseInlineComment(body, opts.commentPrefixes);
    const codePart    = commentInfo ? commentInfo.code : body;
    const commentTail = commentInfo ? commentInfo.comment : '';

    const sepIdx = findSeparatorIndex(codePart, separator, opts.separatorOccurrence);
    if (sepIdx < 0) return line;

    const before = codePart.substring(0, sepIdx).trimEnd();
    const after  = codePart.substring(sepIdx + separator.length).trimStart();

    const beforeSpace = ' '.repeat(opts.minSpacesBefore);
    const afterSpace  = after.length > 0 ? ' '.repeat(opts.minSpacesAfter) : '';

    let collapsed = indent + before + beforeSpace + separator + afterSpace + after;
    if (commentTail) collapsed += ' ' + commentTail;
    return collapsed;
}

/**
 * Reverse of alignBySeparator: collapse runs of spaces around the separator on
 * every line that has it at top level, back to the configured minimum gap.
 * Lines without the separator are returned untouched.
 */
export function unalignBySeparator(
    lines: string[],
    separator: string,
    options: Partial<AlignOptions> = {}
): string[] {
    const opts = { ...DEFAULT_OPTIONS, ...options };
    return lines.map(line => unalignLine(line, separator, opts));
}

/**
 * Reverse of alignComments: collapse the gap between code and inline comment
 * to minSpacesBefore (default 1). Full-line comments are left untouched.
 */
export function unalignComments(
    lines: string[],
    commentPrefixes: string[],
    minSpacesBefore = 1
): string[] {
    return lines.map(line => {
        const indent = line.match(/^(\s*)/)?.[1] ?? '';
        const body   = line.substring(indent.length);
        const info   = parseInlineComment(body, commentPrefixes);
        if (!info) return line;
        return indent + info.code + ' '.repeat(minSpacesBefore) + info.comment;
    });
}

// -- Feature extensions ----------------------------------------------------

/**
 * Align lines by a regular expression pattern.
 * Lines matching the pattern are grouped and padded so the match starts at the
 * same column. Returns null if the pattern is invalid.
 */
export function alignByRegex(
    lines:   string[],
    pattern: string,
    opts:    Partial<AlignOptions> = {}
): string[] | null {
    const options = { ...DEFAULT_OPTIONS, ...opts };
    let regex: RegExp;
    try { regex = new RegExp(pattern); } catch { return null; }

    const groups: Array<{ start: number; end: number }> = [];
    let groupStart  = -1;
    let groupIndent = '';

    const close = (i: number) => {
        if (groupStart !== -1 && i - groupStart >= 2) groups.push({ start: groupStart, end: i - 1 });
        groupStart = -1; groupIndent = '';
    };

    for (let i = 0; i <= lines.length; i++) {
        if (i === lines.length) { close(i); break; }
        const m      = regex.exec(lines[i]);
        const indent = normalizeIndent(getIndent(lines[i]), options.tabSize);
        if (!m) { close(i); continue; }
        if (groupStart === -1) { groupStart = i; groupIndent = indent; }
        else if (indent !== groupIndent) { close(i); groupStart = i; groupIndent = indent; }
    }

    if (groups.length === 0) return lines;
    const result = [...lines];

    for (const { start, end } of groups) {
        const grpLines = lines.slice(start, end + 1);
        const matches  = grpLines.map(l => regex.exec(l));
        const maxBefore = Math.max(...matches.map((m, i) =>
            m ? grpLines[i].substring(0, m.index).trimEnd().length : 0
        ));
        for (let i = 0; i < grpLines.length; i++) {
            const m = matches[i];
            if (!m) continue;
            const before = grpLines[i].substring(0, m.index).trimEnd();
            const after  = grpLines[i].substring(m.index + m[0].length).trimStart();
            const pad    = ' '.repeat(maxBefore - before.length + options.minSpacesBefore);
            const aPad   = after.length > 0 ? ' '.repeat(options.minSpacesAfter) : '';
            result[start + i] = before + pad + m[0] + aPad + after;
        }
    }
    return result;
}

/**
 * Format selected lines as a Markdown table.
 * Auto-detects delimiter (|, comma, tab). Recalculates column widths and
 * inserts/replaces the header separator row.
 */
export function formatAsTable(lines: string[]): string[] {
    if (lines.length < 2) return lines;

    const score = (d: string) => lines.filter(l => l.includes(d)).length;
    const delimiter = score('|') >= score(',') && score('|') >= score('\t') ? '|'
                    : score(',') >= score('\t') ? ','
                    : '\t';

    const parse = (l: string) => l.split(delimiter)
        .map(c => c.trim())
        .filter((c, i, arr) => !(i === 0 && c === '') && !(i === arr.length - 1 && c === ''));

    const rows     = lines.map(parse);
    const dataRows = rows.filter(r => !r.every(c => /^[-: ]+$/.test(c)));
    if (dataRows.length === 0) return lines;

    const colCount  = Math.max(...dataRows.map(r => r.length));
    const colWidths = Array(colCount).fill(3);
    for (const row of dataRows) {
        for (let c = 0; c < row.length; c++) {
            colWidths[c] = Math.max(colWidths[c], (row[c] ?? '').length);
        }
    }

    const fmtRow = (cells: string[]) =>
        '| ' + Array.from({ length: colCount }, (_, c) =>
            (cells[c] ?? '').padEnd(colWidths[c])
        ).join(' | ') + ' |';

    const sepRow = '| ' + colWidths.map(w => '-'.repeat(w)).join(' | ') + ' |';

    const result = [fmtRow(dataRows[0]), sepRow];
    for (let i = 1; i < dataRows.length; i++) result.push(fmtRow(dataRows[i]));
    return result;
}

/**
 * Pad lines so the separator (or end of content) reaches the target column.
 * Lines where the content already exceeds the column are left untouched.
 */
export function alignToColumn(
    lines:     string[],
    column:    number,
    separator?: string,
    opts:      Partial<AlignOptions> = {}
): string[] {
    const options = { ...DEFAULT_OPTIONS, ...opts };
    return lines.map(line => {
        if (!separator) {
            const trimmed = line.trimEnd();
            return trimmed.length >= column ? line : trimmed + ' '.repeat(column - trimmed.length);
        }
        const idx = findSeparatorIndex(line, separator, options.separatorOccurrence);
        if (idx < 0) return line;
        const before = line.substring(0, idx).trimEnd();
        const rest   = line.substring(idx);
        const needed = column - before.length;
        if (needed <= options.minSpacesBefore) return line;
        return before + ' '.repeat(needed) + rest;
    });
}

/**
 * Align only the groups that contain at least one of the provided changed line
 * indices. Groups without any changed line are left untouched.
 */
export function alignWithChangedLines(
    lines:          string[],
    separator:      string,
    changedIndices: Set<number>,
    options:        Partial<AlignOptions> = {}
): string[] {
    const opts   = { ...DEFAULT_OPTIONS, ...options };
    const groups = findConsecutiveGroups(
        lines, separator, opts.commentPrefixes, opts.tabSize, opts.separatorOccurrence
    );

    const active = groups.filter(({ start, end }) => {
        for (let i = start; i <= end; i++) {
            if (changedIndices.has(i)) return true;
        }
        return false;
    });

    if (active.length === 0) return lines;

    const result = [...lines];
    for (const { start, end } of active) {
        const aligned = alignGroup(lines.slice(start, end + 1), separator, opts);
        for (let i = 0; i < aligned.length; i++) result[start + i] = aligned[i];
    }
    return result;
}

/**
 * Return the depth of unmatched '(' at the given position in a line.
 * Used to skip = signs that appear inside for-loop headers or function parameters.
 */
function parenDepthAt(line: string, pos: number): number {
    let depth = 0;
    for (let i = 0; i < pos; i++) {
        if (line[i] === '(') depth++;
        else if (line[i] === ')') depth--;
    }
    return Math.max(0, depth);
}

/**
 * Heuristic: check if a comment prefix occurrence is likely inside a string.
 * Counts unmatched single and double quotes before the position.
 */
function isLikelyInsideString(textBefore: string, _prefix: string): boolean {
    let inDouble = false;
    let inSingle = false;
    let i        = 0;

    while (i < textBefore.length) {
        const ch = textBefore[i];
        if (ch === '\\' && (inDouble || inSingle)) {
            i += 2;
            continue;
        }
        if (ch === '"' && !inSingle) inDouble      = !inDouble;
        else if (ch === "'" && !inDouble) inSingle = !inSingle;
        i++;
    }

    return inDouble || inSingle;
}
