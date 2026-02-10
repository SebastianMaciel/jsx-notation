# jsx-notation

[![npm version](https://img.shields.io/npm/v/jsx-notation)](https://www.npmjs.com/package/jsx-notation)
[![license](https://img.shields.io/npm/l/jsx-notation)](./LICENSE)

**Compress React/Next.js files by ~40% for AI assistants.** An MCP server and library that converts JSX/TSX into JSXN — a compact notation optimized for LLM token consumption.

## Why

Every time an AI assistant reads your React components, it wastes tokens on closing tags, repeated `className` attributes, and verbose props. That's context window space that could be used for actual reasoning.

JSXN strips the redundancy while keeping the meaning:

```jsx
// Before: 278 chars
<Modal isOpen={showModal} onClose={handleClose}>
  <div className="modal-body">
    <h2>{title}</h2>
    <Button disabled={!selected} onClick={handleSubmit}>Submit</Button>
  </div>
</Modal>
```

```
// After: 170 chars
@C Modal=M, Button=B
@P onClick=k, disabled=x, isOpen=io, onClose=oc

M {io:showModal, oc:handleClose}
  .modal-body
    h2 (title)
    B {x:!selected, k:handleSubmit} "Submit"
```

Indentation replaces closing tags. `.class` and `#id` work like CSS selectors. Frequent components, props, and Tailwind classes get short aliases.

## Install

```bash
npm install jsx-notation
```

## Quick start: MCP server

The main use case — let your AI assistant read JSX files in compressed form.

**Claude Code:**

```bash
claude mcp add jsx-notation -- npx jsx-notation-mcp
```

**Cursor** (`~/.cursor/mcp.json` or `.cursor/mcp.json`):

```json
{
  "mcpServers": {
    "jsx-notation": {
      "command": "npx",
      "args": ["jsx-notation-mcp"]
    }
  }
}
```

**VS Code Copilot** (`.vscode/mcp.json`):

```json
{
  "servers": {
    "jsx-notation": {
      "command": "npx",
      "args": ["jsx-notation-mcp"]
    }
  }
}
```

The server exposes two tools:

| Tool | Description |
|---|---|
| `read_jsxn` | Reads a `.jsx/.tsx/.js/.ts` file and returns its JSXN encoding |
| `encode_jsxn` | Encodes raw code as a string (`file` or `snippet` mode) |

### Guiding the AI

Add this to your `CLAUDE.md` or `.cursorrules` so the assistant prefers JSXN:

```
When you need to read .jsx, .tsx, .js, or .ts files for context, use the
read_jsxn tool from the jsx-notation MCP server. It returns JSXN compact
notation (~40% fewer tokens) that you understand perfectly.
```

## Library usage

```js
import { encode, encodeFile } from 'jsx-notation';

// Encode a JSX snippet
const jsxn = encode('<Button onClick={go}>Save</Button>');

// Encode a complete file (imports, types, hooks, logic + JSX)
const full = encodeFile(fileContents);
```

## Notation reference

### Elements and attributes

| JSX | JSXN |
|---|---|
| `<div className="a b">` | `.a.b` (implicit div) |
| `<span id="x">` | `span#x` |
| `<h2>{title}</h2>` | `h2 (title)` |
| `<span>Hello</span>` | `span "Hello"` |
| `disabled` (boolean prop) | `{disabled}` |
| `{...props}` (spread) | `{...props}` |

### Patterns

| JSX | JSXN |
|---|---|
| `{cond && <X/>}` | `?cond > X` |
| `{a ? <A/> : <B/>}` | `?a > A \| B` |
| `{items.map(i => <X/>)}` | `*items > X` |
| `<>...</>` | `_` |

### File-level compression (`encodeFile`)

| Code | JSXN |
|---|---|
| `import { X } from 'mod'` | `@I mod: X` |
| `import type { T } from 'mod'` | `@T mod: T` |
| `const [x, setX] = useState(0)` | `@state x = 0` |
| `const ref = useRef(null)` | `@ref ref = null` |
| `const x = expr` | `x = expr` |
| JSX return boundary | `---` |

### Alias headers

| Header | Purpose | Example |
|---|---|---|
| `@C` | Component aliases | `@C Button=B, Modal=M` |
| `@P` | Prop aliases | `@P onClick=k, onChange=g` |
| `@S` | CSS class aliases (Tailwind) | `@S items-center=ic, font-medium=fm` |

## Contributing

Found a bug or have an idea? [Open an issue](https://github.com/sebastianmaciel/jsx-notation/issues).

## Disclaimer

This software is provided "as is", without warranty of any kind. See the [MIT License](./LICENSE) for full terms.

JSXN is an experimental tool that compresses JSX/TSX source code into a compact notation for use with AI/LLM systems. The encoded output is a lossy representation and may not preserve all semantic details of the original code. The author makes no guarantees about the accuracy of the encoding, the behavior of AI systems consuming JSXN output, or fitness for any particular use case.

The MCP server component reads files from your local file system. Only `.jsx`, `.tsx`, `.js`, and `.ts` files are accepted, with a 10 MB size limit. You are responsible for ensuring it is configured appropriately for your environment. Use at your own risk.

## License

[MIT](./LICENSE) - Sebastián Maciel
