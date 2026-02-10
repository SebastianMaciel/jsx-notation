import { parseJSX } from './parser.js';
import { emit } from './emitter.js';
import { analyze } from './analyzer.js';
import { generateAliases, formatHeaders } from './alias.js';
export { encodeFile } from './file-encoder.js';

/**
 * Encode JSX/TSX source code into JSXN notation.
 *
 * @param {string} code - JSX/TSX source code
 * @returns {string} JSXN notation
 */
export function encode(code) {
  const ast = parseJSX(code);

  // Check if code contains any JSX — if not, return as-is
  if (!hasJSX(ast)) return code;

  const frequencies = analyze(ast);
  const aliases = generateAliases(frequencies);
  const headers = formatHeaders(aliases);
  const body = emit(ast, aliases, code);

  if (headers) {
    return `${headers}\n\n${body}`;
  }
  return body;
}

function hasJSX(ast) {
  let found = false;
  const MAX_DEPTH = 200;
  function walk(node, depth) {
    if (found || !node || typeof node !== 'object' || depth > MAX_DEPTH) return;
    if (node.type === 'JSXElement' || node.type === 'JSXFragment') {
      found = true;
      return;
    }
    for (const key of Object.keys(node)) {
      if (key === 'leadingComments' || key === 'trailingComments' || key === 'loc') continue;
      const val = node[key];
      if (Array.isArray(val)) {
        for (const item of val) walk(item, depth + 1);
      } else if (val && typeof val === 'object' && val.type) {
        walk(val, depth + 1);
      }
      if (found) return;
    }
  }
  walk(ast.program, 0);
  return found;
}
