import { parse } from '@babel/parser';

/**
 * Parse JSX/TSX code into a Babel AST.
 */
export function parseJSX(code) {
  return parse(code, {
    sourceType: 'module',
    plugins: ['jsx', 'typescript'],
    errorRecovery: true,
  });
}
