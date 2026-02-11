# jsx-notation

[![npm version](https://img.shields.io/npm/v/jsx-notation)](https://www.npmjs.com/package/jsx-notation)
[![license](https://img.shields.io/npm/l/jsx-notation)](./LICENSE)

**Compress React/Next.js files, HTML, and SVG by ~40% for AI assistants.** An MCP server and library that converts JSX/TSX, HTML, and SVG into JSXN — a compact notation optimized for LLM token consumption.

**[Try the live demo →](https://sebastianmaciel.github.io/jsx-notation/)**

## Why

Every time an AI assistant reads your React components, HTML, or SVG files, it wastes tokens on closing tags, repeated `className`/`class` attributes, and verbose props. That's context window space that could be used for actual reasoning.

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

```scss
// After: 170 chars
@C Modal=M, Button=B
@P onClick=k, disabled=x, isOpen=io, onClose=oc

M {io:showModal, oc:handleClose}
  .modal-body
    h2 (title)
    B {x:!selected, k:handleSubmit} "Submit"
```

Works for HTML too:

```html
<!-- Before: 340 chars -->
<table class="data-table">
  <thead>
    <tr><th>Name</th><th>Email</th><th>Role</th></tr>
  </thead>
  <tbody>
    <tr><td>Alice</td><td>alice@example.com</td><td>Admin</td></tr>
    <tr><td>Bob</td><td>bob@example.com</td><td>User</td></tr>
  </tbody>
</table>
```

```scss
// After: 188 chars
table.data-table
 thead
  tr
   th "Name"
   th "Email"
   th "Role"
 tbody
  tr
   td "Alice"
   td "alice@example.com"
   td "Admin"
  tr
   td "Bob"
   td "bob@example.com"
   td "User"
```

Works for SVG too:

```svg
<!-- Before: 306 chars -->
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none"
  stroke="currentColor" stroke-width="2" stroke-linecap="round"
  stroke-linejoin="round">
  <circle cx="12" cy="12" r="10"></circle>
  <line x1="12" y1="8" x2="12" y2="12"></line>
  <line x1="12" y1="16" x2="12.01" y2="16"></line>
</svg>
```

```scss
// After: 251 chars
svg {xmlns:http://www.w3.org/2000/svg, viewBox:0 0 24 24, fill:none, stroke:currentColor, stroke-width:2, stroke-linecap:round, stroke-linejoin:round}
 circle {cx:12, cy:12, r:10}
 line {x1:12, y1:8, x2:12, y2:12}
 line {x1:12, y1:16, x2:12.01, y2:16}
```

Indentation replaces closing tags. `.class` and `#id` work like CSS selectors. Frequent components, props, and CSS classes get short aliases. Values with commas are quoted to avoid delimiter confusion.

## Quick start: MCP server

The main use case — let your AI assistant read JSX/HTML/SVG files in compressed form.

[![Install in VS Code](https://img.shields.io/badge/Install_in-VS_Code-007ACC?logo=visualstudiocode&logoColor=white)](https://vscode.dev/redirect/mcp/install?name=jsx-notation&config=%7B%22command%22%3A%22npx%22%2C%22args%22%3A%5B%22jsx-notation-mcp%22%5D%7D) [![Install in Cursor](https://img.shields.io/badge/Install_in-Cursor-blue?logo=cursor&logoColor=white)](https://cursor.com/en/install-mcp?name=jsx-notation&config=eyJjb21tYW5kIjoibnB4IiwiYXJncyI6WyJqc3gtbm90YXRpb24tbWNwIl19)

**Claude Code:**

```bash
claude mcp add jsx-notation -- npx jsx-notation-mcp
```

> That's it. Restart Claude Code and the tools will be available. No `npm install` needed — `npx` downloads everything automatically.

**VS Code** (`.vscode/mcp.json`):

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

> Add this file to your project and restart VS Code. It will detect the server on its own — no extra setup needed.

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

> Just add this to your config file and restart Cursor. It will pick up the server automatically — nothing else to install.

**Windsurf** (`~/.codeium/windsurf/mcp_config.json`):

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

> Same format as Cursor. Add it, restart Windsurf, and it's ready.

> **Cline**, **Continue**, **Amazon Q**, and **JetBrains** IDEs (IntelliJ, WebStorm, etc.) also use the same `mcpServers` format. Paste the JSON above into your MCP settings.

**Zed** (`~/.config/zed/settings.json`):

```json
{
  "context_servers": {
    "jsx-notation": {
      "command": "npx",
      "args": ["jsx-notation-mcp"]
    }
  }
}
```

> Add this inside your Zed settings file and restart. Zed uses `context_servers` instead of `mcpServers`.

The server exposes four tools:

| Tool | Description |
|---|---|
| `read_jsxn` | Reads a `.jsx/.tsx/.js/.ts/.html/.svg` file and returns its JSXN encoding |
| `encode_jsxn` | Encodes raw code as a string (`file` or `snippet` mode, `jsx` or `html` format) |
| `decode_jsxn` | Decodes JSXN back to JSX/TSX or HTML (`jsx` or `html` format) |
| `write_jsxn` | Decodes JSXN and writes the result to a file (auto-detects `.html`/`.svg` for HTML output) |

### Guiding the AI

Add this to your `CLAUDE.md` or `.cursorrules` so the assistant prefers JSXN:

```text
When you need to read .jsx, .tsx, .js, .ts, .html, or .svg files for context,
use the read_jsxn tool from the jsx-notation MCP server. It returns JSXN compact
notation (~40% fewer tokens) that you understand perfectly.
```

## Library usage

For programmatic use: `npm install jsx-notation` — exports `encode`, `encodeFile`, `encodeHTML`, `decode`, `decodeFile`.

## Notation reference

### Elements and attributes

| JSX/HTML | JSXN |
|---|---|
| `<div className="a b">` / `<div class="a b">` | `.a.b` (implicit div) |
| `<span id="x">` | `span#x` |
| `<h2>{title}</h2>` | `h2 (title)` |
| `<span>Hello</span>` | `span "Hello"` |
| `disabled` (boolean prop) | `{disabled}` |
| `{...props}` (spread) | `{...props}` |

### Patterns (JSX only)

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

### HTML/SVG-specific

| HTML/SVG | JSXN |
|---|---|
| `<!DOCTYPE html>` | `!DOCTYPE html` |
| `<br>` / `<img>` (void elements) | `br` / `img {src:...}` |
| `class="foo bar"` | `.foo.bar` |
| `<circle cx="12" />` (SVG self-closing) | `circle {cx:12}` |
| `font-family="system-ui, sans-serif"` | `font-family:"system-ui, sans-serif"` |

When decoding with `{ format: 'html' }`:
- `class` is used instead of `className`
- All attribute values are strings (no `{expression}`)
- Void elements use `<br>` (not `<br />`)
- SVG elements without children use `<path ... />` (XML self-closing)
- Empty non-void elements use `<div></div>` (not `<div />`)
- Values with commas are quoted in props: `{key:"val, val2"}`

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

JSXN is an experimental tool that compresses JSX/TSX, HTML, and SVG source code into a compact notation for use with AI/LLM systems. The encoded output is a lossy representation and may not preserve all semantic details of the original code. The author makes no guarantees about the accuracy of the encoding, the behavior of AI systems consuming JSXN output, or fitness for any particular use case.

The MCP server component reads files from your local file system. Only `.jsx`, `.tsx`, `.js`, `.ts`, `.html`, and `.svg` files are accepted, with a 10 MB size limit. You are responsible for ensuring it is configured appropriately for your environment. Use at your own risk.

## License

[MIT](./LICENSE) - Sebastián Maciel
