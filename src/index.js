import { parseJSX } from './parser.js';
import { emit } from './emitter.js';
import { analyze } from './analyzer.js';
import { generateAliases, formatHeaders } from './alias.js';

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
  function walk(node) {
    if (found || !node || typeof node !== 'object') return;
    if (node.type === 'JSXElement' || node.type === 'JSXFragment') {
      found = true;
      return;
    }
    for (const key of Object.keys(node)) {
      if (key === 'leadingComments' || key === 'trailingComments' || key === 'loc') continue;
      const val = node[key];
      if (Array.isArray(val)) {
        for (const item of val) walk(item);
      } else if (val && typeof val === 'object' && val.type) {
        walk(val);
      }
      if (found) return;
    }
  }
  walk(ast.program);
  return found;
}
