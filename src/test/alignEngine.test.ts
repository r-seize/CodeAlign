import * as assert from 'assert';
import {
    findSeparatorIndex,
    alignBySeparator,
    alignComments,
    detectBestSeparator,
    alignMultiColumn,
} from '../aligner/alignEngine';

// ---------------------------------------------------------------------------
// findSeparatorIndex
// ---------------------------------------------------------------------------

describe('findSeparatorIndex', () => {
    it('finds simple =', () => {
        assert.strictEqual(findSeparatorIndex('name = "Alice"', '='), 5);
    });

    it('skips => when looking for =', () => {
        assert.strictEqual(findSeparatorIndex('fn = () => 42', '='), 3);
    });

    it('skips != when looking for =', () => {
        assert.strictEqual(findSeparatorIndex('if a != b', '='), -1);
    });

    it('skips == when looking for =', () => {
        assert.strictEqual(findSeparatorIndex('if a == b', '='), -1);
    });

    it('skips := when looking for :', () => {
        assert.strictEqual(findSeparatorIndex('x := 10', ':'), -1);
    });

    it('finds : in YAML', () => {
        assert.strictEqual(findSeparatorIndex('name: Alice', ':'), 4);
    });

    it('skips :: when looking for :', () => {
        assert.strictEqual(findSeparatorIndex('std::string', ':'), -1);
    });

    it('finds | in table row', () => {
        assert.strictEqual(findSeparatorIndex('| name | value |', '|'), 0);
    });

    it('skips || when looking for |', () => {
        assert.strictEqual(findSeparatorIndex('if a || b', '|'), -1);
    });

    it('finds => correctly', () => {
        assert.strictEqual(findSeparatorIndex('key => value', '=>'), 4);
    });

    it('finds -> correctly', () => {
        assert.strictEqual(findSeparatorIndex('key -> value', '->'), 4);
    });
});

// ---------------------------------------------------------------------------
// alignBySeparator
// ---------------------------------------------------------------------------

describe('alignBySeparator - =', () => {
    it('aligns variable assignments', () => {
        const input = [
            'name = "Alice"',
            'age = 30',
            'city = "NYC"',
        ];
        const result = alignBySeparator(input, '=');
        assert.strictEqual(result[0], 'name = "Alice"');
        assert.strictEqual(result[1], 'age  = 30');
        assert.strictEqual(result[2], 'city = "NYC"');
    });

    it('leaves lines without separator untouched', () => {
        const input  = ['x = 1', '// comment', 'y = 2'];
        const result = alignBySeparator(input, '=');
        assert.strictEqual(result[1], '// comment');
    });

    it('returns original if fewer than 2 lines have separator', () => {
        const input  = ['x = 1', 'plain text'];
        const result = alignBySeparator(input, '=');
        assert.deepStrictEqual(result, input);
    });

    it('aligns only consecutive groups - isolated lines are untouched', () => {
        const input = [
            'x = 1',           // isolated (group of 1 → not aligned)
            '',                // separator
            'name = "Alice"',  // group of 3
            'age = 30',
            'city = "NYC"',
            '',                // separator
            'z = 99',          // isolated (group of 1 → not aligned)
        ];
        const result = alignBySeparator(input, '=');
        // isolated lines unchanged
        assert.strictEqual(result[0], 'x = 1');
        assert.strictEqual(result[6], 'z = 99');
        // group of 3 aligned together
        assert.strictEqual(result[2], 'name = "Alice"');
        assert.strictEqual(result[3], 'age  = 30');
        assert.strictEqual(result[4], 'city = "NYC"');
    });

    it('does not group lines with different indentation', () => {
        const input = [
            'x = 1',         // indent 0
            '    y = 2',     // indent 4 - different indent → separate group
            '    z = 3',     // indent 4 - same as previous → own group of 2
        ];
        const result = alignBySeparator(input, '=');
        // line 0 is isolated (indent 0, no neighbour at same indent) → unchanged
        assert.strictEqual(result[0], 'x = 1');
        // lines 1-2 share indent 4 → aligned together
        const col1 = result[1].indexOf('=');
        const col2 = result[2].indexOf('=');
        assert.strictEqual(col1, col2, 'indented lines should be aligned');
    });

    it('aligns two separate groups independently', () => {
        const input = [
            'a = 1',                  // group 1 (short names)
            'bb = 2',
            '',
            'longName = "hello"',     // group 2 (long name)
            'x = "world"',
        ];
        const result = alignBySeparator(input, '=');
        // group 1: max before = 'bb' (2 chars), 'a' gets 1 extra space
        assert.ok(result[0].startsWith('a  ='), `got: ${result[0]}`);
        assert.ok(result[1].startsWith('bb ='), `got: ${result[1]}`);
        // group 2: max before = 'longName' (8 chars), 'x' gets 7 extra spaces
        const col2 = result[3].indexOf('=');
        const col3 = result[4].indexOf('=');
        assert.strictEqual(col2, col3, 'group 2 columns should match');
    });

    it('respects minSpacesBefore option', () => {
        const input  = ['a = 1', 'bb = 2'];
        const result = alignBySeparator(input, '=', { minSpacesBefore: 2 });
        // 'bb' (longest, 2 chars) gets exactly minSpacesBefore=2 spaces → 'bb  ='
        // 'a'  (1 char) gets 2+(2-1)=3 spaces to align           → 'a   ='
        assert.ok(result[0].startsWith('a   ='), `got: ${result[0]}`);
        assert.ok(result[1].startsWith('bb  ='), `got: ${result[1]}`);
    });
});

it('ignores = inside string literals', () => {
    // The '=' inside '=' string must not be treated as a separator
    const input = [
        "const next = line[idx + 1];",
        "if (next === '-' || next === '=' || next === '<') {",
    ];
    const result = alignBySeparator(input, '=');
    // line 1 has no valid = (all inside () or ===), so no group of 2 → unchanged
    assert.deepStrictEqual(result, input);
});

it('ignores = inside parentheses (for-loop initialisers)', () => {
    const input = [
        'let depth = 0;',
        'for (let i = 0; i < idx; i++) {',
    ];
    const result = alignBySeparator(input, '=');
    // 'let depth = 0' has = at top level (depth 0)
    // 'for (let i = 0; ...)' has = inside () → not valid → group of 1 → unchanged
    assert.deepStrictEqual(result, input);
});

describe('alignBySeparator - :', () => {
    it('aligns YAML-style key-values', () => {
        const input = [
            'name: Alice',
            'username: admin',
            'password: secret',
        ];
        const result = alignBySeparator(input, ':');
        // 'username'/'password' = 8 chars (max), 'name' = 4 chars → 8-4+1 = 5 spaces
        assert.ok(result[0].includes('name     :'), `got: ${result[0]}`);
        assert.ok(result[1].includes('username :'), `got: ${result[1]}`);
        assert.ok(result[2].includes('password :'), `got: ${result[2]}`);
    });
});

describe('alignBySeparator - =>', () => {
    it('aligns fat arrows', () => {
        const input = [
            'key => value',
            'longkey => other',
        ];
        const result = alignBySeparator(input, '=>');
        // both => should be at the same column
        const col0 = result[0].indexOf('=>');
        const col1 = result[1].indexOf('=>');
        assert.strictEqual(col0, col1);
    });
});

describe('alignBySeparator - |', () => {
    it('aligns pipe separators in table', () => {
        const input = [
            'Alice | 30 | NYC',
            'Bob | 25 | LA',
        ];
        const result = alignBySeparator(input, '|');
        const col0   = result[0].indexOf('|');
        const col1   = result[1].indexOf('|');
        assert.strictEqual(col0, col1);
    });
});

// ---------------------------------------------------------------------------
// alignComments
// ---------------------------------------------------------------------------

describe('alignComments', () => {
    it('aligns // inline comments', () => {
        const input = [
            'let x = 1; // first',
            'let longName = 2; // second',
            'let y = 3; // third',
        ];
        const result = alignComments(input, ['//']);
        const col0   = result[0].indexOf('//');
        const col1   = result[1].indexOf('//');
        const col2   = result[2].indexOf('//');
        assert.strictEqual(col0, col1);
        assert.strictEqual(col1, col2);
    });

    it('aligns # inline comments', () => {
        const input = [
            'name = "Alice" # who',
            'age = 30 # years',
        ];
        const result = alignComments(input, ['#']);
        const col0   = result[0].indexOf('#');
        const col1   = result[1].indexOf('#');
        assert.strictEqual(col0, col1);
    });

    it('skips full-line comments', () => {
        const input = [
            '# full line comment',
            'x = 1 # inline',
            'y = 2 # inline',
        ];
        const result = alignComments(input, ['#']);
        assert.strictEqual(result[0], '# full line comment');
    });

    it('returns original when fewer than 2 inline comments', () => {
        const input  = ['x = 1 // only one', 'plain line'];
        const result = alignComments(input, ['//']);
        assert.deepStrictEqual(result, input);
    });

    it('does not match comment prefix inside a string', () => {
        const input = [
            'let s = "hello // world"; // real',
            'let t = 1; // real',
        ];
        const result = alignComments(input, ['//']);
        // The comment in line 0 should be the one AFTER the string
        assert.ok(result[0].indexOf('// real') > result[0].indexOf('"hello'));
    });
});

// ---------------------------------------------------------------------------
// detectBestSeparator
// ---------------------------------------------------------------------------

describe('detectBestSeparator', () => {
    it('detects = in assignments', () => {
        const lines = ['a = 1', 'b = 2', 'c = 3'];
        assert.strictEqual(detectBestSeparator(lines, ['=', ':', '|']), '=');
    });

    it('detects : in YAML', () => {
        const lines = ['name: Alice', 'age: 30', 'city: NYC'];
        assert.strictEqual(detectBestSeparator(lines, ['=', ':', '|']), ':');
    });

    it('prefers multi-char operator when equally frequent', () => {
        const lines = [
            'key => val',
            'other => stuff',
        ];
        // Both => and = would match, but => is longer and should win
        const sep = detectBestSeparator(lines, ['=>', '=']);
        assert.strictEqual(sep, '=>');
    });

    it('returns null when no separator found', () => {
        const lines = ['plain text', 'no separator here'];
        assert.strictEqual(detectBestSeparator(lines, ['=', ':'], 1.0), null);
    });
});

// ---------------------------------------------------------------------------
// alignMultiColumn
// ---------------------------------------------------------------------------

describe('alignMultiColumn', () => {
    it('aligns separator then comments', () => {
        const input = [
            'name : value # comment',
            'username : admin # login',
            'password : secret123 # auth',
        ];
        const result = alignMultiColumn(input, ':', ['#']);

        // All : should be at same column
        const colonCols = result.map(l => l.indexOf(':'));
        assert.ok(colonCols.every(c => c === colonCols[0]));

        // All # should be at same column
        const hashCols = result.map(l => l.indexOf('#'));
        assert.ok(hashCols.every(c => c === hashCols[0]));
    });
});
