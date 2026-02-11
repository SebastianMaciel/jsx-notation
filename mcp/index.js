#!/usr/bin/env node

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { readFile, stat, realpath } from 'node:fs/promises';
import { resolve, extname, dirname } from 'node:path';
import { encode, encodeFile, encodeHTML, decode, decodeFile } from '../src/index.js';
import { writeFile, mkdir } from 'node:fs/promises';

const server = new McpServer({
  name: 'jsx-notation',
  version: '0.1.0',
});

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB
const MAX_INPUT_LENGTH = 10 * 1024 * 1024;
const ALLOWED_EXTENSIONS = new Set(['.jsx', '.tsx', '.js', '.ts', '.html', '.svg']);

// ---------------------------------------------------------------------------
// Tool: read_jsxn — read a file from disk and return its JSXN-encoded version
// ---------------------------------------------------------------------------

server.registerTool('read_jsxn', {
  title: 'Read file as JSXN',
  description:
    'Reads a React/Next.js file (.jsx, .tsx, .js, .ts), HTML file (.html), or SVG file (.svg) from disk and returns ' +
    'its JSXN-compressed representation (~40% fewer tokens). ' +
    'Use this instead of reading JSX/TSX files directly when you need to ' +
    'understand component structure, props, and rendering logic. ' +
    'For full files with imports/hooks/logic, the file-level encoding is used automatically. ' +
    'For .html and .svg files, the HTML encoder is used.',
  inputSchema: {
    path: z
      .string()
      .describe('Absolute or relative path to the .jsx/.tsx/.js/.ts/.html/.svg file to encode'),
  },
}, async ({ path: filePath }) => {
  try {
    const absPath = resolve(filePath);

    // Validate extension before reading anything
    const ext = extname(absPath).toLowerCase();
    if (!ALLOWED_EXTENSIONS.has(ext)) {
      return {
        isError: true,
        content: [{ type: 'text', text: 'Only .jsx, .tsx, .js, .ts, .html, and .svg files are supported' }],
      };
    }

    // Resolve symlinks and validate the real path
    const realFile = await realpath(absPath);
    if (extname(realFile).toLowerCase() !== ext) {
      return {
        isError: true,
        content: [{ type: 'text', text: 'Symlink target must have the same extension' }],
      };
    }

    // Check file size before reading
    const stats = await stat(realFile);
    if (stats.size > MAX_FILE_SIZE) {
      return {
        isError: true,
        content: [{ type: 'text', text: `File too large (max ${MAX_FILE_SIZE / 1024 / 1024} MB)` }],
      };
    }

    const content = await readFile(realFile, 'utf-8');
    const encoded = (ext === '.html' || ext === '.svg') ? encodeHTML(content) : encodeFile(content);

    return {
      content: [{
        type: 'text',
        text: `// JSXN: ${filePath}\n${encoded}`,
      }],
    };
  } catch (err) {
    const msg = err.code === 'ENOENT' ? 'File not found'
              : err.code === 'EACCES' ? 'Permission denied'
              : 'Unable to read file';
    return {
      isError: true,
      content: [{ type: 'text', text: msg }],
    };
  }
});

// ---------------------------------------------------------------------------
// Tool: encode_jsxn — encode raw JSX/TSX code to JSXN notation
// ---------------------------------------------------------------------------

server.registerTool('encode_jsxn', {
  title: 'Encode code to JSXN',
  description:
    'Encodes raw JSX/TSX source code or HTML into JSXN compact notation (~40% fewer tokens). ' +
    'Use "snippet" mode for JSX fragments (just the template). ' +
    'Use "file" mode for complete React/Next.js files with imports, types, hooks, etc. ' +
    'Use format "html" to encode HTML source.',
  inputSchema: {
    code: z
      .string()
      .max(MAX_INPUT_LENGTH, `Input must be under ${MAX_INPUT_LENGTH / 1024 / 1024} MB`)
      .describe('The JSX/TSX/HTML source code to encode'),
    mode: z
      .enum(['file', 'snippet'])
      .default('file')
      .describe('"file" for complete files with imports/hooks/logic, "snippet" for JSX-only fragments'),
    format: z
      .enum(['jsx', 'html'])
      .default('jsx')
      .describe('"jsx" for JSX/TSX (default), "html" for HTML source'),
  },
}, async ({ code, mode, format }) => {
  try {
    const encoded = format === 'html' ? encodeHTML(code) : (mode === 'snippet' ? encode(code) : encodeFile(code));
    return {
      content: [{ type: 'text', text: encoded }],
    };
  } catch (err) {
    return {
      isError: true,
      content: [{ type: 'text', text: 'Unable to parse or encode the provided code' }],
    };
  }
});

// ---------------------------------------------------------------------------
// Tool: decode_jsxn — decode JSXN notation back to JSX/TSX
// ---------------------------------------------------------------------------

server.registerTool('decode_jsxn', {
  title: 'Decode JSXN to code',
  description:
    'Decodes JSXN compact notation back into standard JSX/TSX or HTML source code. ' +
    'Use "snippet" mode for JSXN body fragments (just the template). ' +
    'Use "file" mode for complete JSXN files with imports, types, hooks, etc. ' +
    'Use format "html" to decode to HTML output.',
  inputSchema: {
    code: z
      .string()
      .max(MAX_INPUT_LENGTH, `Input must be under ${MAX_INPUT_LENGTH / 1024 / 1024} MB`)
      .describe('The JSXN notation to decode'),
    mode: z
      .enum(['file', 'snippet'])
      .default('file')
      .describe('"file" for complete files with imports/hooks/logic, "snippet" for JSXN body fragments'),
    format: z
      .enum(['jsx', 'html'])
      .default('jsx')
      .describe('"jsx" for JSX/TSX (default), "html" for HTML output'),
  },
}, async ({ code, mode, format }) => {
  try {
    const opts = format === 'html' ? { format: 'html' } : {};
    const decoded = mode === 'snippet' ? decode(code, opts) : decodeFile(code);
    return {
      content: [{ type: 'text', text: decoded }],
    };
  } catch (err) {
    return {
      isError: true,
      content: [{ type: 'text', text: 'Unable to decode the provided JSXN' }],
    };
  }
});

// ---------------------------------------------------------------------------
// Tool: write_jsxn — decode JSXN and write JSX/TSX to disk
// ---------------------------------------------------------------------------

server.registerTool('write_jsxn', {
  title: 'Write JSXN as file',
  description:
    'Decodes JSXN notation and writes the resulting JSX/TSX or HTML to a file on disk. ' +
    'Creates parent directories if needed. Writes to .jsx/.tsx/.js/.ts/.html/.svg files. ' +
    'For .html and .svg files, decodes with HTML format (class attrs, void elements, SVG self-closing, etc.).\n\n' +
    '## JSXN Format Reference\n\n' +
    'JSXN is a compact notation for React/Next.js code that saves ~40% tokens.\n\n' +
    '### File-level headers\n' +
    '- `@I module: default Name, x, y` → `import Name, { x, y } from "module"`\n' +
    '- `@I "styles.css"` → `import "styles.css"`\n' +
    '- `@T module: Type1` → `import type { Type1 } from "module"`\n\n' +
    '### Directives\n' +
    '- `"use client"` / `"use server"` → passed through as-is\n\n' +
    '### Types\n' +
    '- `Name { field: Type }` → `interface Name { field: Type }`\n' +
    '- `Name = Type | Other` → `type Name = Type | Other`\n\n' +
    '### Function blocks\n' +
    '- `export default Name(params)` → function signature\n' +
    '- `@state count = 0` → `const [count, setCount] = useState(0)`\n' +
    '- `@ref inputRef = null` → `const inputRef = useRef(null)`\n' +
    '- `name = useHook(args)` → `const name = useHook(args)`\n' +
    '- `variable = expr` → `const variable = expr`\n' +
    '- `let variable = expr` → preserved as `let`\n' +
    '- `---` → separator; everything after is the JSX return body\n\n' +
    '### JSX body notation\n' +
    '- **Alias headers** (optional): `@C Button=B`, `@P onClick=k`, `@S items-center=ic`\n' +
    '- **Elements**: `tag.class1.class2#id {prop:val, flag} "text"` or `(expr)`\n' +
    '- **Implicit div**: `.className` (div is omitted when it has selectors)\n' +
    '- **Nesting**: 1-space indentation per level\n' +
    '- **Fragments**: `_` → `<>...</>`\n' +
    '- **Conditionals**: `?cond > Element` → `{cond && (<Element />)}`\n' +
    '- **Ternaries**: `?cond > A | B` → `{cond ? (<A />) : (<B />)}`\n' +
    '- **Maps**: `*items > Element` → `{items.map(item => (<Element />))}`\n' +
    '- **Text nodes**: `"Hello"` → raw text\n' +
    '- **Expressions**: `(expr)` → `{expr}`\n' +
    '- **Props**: `{key:value}` string for HTML attrs, `{key:expr}` expression otherwise\n' +
    '- **Boolean props**: `{disabled}` → `disabled`\n' +
    '- **Spread**: `{...props}` → `{...props}`\n' +
    '- **Self-closing**: element with no children → `<Element />`\n' +
    '- **Member expressions**: `Form.Input` (dot after uppercase = member, not class)\n\n' +
    '### Example\n' +
    '```\n' +
    '@C Modal=M, Button=B\n' +
    '@P onClick=k, disabled=x\n' +
    '\n' +
    'M {isOpen:show, onClose:handleClose}\n' +
    '  .modal-body\n' +
    '    h2 (title)\n' +
    '    ?error > Alert {type:error} (error)\n' +
    '    ul.item-list\n' +
    '      *items > li.item {key:item.id, k:()=>select(item)}\n' +
    '        (item.name)\n' +
    '    B {x:!selected, k:handleSubmit} "Confirm"\n' +
    '```',
  inputSchema: {
    code: z
      .string()
      .max(MAX_INPUT_LENGTH, `Input must be under ${MAX_INPUT_LENGTH / 1024 / 1024} MB`)
      .describe('The JSXN notation to decode and write'),
    path: z
      .string()
      .describe('Target file path (.jsx, .tsx, .js, .ts, .html, or .svg)'),
  },
}, async ({ code, path: filePath }) => {
  try {
    const absPath = resolve(filePath);
    const ext = extname(absPath).toLowerCase();

    if (!ALLOWED_EXTENSIONS.has(ext)) {
      return {
        isError: true,
        content: [{ type: 'text', text: 'Only .jsx, .tsx, .js, .ts, .html, and .svg files are supported' }],
      };
    }

    const decoded = (ext === '.html' || ext === '.svg') ? decode(code, { format: 'html' }) : decodeFile(code);
    await mkdir(dirname(absPath), { recursive: true });
    await writeFile(absPath, decoded, 'utf-8');

    return {
      content: [{
        type: 'text',
        text: `Wrote ${decoded.split('\n').length} lines to ${filePath}`,
      }],
    };
  } catch (err) {
    const msg = err.code === 'EACCES' ? 'Permission denied'
              : err.message?.includes('decode') ? 'Unable to decode the provided JSXN'
              : 'Unable to write file';
    return {
      isError: true,
      content: [{ type: 'text', text: msg }],
    };
  }
});

// ---------------------------------------------------------------------------
// Start
// ---------------------------------------------------------------------------

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('jsxn MCP server running on stdio');
}

main().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});
