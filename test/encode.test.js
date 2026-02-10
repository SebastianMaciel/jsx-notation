import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { encode, encodeFile } from '../src/index.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const fixture = (name) => readFileSync(join(__dirname, 'fixtures', name), 'utf-8');

// ---------------------------------------------------------------------------
// Phase 1: Basic encoding
// ---------------------------------------------------------------------------

describe('basic encoding', () => {
  it('encodes elements with className as dot notation', () => {
    const result = encode('<div className="foo">x</div>');
    expect(result).toContain('.foo');
  });

  it('encodes multiple classes as chained dots', () => {
    const result = encode('<p className="intro description">Hi</p>');
    expect(result).toContain('p.intro.description');
  });

  it('encodes id as hash notation', () => {
    const result = encode('<div id="main">x</div>');
    expect(result).toContain('#main');
  });

  it('encodes id + className together', () => {
    const result = encode('<div id="x" className="y">z</div>');
    expect(result).toContain('#x.y');
  });

  it('encodes text children inline', () => {
    const result = encode('<span>Hello World</span>');
    expect(result).toContain('span "Hello World"');
  });

  it('encodes expression children inline', () => {
    const result = encode('<h2>{title}</h2>');
    expect(result).toContain('h2 (title)');
  });

  it('encodes self-closing elements', () => {
    const result = encode('<input type="email" />');
    expect(result).toContain('input {type:email}');
    expect(result).not.toContain('\n');
  });

  it('encodes string props', () => {
    const result = encode('<img src="logo.png" alt="Logo" />');
    expect(result).toContain('{src:logo.png, alt:Logo}');
  });

  it('encodes expression props', () => {
    const result = encode('<img src={logoUrl} />');
    expect(result).toContain('{src:logoUrl}');
  });

  it('encodes nested elements with indentation', () => {
    const result = encode(`
      <div className="outer">
        <div className="inner">
          <span>Hello</span>
        </div>
      </div>
    `);
    const lines = result.split('\n');
    expect(lines[0]).toBe('.outer');
    expect(lines[1]).toBe(' .inner');
    expect(lines[2]).toBe('  span "Hello"');
  });

  it('encodes the basic fixture', () => {
    const result = encode(fixture('basic.jsx'));
    expect(result).toContain('.container');
    expect(result).toContain('h1#title "Hello World"');
    expect(result).toContain('p.intro.description "Welcome to JSXN"');
    expect(result).toContain('span (message)');
    expect(result).toContain('input {type:email, placeholder:Enter email}');
    expect(result).toContain('img {src:logoUrl, alt:Logo}');
  });
});

// ---------------------------------------------------------------------------
// Phase 2: Aliases
// ---------------------------------------------------------------------------

describe('aliases', () => {
  it('generates @C header for frequent components', () => {
    const result = encode(fixture('aliases.jsx'));
    expect(result).toMatch(/^@C /m);
    expect(result).toContain('Button=B');
    expect(result).toContain('Modal=M');
    expect(result).toContain('Input=I');
  });

  it('generates @P header for frequent props', () => {
    const result = encode(fixture('aliases.jsx'));
    expect(result).toMatch(/^@P /m);
    expect(result).toContain('onClick=');
    expect(result).toContain('onChange=');
    expect(result).toContain('onClose=');
    expect(result).toContain('isOpen=');
    expect(result).toContain('placeholder=');
  });

  it('uses component aliases in the body', () => {
    const result = encode(fixture('aliases.jsx'));
    const bodyLines = result.split('\n').filter((l) => !l.startsWith('@') && l.trim());
    // Button should appear as B (alias)
    const buttonLines = bodyLines.filter((l) => l.trim().startsWith('B ') || l.trim() === 'B');
    expect(buttonLines.length).toBeGreaterThan(0);
  });

  it('uses prop aliases in the body', () => {
    const result = encode(fixture('aliases.jsx'));
    // onClick should be aliased to something short
    const pHeader = result.split('\n').find((l) => l.startsWith('@P'));
    const onClickAlias = pHeader.match(/onClick=(\w+)/)?.[1];
    expect(onClickAlias).toBeTruthy();
    // The alias should appear in prop blocks
    expect(result).toContain(`{${onClickAlias}:`);
  });

  it('does not alias props with <= 4 chars', () => {
    const result = encode('<div><X key="a" /><X key="b" /></div>');
    // "key" is 3 chars — should NOT be aliased
    expect(result).not.toMatch(/^@P.*key=/m);
  });
});

// ---------------------------------------------------------------------------
// Phase 3: Special patterns
// ---------------------------------------------------------------------------

describe('conditionals', () => {
  it('encodes && conditional', () => {
    const result = encode(fixture('conditionals.jsx'));
    // Spinner gets aliased to S
    expect(result).toMatch(/\?isLoading > S/);
  });

  it('encodes && conditional with children', () => {
    const result = encode(fixture('conditionals.jsx'));
    // Alert gets aliased to A
    expect(result).toMatch(/\?error > A/);
  });

  it('encodes ternary conditional', () => {
    const result = encode(fixture('conditionals.jsx'));
    // Dashboard=D, Login=L
    expect(result).toMatch(/\?isLoggedIn > D \| L/);
  });

  it('encodes && conditional without aliases on inline code', () => {
    const result = encode('<div>{show && <Visible />}</div>');
    expect(result).toMatch(/\?show > /);
  });

  it('encodes ternary without aliases on inline code', () => {
    const result = encode('<div>{ok ? <Yes /> : <No />}</div>');
    expect(result).toMatch(/\?ok > /);
    expect(result).toContain('|');
  });
});

describe('maps', () => {
  it('encodes .map() as *collection > element', () => {
    const result = encode(fixture('maps.jsx'));
    expect(result).toMatch(/\*items > li\.item/);
  });
});

describe('fragments', () => {
  it('encodes fragment as _', () => {
    const result = encode(fixture('fragments.jsx'));
    expect(result).toContain('_');
    // Components get aliased: Header=H, Main=M, Footer=F
    expect(result).toMatch(/@C.*Header=H/);
    expect(result).toContain(' H');
    expect(result).toContain(' M');
    expect(result).toContain(' F');
  });
});

// ---------------------------------------------------------------------------
// Phase 4: Edge cases
// ---------------------------------------------------------------------------

describe('edge cases', () => {
  it('encodes spread props', () => {
    const result = encode('<Comp {...props} />');
    expect(result).toContain('{...props}');
  });

  it('encodes namespace/member components', () => {
    const result = encode('<Form.Input name="x" />');
    expect(result).toContain('Form.Input');
  });

  it('encodes computed className', () => {
    const result = encode('<div className={cn("a", "b")}>x</div>');
    expect(result).toMatch(/\.\{cn\("a", "b"\)\}/);
  });

  it('encodes boolean props', () => {
    const result = encode('<Button disabled>Click</Button>');
    expect(result).toContain('{disabled}');
  });

  it('returns non-JSX code as-is', () => {
    const code = 'const x = 1 + 2;\nconsole.log(x);';
    expect(encode(code)).toBe(code);
  });

  it('encodes the edge-cases fixture', () => {
    const result = encode(fixture('edge-cases.jsx'));
    expect(result).toContain('{...props');
    expect(result).toContain('Form.Input');
    expect(result).toContain('{disabled}');
  });
});

// ---------------------------------------------------------------------------
// Tailwind / class aliases (@S)
// ---------------------------------------------------------------------------

describe('class aliases (@S)', () => {
  it('generates @S header for repeated Tailwind classes', () => {
    const result = encode(fixture('tailwind.jsx'));
    expect(result).toMatch(/^@S /m);
  });

  it('aliases classes appearing >= 2 times with length > 3', () => {
    const result = encode(fixture('tailwind.jsx'));
    // "flex" appears 5x and length is 4 → should be aliased
    expect(result).toMatch(/@S.*flex=f/);
    // "items-center" appears 4x → should be aliased
    expect(result).toMatch(/@S.*items-center=ic/);
    // "font-medium" appears 5x → should be aliased
    expect(result).toMatch(/@S.*font-medium=fm/);
  });

  it('uses class aliases in the body', () => {
    const result = encode(fixture('tailwind.jsx'));
    // "flex" → "f", so we should see .f instead of .flex
    const body = result.split('\n\n').slice(-1)[0];
    expect(body).toContain('.f.');
    // Should NOT contain .flex. (original) in the body since it's aliased
    expect(body).not.toMatch(/\.flex\./);
  });

  it('does not alias classes with <= 3 chars', () => {
    // Classes like "p-6" (3 chars) should NOT be aliased
    const code = '<div><p className="p-6">a</p><p className="p-6">b</p></div>';
    const result = encode(code);
    expect(result).not.toMatch(/@S/);
  });

  it('does not alias classes appearing only once', () => {
    const code = '<div className="unique-class-name">x</div>';
    const result = encode(code);
    expect(result).not.toMatch(/@S/);
    expect(result).toContain('.unique-class-name');
  });

  it('improves compression ratio on Tailwind-heavy code', () => {
    const code = fixture('tailwind.jsx');
    const result = encode(code);
    const ratio = 1 - result.length / code.length;
    // Should compress at least 40% on Tailwind-heavy code
    expect(ratio).toBeGreaterThan(0.40);
  });
});

// ---------------------------------------------------------------------------
// SPEC.md full example
// ---------------------------------------------------------------------------

describe('SPEC.md example', () => {
  it('matches the expected output from the spec', () => {
    const result = encode(fixture('spec-example.jsx'));

    // Should have alias headers
    expect(result).toMatch(/@C.*Modal=M/);
    expect(result).toMatch(/@C.*Button=B/);

    // Body should contain the key patterns
    expect(result).toContain('M {');
    expect(result).toContain('.modal-body');
    expect(result).toContain('h2 (title)');
    expect(result).toMatch(/\?error > /);
    expect(result).toContain('ul.item-list');
    expect(result).toMatch(/\*items > li\.item/);
    expect(result).toContain('B {');
    expect(result).toContain('"Confirmar"');
  });
});

// ---------------------------------------------------------------------------
// Full file encoding (encodeFile)
// ---------------------------------------------------------------------------

describe('full file encoding', () => {
  it('encodes a full Next.js page with imports, types, hooks, logic, and JSX', () => {
    const result = encodeFile(fixture('full-file.tsx'));

    // Imports compressed
    expect(result).toMatch(/^@I react: /m);
    expect(result).toContain('useState');
    expect(result).toContain('useEffect');
    expect(result).toMatch(/@I @\/components\/ui\/button: Button/);
    expect(result).toMatch(/@I next\/link: default Link/);

    // Type imports
    expect(result).toMatch(/@T @\/types: Product, Category/);

    // Interface compressed (no "interface" keyword)
    expect(result).toMatch(/^ProductListProps \{/m);

    // Hooks
    expect(result).toMatch(/@state products = initialProducts/);
    expect(result).toMatch(/@state search = ""/);
    expect(result).toMatch(/@state isLoading = false/);
    expect(result).toMatch(/@ref formRef = null/);

    // Other hooks kept with name = useX(...)
    expect(result).toMatch(/router = useRouter\(\)/);

    // Logic kept (const stripped)
    expect(result).toMatch(/filteredProducts = useMemo/);
    expect(result).toMatch(/handleDelete = useCallback/);

    // useEffect kept as bare call
    expect(result).toMatch(/useEffect\(/);

    // --- separator before JSX
    expect(result).toContain('---');

    // JSX body present (flex is aliased to f)
    expect(result).toMatch(/\.\w+\.\w+\.gap-6\.p-6/);
  });

  it('encodes a file with only imports and JSX (no hooks)', () => {
    const code = `import { Button } from "./button"
import { Card } from "./card"

export default function Page() {
  return (
    <div className="container">
      <h1>Hello</h1>
      <Button>Click</Button>
      <Card>Content</Card>
    </div>
  )
}`;
    const result = encodeFile(code);
    expect(result).toMatch(/@I \.\/button: Button/);
    expect(result).toMatch(/@I \.\/card: Card/);
    expect(result).toContain('---');
    expect(result).toContain('.container');
    expect(result).toContain('h1 "Hello"');
  });

  it('compresses non-JSX files (imports, types, const)', () => {
    const code = `import { createClient } from "@/lib/supabase/server"\nimport { redirect } from "next/navigation"\n\nexport type ContactInput = {\n  type: string\n  value: string\n}\n\nexport async function saveContacts(contacts: ContactInput[]) {\n  const supabase = await createClient()\n  redirect("/done")\n}`;
    const result = encodeFile(code);
    expect(result).toMatch(/@I @\/lib\/supabase\/server: createClient/);
    expect(result).toMatch(/@I next\/navigation: redirect/);
    expect(result).toMatch(/^export ContactInput = \{/m);
    expect(result).not.toMatch(/^import /m);
  });

  it('strips const/let at top level in non-JSX files', () => {
    const code = `const x = 1 + 2;\nconsole.log(x);`;
    const result = encodeFile(code);
    expect(result).toMatch(/^x = 1 \+ 2/m);
  });

  it('compresses default imports', () => {
    const code = `import Link from "next/link"\nexport default function A() { return <Link href="/">Home</Link> }`;
    const result = encodeFile(code);
    expect(result).toMatch(/@I next\/link: default Link/);
  });

  it('compresses side-effect imports', () => {
    const code = `import "./globals.css"\nexport default function A() { return <div>Hi</div> }`;
    const result = encodeFile(code);
    expect(result).toMatch(/@I "\.\/globals\.css"/);
  });

  it('compresses type imports', () => {
    const code = `import type { User } from "./types"\nexport default function A() { return <div>Hi</div> }`;
    const result = encodeFile(code);
    expect(result).toMatch(/@T \.\/types: User/);
  });

  it('compresses namespace imports', () => {
    const code = `import * as React from "react"\nexport default function A() { return <div>Hi</div> }`;
    const result = encodeFile(code);
    expect(result).toMatch(/@I react: \* as React/);
  });

  it('compresses default + named imports', () => {
    const code = `import React, { useState } from "react"\nexport default function A() { return <div>Hi</div> }`;
    const result = encodeFile(code);
    expect(result).toMatch(/@I react: default React, useState/);
  });

  it('compresses useState hook', () => {
    const code = `export default function A() {
  const [count, setCount] = useState(0)
  return <div>{count}</div>
}`;
    const result = encodeFile(code);
    expect(result).toMatch(/@state count = 0/);
  });

  it('compresses useRef hook', () => {
    const code = `export default function A() {
  const inputRef = useRef(null)
  return <input ref={inputRef} />
}`;
    const result = encodeFile(code);
    expect(result).toMatch(/@ref inputRef = null/);
  });

  it('preserves "use client" directive', () => {
    const code = `"use client"\nexport default function A() { return <div>Hi</div> }`;
    const result = encodeFile(code);
    expect(result).toMatch(/^"use client"/);
  });

  it('compresses TypeScript interfaces', () => {
    const code = `interface Props { name: string; age: number }\nexport default function A({ name }: Props) { return <div>{name}</div> }`;
    const result = encodeFile(code);
    expect(result).toMatch(/^Props \{/m);
    expect(result).not.toMatch(/^interface /m);
  });

  it('handles arrow function components', () => {
    const code = `const Page = () => {
  const [x, setX] = useState(0)
  return <div>{x}</div>
}`;
    const result = encodeFile(code);
    expect(result).toMatch(/Page\(\)/);
    expect(result).toMatch(/@state x = 0/);
    expect(result).toContain('---');
  });

  it('strips const/let from logic lines', () => {
    const code = `export default function A() {
  const data = fetchData()
  let count = data.length
  return <div>{count}</div>
}`;
    const result = encodeFile(code);
    expect(result).toMatch(/^\s+data = fetchData\(\)/m);
    expect(result).toMatch(/^\s+count = data\.length/m);
  });
});
