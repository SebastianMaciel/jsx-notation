import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { decode, decodeFile, encode, encodeFile } from '../src/index.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const fixture = (name) => readFileSync(join(__dirname, 'fixtures', name), 'utf-8');

// ---------------------------------------------------------------------------
// Snippet decoder: basic elements
// ---------------------------------------------------------------------------

describe('decode: basic elements', () => {
  it('decodes an element with className', () => {
    const result = decode('.foo');
    expect(result).toContain('<div className="foo"');
    expect(result).toContain('/>');
  });

  it('decodes multiple classes', () => {
    const result = decode('p.intro.description "Welcome"');
    expect(result).toContain('className="intro description"');
    expect(result).toContain('<p');
    expect(result).toContain('Welcome');
  });

  it('decodes id as hash notation', () => {
    const result = decode('div#main');
    expect(result).toContain('id="main"');
  });

  it('decodes implicit div (dot-only selector)', () => {
    const result = decode('.container');
    expect(result).toContain('<div className="container"');
  });

  it('decodes id + className together', () => {
    const result = decode('#x.y');
    expect(result).toContain('id="x"');
    expect(result).toContain('className="y"');
    expect(result).toContain('<div');
  });

  it('decodes text children inline', () => {
    const result = decode('span "Hello World"');
    expect(result).toContain('<span>Hello World</span>');
  });

  it('decodes expression children inline', () => {
    const result = decode('h2 (title)');
    expect(result).toContain('<h2>{title}</h2>');
  });

  it('decodes self-closing elements', () => {
    const result = decode('input {type:email, placeholder:Enter email}');
    expect(result).toContain('<input');
    expect(result).toContain('type="email"');
    expect(result).toContain('placeholder="Enter email"');
    expect(result).toContain('/>');
  });

  it('decodes string props', () => {
    const result = decode('img {src:logo.png, alt:Logo}');
    expect(result).toContain('src="logo.png"');
    expect(result).toContain('alt="Logo"');
  });

  it('decodes expression props', () => {
    const result = decode('img {src:logoUrl}');
    expect(result).toContain('src={logoUrl}');
  });

  it('decodes boolean props', () => {
    const result = decode('Button {disabled} "Click"');
    expect(result).toContain('disabled');
    expect(result).toContain('Click');
  });

  it('decodes spread props', () => {
    const result = decode('Comp {...props}');
    expect(result).toContain('{...props}');
  });

  it('decodes member expression components', () => {
    const result = decode('Form.Input {name:field}');
    expect(result).toContain('<Form.Input');
    expect(result).toContain('name="field"');
  });

  it('decodes computed className', () => {
    const result = decode('.{cn("a", "b")} "text"');
    expect(result).toContain('className={cn("a", "b")}');
  });

  it('decodes dynamic id', () => {
    const result = decode('div#{myId}');
    expect(result).toContain('id={myId}');
  });
});

// ---------------------------------------------------------------------------
// Snippet decoder: nesting
// ---------------------------------------------------------------------------

describe('decode: nesting', () => {
  it('decodes nested elements with indentation', () => {
    const jsxn = `.outer
 .inner
  span "Hello"`;
    const result = decode(jsxn);
    expect(result).toContain('<div className="outer">');
    expect(result).toContain('<div className="inner">');
    expect(result).toContain('<span>Hello</span>');
    expect(result).toContain('</div>');
  });

  it('decodes the basic fixture round-trip', () => {
    const jsxn = `.container
 h1#title "Hello World"
 p.intro.description "Welcome to JSXN"
 span (message)
 input {type:email, placeholder:Enter email}
 img {src:logoUrl, alt:Logo}`;
    const result = decode(jsxn);
    expect(result).toContain('<div className="container">');
    expect(result).toContain('<h1 id="title">Hello World</h1>');
    expect(result).toContain('<p className="intro description">Welcome to JSXN</p>');
    expect(result).toContain('<span>{message}</span>');
    expect(result).toContain('<input');
    expect(result).toContain('<img');
  });

  it('handles deep nesting (3+ levels)', () => {
    const jsxn = `.a
 .b
  .c
   span "deep"`;
    const result = decode(jsxn);
    expect(result).toContain('className="a"');
    expect(result).toContain('className="b"');
    expect(result).toContain('className="c"');
    expect(result).toContain('deep');
  });
});

// ---------------------------------------------------------------------------
// Snippet decoder: aliases
// ---------------------------------------------------------------------------

describe('decode: aliases', () => {
  it('resolves component aliases', () => {
    const jsxn = `@C Button=B, Modal=M

B "Click"
M`;
    const result = decode(jsxn);
    expect(result).toContain('<Button>Click</Button>');
    expect(result).toContain('<Modal />');
  });

  it('resolves prop aliases', () => {
    const jsxn = `@P onClick=k

Button {k:handleClick} "Click"`;
    const result = decode(jsxn);
    expect(result).toContain('onClick={handleClick}');
  });

  it('resolves class aliases', () => {
    const jsxn = `@S items-center=ic, flex=f

.f.ic`;
    const result = decode(jsxn);
    expect(result).toContain('className="flex items-center"');
  });

  it('resolves all alias types together', () => {
    const jsxn = `@C Button=B
@P onClick=k
@S font-bold=fb

B.fb {k:go} "Go"`;
    const result = decode(jsxn);
    expect(result).toContain('<Button');
    expect(result).toContain('className="font-bold"');
    expect(result).toContain('onClick={go}');
    expect(result).toContain('Go');
  });
});

// ---------------------------------------------------------------------------
// Snippet decoder: special patterns
// ---------------------------------------------------------------------------

describe('decode: conditionals', () => {
  it('decodes && conditional', () => {
    const jsxn = '?isLoading > Spinner';
    const result = decode(jsxn);
    expect(result).toContain('isLoading');
    expect(result).toContain('&&');
    expect(result).toContain('<Spinner');
  });

  it('decodes && conditional with props and children', () => {
    const jsxn = '?error > Alert {type:error} (error)';
    const result = decode(jsxn);
    expect(result).toContain('error');
    expect(result).toContain('&&');
    expect(result).toContain('<Alert');
    expect(result).toContain('type="error"');
  });

  it('decodes ternary conditional', () => {
    const jsxn = '?isLoggedIn > Dashboard | Login';
    const result = decode(jsxn);
    expect(result).toContain('isLoggedIn');
    expect(result).toContain('?');
    expect(result).toContain(':');
    expect(result).toContain('<Dashboard');
    expect(result).toContain('<Login');
  });
});

describe('decode: maps', () => {
  it('decodes map expression', () => {
    const jsxn = '*items > li.item {key:item.id}';
    const result = decode(jsxn);
    expect(result).toContain('items.map');
    expect(result).toContain('<li');
    expect(result).toContain('className="item"');
    expect(result).toContain('key={item.id}');
  });

  it('singularizes collection name for callback param', () => {
    const jsxn = '*users > UserCard';
    const result = decode(jsxn);
    expect(result).toContain('users.map(user');
  });

  it('singularizes -ies to -y', () => {
    const jsxn = '*categories > CategoryItem';
    const result = decode(jsxn);
    expect(result).toContain('categories.map(category');
  });

  it('handles dotted collection paths', () => {
    const jsxn = '*data.items > Item';
    const result = decode(jsxn);
    expect(result).toContain('data.items.map(item');
  });

  it('decodes map with continuation children', () => {
    const jsxn = `*items > li.item {key:item.id}
  (item.name)`;
    const result = decode(jsxn);
    expect(result).toContain('items.map');
    expect(result).toContain('{item.name}');
  });
});

describe('decode: fragments', () => {
  it('decodes fragment as _', () => {
    const jsxn = `_
 Header
 Main
 Footer`;
    const result = decode(jsxn);
    expect(result).toContain('<>');
    expect(result).toContain('</>');
    expect(result).toContain('<Header');
    expect(result).toContain('<Main');
    expect(result).toContain('<Footer');
  });
});

describe('decode: text and expressions', () => {
  it('decodes text node', () => {
    const result = decode('"Hello World"');
    expect(result).toContain('Hello World');
  });

  it('decodes expression node', () => {
    const result = decode('(count + 1)');
    expect(result).toContain('{count + 1}');
  });
});

// ---------------------------------------------------------------------------
// File decoder
// ---------------------------------------------------------------------------

describe('decodeFile: imports', () => {
  it('decodes regular import with named specifiers', () => {
    const result = decodeFile('@I react: useState, useEffect');
    expect(result).toBe('import { useState, useEffect } from "react"');
  });

  it('decodes default import', () => {
    const result = decodeFile('@I next/link: default Link');
    expect(result).toBe('import Link from "next/link"');
  });

  it('decodes default + named imports', () => {
    const result = decodeFile('@I react: default React, useState');
    expect(result).toBe('import React, { useState } from "react"');
  });

  it('decodes side-effect import', () => {
    const result = decodeFile('@I "styles.css"');
    expect(result).toBe('import "styles.css"');
  });

  it('decodes namespace import', () => {
    const result = decodeFile('@I react: * as React');
    expect(result).toBe('import * as React from "react"');
  });

  it('decodes type import', () => {
    const result = decodeFile('@T @/types: Product, Category');
    expect(result).toBe('import type { Product, Category } from "@/types"');
  });
});

describe('decodeFile: types', () => {
  it('decodes interface (single line)', () => {
    const result = decodeFile('Props { name: string; age: number }');
    expect(result).toContain('interface Props { name: string; age: number }');
  });

  it('decodes multi-line interface', () => {
    const jsxn = `Props {
  name: string
  age: number
}`;
    const result = decodeFile(jsxn);
    expect(result).toContain('interface Props {');
    expect(result).toContain('name: string');
    expect(result).toContain('}');
  });

  it('decodes type alias', () => {
    const result = decodeFile('Status = "active" | "inactive"');
    expect(result).toContain('type Status = "active" | "inactive"');
  });

  it('decodes exported type alias', () => {
    const result = decodeFile('export ContactInput = { type: string }');
    expect(result).toContain('export type ContactInput = { type: string }');
  });
});

describe('decodeFile: function blocks', () => {
  it('decodes function with hooks and JSX', () => {
    const jsxn = `export default ProductList({ initialProducts })
  @state products = initialProducts
  @state search = ""
  @ref formRef = null
  ---
  .container
   h1 "Products"`;
    const result = decodeFile(jsxn);
    expect(result).toContain('export default function ProductList');
    expect(result).toContain('const [products, setProducts] = useState(initialProducts)');
    expect(result).toContain('const [search, setSearch] = useState("")');
    expect(result).toContain('const formRef = useRef(null)');
    expect(result).toContain('return (');
    expect(result).toContain('<div className="container">');
    expect(result).toContain('<h1>Products</h1>');
  });

  it('decodes function with other hooks', () => {
    const jsxn = `Page()
  router = useRouter()
  ---
  div "Hello"`;
    const result = decodeFile(jsxn);
    expect(result).toContain('function Page()');
    expect(result).toContain('const router = useRouter()');
    expect(result).toContain('return (');
  });

  it('decodes function with logic (const restored)', () => {
    const jsxn = `Page()
  data = fetchData()
  ---
  div (data)`;
    const result = decodeFile(jsxn);
    expect(result).toContain('const data = fetchData()');
  });

  it('preserves let/var in logic lines', () => {
    const jsxn = `Page()
  let count = 0
  ---
  div (count)`;
    const result = decodeFile(jsxn);
    expect(result).toContain('let count = 0');
    expect(result).not.toContain('const let');
  });

  it('decodes bare hook calls', () => {
    const jsxn = `Page()
  useEffect(() => { fetch(); }, [])
  ---
  div "ok"`;
    const result = decodeFile(jsxn);
    expect(result).toContain('useEffect');
  });

  it('decodes "use client" directive', () => {
    const jsxn = `"use client"
@I react: useState
Page()
  @state x = 0
  ---
  div (x)`;
    const result = decodeFile(jsxn);
    expect(result).toMatch(/^"use client"/);
    expect(result).toContain('import { useState } from "react"');
  });
});

// ---------------------------------------------------------------------------
// Round-trip tests (encode → decode → valid JSX structure)
// ---------------------------------------------------------------------------

describe('round-trip: encode → decode', () => {
  it('round-trips basic fixture snippet', () => {
    const original = fixture('basic.jsx');
    const encoded = encode(original);
    const decoded = decode(encoded);

    // Should contain the key elements
    expect(decoded).toContain('className="container"');
    expect(decoded).toContain('id="title"');
    expect(decoded).toContain('Hello World');
    expect(decoded).toContain('Welcome to JSXN');
    expect(decoded).toContain('{message}');
    expect(decoded).toContain('type="email"');
    expect(decoded).toContain('placeholder="Enter email"');
  });

  it('round-trips conditionals fixture snippet', () => {
    const original = fixture('conditionals.jsx');
    const encoded = encode(original);
    const decoded = decode(encoded);

    expect(decoded).toContain('isLoading');
    expect(decoded).toContain('Spinner');
    expect(decoded).toContain('error');
    expect(decoded).toContain('Alert');
    expect(decoded).toContain('isLoggedIn');
    expect(decoded).toContain('Dashboard');
    expect(decoded).toContain('Login');
  });

  it('round-trips maps fixture snippet', () => {
    const original = fixture('maps.jsx');
    const encoded = encode(original);
    const decoded = decode(encoded);

    expect(decoded).toContain('items.map');
    expect(decoded).toContain('className="item-list"');
    expect(decoded).toContain('className="item"');
  });

  it('round-trips fragments fixture snippet', () => {
    const original = fixture('fragments.jsx');
    const encoded = encode(original);
    const decoded = decode(encoded);

    expect(decoded).toContain('<>');
    expect(decoded).toContain('</>');
    expect(decoded).toContain('<Header');
    expect(decoded).toContain('<Main');
    expect(decoded).toContain('<Footer');
  });

  it('round-trips full file (encodeFile → decodeFile)', () => {
    const original = fixture('full-file.tsx');
    const encoded = encodeFile(original);
    const decoded = decodeFile(encoded);

    // Imports reconstructed
    expect(decoded).toContain('import React');
    expect(decoded).toContain('from "react"');
    expect(decoded).toContain('useState');
    expect(decoded).toContain('useEffect');
    expect(decoded).toContain('import { Button }');
    expect(decoded).toContain('import Link from "next/link"');
    expect(decoded).toContain('import type { Product, Category }');

    // Interface reconstructed
    expect(decoded).toContain('interface ProductListProps');

    // Hooks reconstructed
    expect(decoded).toContain('const [products, setProducts] = useState(initialProducts)');
    expect(decoded).toContain('const [search, setSearch] = useState("")');
    expect(decoded).toContain('const formRef = useRef(null)');
    expect(decoded).toContain('const router = useRouter()');

    // Function structure
    expect(decoded).toContain('function ProductList');
    expect(decoded).toContain('return (');

    // JSX present
    expect(decoded).toContain('Products');
    expect(decoded).toContain('Button');
  });
});

// ---------------------------------------------------------------------------
// Edge cases
// ---------------------------------------------------------------------------

describe('decode: edge cases', () => {
  it('returns empty string for empty input', () => {
    expect(decode('')).toBe('');
    expect(decode('  ')).toBe('');
    expect(decodeFile('')).toBe('');
  });

  it('handles aliases with no body', () => {
    const result = decode('@C Button=B\n@P onClick=k');
    expect(result).toBe('');
  });

  it('handles element with no props or children', () => {
    const result = decode('div');
    expect(result).toContain('<div />');
  });

  it('handles component with no props or children', () => {
    const result = decode('Spinner');
    expect(result).toContain('<Spinner />');
  });

  it('handles mixed content (elements + text + expressions)', () => {
    const jsxn = `div
 "Hello"
 span "World"
 (count)`;
    const result = decode(jsxn);
    expect(result).toContain('<div>');
    expect(result).toContain('Hello');
    expect(result).toContain('<span>World</span>');
    expect(result).toContain('{count}');
    expect(result).toContain('</div>');
  });

  it('handles props with complex expressions', () => {
    const result = decode('Button {onClick:() => handleClick(id)}');
    expect(result).toContain('onClick={() => handleClick(id)}');
  });

  it('handles inline element after conditional with multi-line children', () => {
    const jsxn = `div
 ?show > Card
  CardBody
   span "Hello"`;
    const result = decode(jsxn);
    expect(result).toContain('show');
    expect(result).toContain('&&');
    expect(result).toContain('<Card');
  });
});

// ---------------------------------------------------------------------------
// SVG in JSX decoding
// ---------------------------------------------------------------------------

describe('SVG in JSX decoding', () => {
  it('decodes SVG elements as self-closing in JSX mode', () => {
    const result = decode('svg {viewBox:0 0 24 24}\n circle {cx:12, cy:12, r:10}');
    expect(result).toContain('<svg viewBox="0 0 24 24">');
    expect(result).toContain('<circle cx="12" cy="12" r="10" />');
    expect(result).toContain('</svg>');
  });

  it('decodes quoted prop values (commas preserved)', () => {
    const result = decode('g {transform:"translate(10, 20)"}');
    expect(result).toContain('transform={translate(10, 20)}');
  });

  it('decodes SVG fill/stroke as strings', () => {
    const result = decode('circle {fill:none, stroke:#333}');
    expect(result).toContain('fill="none"');
    expect(result).toContain('stroke="#333"');
  });

  it('decodes currentColor as string value', () => {
    const result = decode('svg {stroke:currentColor}\n path {d:M12 6v6}');
    expect(result).toContain('stroke="currentColor"');
  });
});
