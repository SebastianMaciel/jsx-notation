# JSXN

Compact notation encoder for React/Next.js files, optimized for LLM token consumption. Reduces JSX/TSX by ~40% while preserving full semantic meaning.

## What it does

JSXN takes verbose JSX and compresses it into a minimal notation that AI assistants understand perfectly:

```jsx
// Input: 430 chars
<Modal isOpen={showModal} onClose={handleClose}>
  <div className="modal-body">
    <h2>{title}</h2>
    <Button disabled={!selected} onClick={handleSubmit}>Confirmar</Button>
  </div>
</Modal>
```

```
// Output: ~250 chars
@C Modal=M, Button=B
@P onClick=k, disabled=x, isOpen=io, onClose=oc

M {io:showModal, oc:handleClose}
  .modal-body
    h2 (title)
    B {x:!selected, k:handleSubmit} "Confirmar"
```

Indentation replaces closing tags. `.class` and `#id` selectors replace attributes. Frequent components, props, and Tailwind classes get short aliases.

## Install

```bash
npm install jsxn
```

## Usage

### As a library

```js
import { encode, encodeFile } from 'jsxn';

// Encode a JSX snippet
const jsxn = encode('<Button onClick={go}>Save</Button>');

// Encode a full file (imports, types, hooks, logic + JSX)
const full = encodeFile(fileContents);
```

### As an MCP server

JSXN includes an MCP server that lets AI assistants read your files in compressed form.

**Claude Code:**

```bash
claude mcp add jsxn -- npx jsxn-mcp
```

**Cursor** (`~/.cursor/mcp.json` or `.cursor/mcp.json`):

```json
{
  "mcpServers": {
    "jsxn": {
      "command": "npx",
      "args": ["jsxn-mcp"]
    }
  }
}
```

**VS Code Copilot** (`.vscode/mcp.json`):

```json
{
  "servers": {
    "jsxn": {
      "command": "npx",
      "args": ["jsxn-mcp"]
    }
  }
}
```

The MCP server exposes two tools:

| Tool | Description |
|---|---|
| `read_jsxn` | Reads a `.jsx/.tsx/.js/.ts` file from disk and returns its JSXN encoding |
| `encode_jsxn` | Encodes raw code passed as a string (modes: `file` or `snippet`) |

### Guiding the AI

Add this to your `CLAUDE.md` or `.cursorrules` so the assistant prefers JSXN:

```
When you need to read .jsx, .tsx, .js, or .ts files for context, use the
read_jsxn tool from the jsxn MCP server. It returns JSXN compact notation
(~40% fewer tokens) that you understand perfectly.
```

## Notation reference

### JSX syntax

| JSX | JSXN |
|---|---|
| `<div className="a b">` | `.a.b` (implicit div) |
| `<span id="x">` | `span#x` |
| `<h2>{title}</h2>` | `h2 (title)` |
| `<span>Hello</span>` | `span "Hello"` |
| `disabled` (boolean prop) | `{disabled}` |
| `{...props}` (spread) | `{...props}` |
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

## Disclaimer

This software is provided "as is", without warranty of any kind. See the [MIT License](./LICENSE) for full terms.

JSXN is an experimental tool that compresses JSX/TSX source code into a compact notation for use with AI/LLM systems. The encoded output is a lossy representation and may not preserve all semantic details of the original code. The author makes no guarantees about the accuracy of the encoding, the behavior of AI systems consuming JSXN output, or fitness for any particular use case.

The MCP server component reads files from your local file system. Only `.jsx`, `.tsx`, `.js`, and `.ts` files are accepted, with a 10 MB size limit. You are responsible for ensuring it is configured appropriately for your environment. Use at your own risk.

## License

[MIT](./LICENSE) - Sebastián Maciel
