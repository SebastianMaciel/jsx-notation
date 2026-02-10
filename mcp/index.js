#!/usr/bin/env node

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { readFile, stat, realpath } from 'node:fs/promises';
import { resolve, extname } from 'node:path';
import { encode, encodeFile } from '../src/index.js';

const server = new McpServer({
  name: 'jsx-notation',
  version: '0.1.0',
});

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB
const MAX_INPUT_LENGTH = 10 * 1024 * 1024;
const ALLOWED_EXTENSIONS = new Set(['.jsx', '.tsx', '.js', '.ts']);

// ---------------------------------------------------------------------------
// Tool: read_jsxn — read a file from disk and return its JSXN-encoded version
// ---------------------------------------------------------------------------

server.registerTool('read_jsxn', {
  title: 'Read file as JSXN',
  description:
    'Reads a React/Next.js file (.jsx, .tsx, .js, .ts) from disk and returns ' +
    'its JSXN-compressed representation (~40% fewer tokens). ' +
    'Use this instead of reading JSX/TSX files directly when you need to ' +
    'understand component structure, props, and rendering logic. ' +
    'For full files with imports/hooks/logic, the file-level encoding is used automatically.',
  inputSchema: {
    path: z
      .string()
      .describe('Absolute or relative path to the .jsx/.tsx/.js/.ts file to encode'),
  },
}, async ({ path: filePath }) => {
  try {
    const absPath = resolve(filePath);

    // Validate extension before reading anything
    const ext = extname(absPath).toLowerCase();
    if (!ALLOWED_EXTENSIONS.has(ext)) {
      return {
        isError: true,
        content: [{ type: 'text', text: 'Only .jsx, .tsx, .js, and .ts files are supported' }],
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
    const encoded = encodeFile(content);

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
    'Encodes raw JSX/TSX source code into JSXN compact notation (~40% fewer tokens). ' +
    'Use "snippet" mode for JSX fragments (just the template). ' +
    'Use "file" mode for complete React/Next.js files with imports, types, hooks, etc.',
  inputSchema: {
    code: z
      .string()
      .max(MAX_INPUT_LENGTH, `Input must be under ${MAX_INPUT_LENGTH / 1024 / 1024} MB`)
      .describe('The JSX/TSX source code to encode'),
    mode: z
      .enum(['file', 'snippet'])
      .default('file')
      .describe('"file" for complete files with imports/hooks/logic, "snippet" for JSX-only fragments'),
  },
}, async ({ code, mode }) => {
  try {
    const encoded = mode === 'snippet' ? encode(code) : encodeFile(code);
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
