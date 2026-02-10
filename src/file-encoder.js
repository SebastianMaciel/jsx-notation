import { parseJSX } from './parser.js';
import { emit } from './emitter.js';
import { analyze } from './analyzer.js';
import { generateAliases, formatHeaders } from './alias.js';

/**
 * Encode an entire React/Next.js file into compressed JSXN notation.
 * Preserves full file context (imports, types, hooks, logic) while
 * compressing everything possible.
 *
 * @param {string} code - Full .jsx/.tsx file source
 * @returns {string} Compressed output
 */
export function encodeFile(code) {
  const ast = parseJSX(code);
  const sections = [];

  // Handle directives ("use client", "use server", etc.)
  for (const dir of ast.program.directives ?? []) {
    sections.push(`"${dir.value.value}"`);
  }

  const body = ast.program.body;

  // Collect imports first to group them
  const imports = [];
  const typeImports = [];
  const rest = [];

  for (const stmt of body) {
    if (stmt.type === 'ImportDeclaration') {
      if (stmt.importKind === 'type') {
        typeImports.push(stmt);
      } else {
        imports.push(stmt);
      }
    } else {
      rest.push(stmt);
    }
  }

  // Emit compressed imports
  for (const imp of imports) {
    sections.push(compressImport(imp));
  }
  for (const imp of typeImports) {
    sections.push(compressTypeImport(imp));
  }

  // Process remaining statements
  for (const stmt of rest) {
    const result = processStatement(stmt, code);
    if (result !== null) sections.push(result);
  }

  return sections.join('\n');
}

// ---------------------------------------------------------------------------
// Import compression
// ---------------------------------------------------------------------------

function compressImport(node) {
  const source = node.source.value;
  const specifiers = node.specifiers;

  // Side-effect import: import "styles.css"
  if (specifiers.length === 0) {
    return `@I "${source}"`;
  }

  const parts = [];
  for (const spec of specifiers) {
    if (spec.type === 'ImportDefaultSpecifier') {
      parts.push(`default ${spec.local.name}`);
    } else if (spec.type === 'ImportNamespaceSpecifier') {
      parts.push(`* as ${spec.local.name}`);
    } else if (spec.type === 'ImportSpecifier') {
      if (spec.importKind === 'type') {
        parts.push(`type ${spec.local.name}`);
      } else if (spec.imported.name !== spec.local.name) {
        parts.push(`${spec.imported.name} as ${spec.local.name}`);
      } else {
        parts.push(spec.local.name);
      }
    }
  }

  return `@I ${source}: ${parts.join(', ')}`;
}

function compressTypeImport(node) {
  const source = node.source.value;
  const specifiers = node.specifiers;

  if (specifiers.length === 0) {
    return `@T "${source}"`;
  }

  const parts = [];
  for (const spec of specifiers) {
    if (spec.type === 'ImportDefaultSpecifier') {
      parts.push(`default ${spec.local.name}`);
    } else if (spec.type === 'ImportSpecifier') {
      if (spec.imported.name !== spec.local.name) {
        parts.push(`${spec.imported.name} as ${spec.local.name}`);
      } else {
        parts.push(spec.local.name);
      }
    }
  }

  return `@T ${source}: ${parts.join(', ')}`;
}

// ---------------------------------------------------------------------------
// Statement processing
// ---------------------------------------------------------------------------

function processStatement(stmt, code) {
  switch (stmt.type) {
    case 'ExpressionStatement':
      return processExpressionStatement(stmt, code);

    case 'TSInterfaceDeclaration':
      return compressInterface(stmt, code);

    case 'TSTypeAliasDeclaration':
      return compressTypeAlias(stmt, code);

    case 'ExportDefaultDeclaration':
      return processExportDefault(stmt, code);

    case 'ExportNamedDeclaration':
      return processExportNamed(stmt, code);

    case 'FunctionDeclaration':
      return processComponentFunction(stmt, code, '');

    case 'VariableDeclaration':
      return processVariableDeclaration(stmt, code, '');

    default:
      return code.slice(stmt.start, stmt.end);
  }
}

function processExpressionStatement(stmt, code) {
  const expr = stmt.expression;
  if (expr.type === 'StringLiteral' || expr.type === 'DirectiveLiteral') {
    return `"${expr.value}"`;
  }
  return code.slice(stmt.start, stmt.end);
}

// ---------------------------------------------------------------------------
// Type compression
// ---------------------------------------------------------------------------

function compressInterface(node, code) {
  const name = node.id.name;
  const body = code.slice(node.body.start, node.body.end);
  if (node.extends && node.extends.length > 0) {
    const extendsStr = node.extends.map(e => code.slice(e.start, e.end)).join(', ');
    return `${name} extends ${extendsStr} ${body}`;
  }
  return `${name} ${body}`;
}

function compressTypeAlias(node, code) {
  const name = node.id.name;
  const annotation = code.slice(node.typeAnnotation.start, node.typeAnnotation.end);
  return `${name} = ${annotation}`;
}

// ---------------------------------------------------------------------------
// Component / function processing
// ---------------------------------------------------------------------------

function processExportDefault(stmt, code) {
  const decl = stmt.declaration;
  if (!decl) return code.slice(stmt.start, stmt.end);

  if (decl.type === 'FunctionDeclaration') {
    return processComponentFunction(decl, code, 'export default ');
  }

  if (decl.type === 'ArrowFunctionExpression' || decl.type === 'FunctionExpression') {
    return processComponentFunction(decl, code, 'export default ');
  }

  // export default SomeIdentifier
  return code.slice(stmt.start, stmt.end);
}

function processExportNamed(stmt, code) {
  const decl = stmt.declaration;
  if (!decl) return code.slice(stmt.start, stmt.end);

  if (decl.type === 'FunctionDeclaration') {
    return processComponentFunction(decl, code, 'export ');
  }

  if (decl.type === 'VariableDeclaration') {
    return processVariableDeclaration(decl, code, 'export ');
  }

  if (decl.type === 'TSTypeAliasDeclaration') {
    return 'export ' + compressTypeAlias(decl, code);
  }

  if (decl.type === 'TSInterfaceDeclaration') {
    return 'export ' + compressInterface(decl, code);
  }

  return code.slice(stmt.start, stmt.end);
}

function processVariableDeclaration(stmt, code, prefix) {
  if (stmt.declarations.length === 1) {
    const decl = stmt.declarations[0];
    if (decl.id.type === 'Identifier' && decl.init &&
        (decl.init.type === 'ArrowFunctionExpression' || decl.init.type === 'FunctionExpression')) {
      if (containsJSX(decl.init)) {
        return processComponentFunction(decl.init, code, prefix, decl.id.name);
      }
    }
  }

  const raw = code.slice(stmt.start, stmt.end);
  return prefix + raw.replace(/^(const|let|var)\s+/, '');
}

/**
 * Process a function that contains JSX (a React component).
 */
function processComponentFunction(funcNode, code, prefix, forceName) {
  const body = funcNode.body;
  if (!body) {
    // No body — keep verbatim
    return prefix + code.slice(funcNode.start, funcNode.end);
  }

  // Arrow function with expression body (direct JSX return)
  if (body.type === 'JSXElement' || body.type === 'JSXFragment') {
    const sig = buildSignature(funcNode, code, prefix, forceName);
    const jsxn = encodeJSXFromSource(body, code);
    return `${sig}\n${indentBlock(jsxn, '  ', true)}`;
  }

  if (body.type !== 'BlockStatement') {
    // Not a block body and not JSX — keep as-is
    if (!containsJSX(funcNode)) {
      return prefix + code.slice(funcNode.start, funcNode.end);
    }
    return prefix + code.slice(funcNode.start, funcNode.end);
  }

  if (!containsJSX(funcNode)) {
    // Function without JSX — keep verbatim (strip function keyword if needed)
    return prefix + code.slice(funcNode.start, funcNode.end);
  }

  const sig = buildSignature(funcNode, code, prefix, forceName);
  const hookLines = [];
  const logicLines = [];
  let jsxNode = null;

  for (const stmt of body.body) {
    if (stmt.type === 'ReturnStatement') {
      jsxNode = findJSXInReturn(stmt);
      if (!jsxNode) {
        logicLines.push('  ' + code.slice(stmt.start, stmt.end));
      }
      continue;
    }

    const hookResult = tryCompressHook(stmt, code);
    if (hookResult !== null) {
      hookLines.push('  ' + hookResult);
      continue;
    }

    // Other logic: strip const/let/var, indent
    const raw = code.slice(stmt.start, stmt.end);
    const stripped = raw.replace(/^(const|let|var)\s+/, '');
    logicLines.push('  ' + stripped);
  }

  const parts = [sig];
  if (hookLines.length > 0) parts.push(hookLines.join('\n'));
  if (logicLines.length > 0) {
    if (hookLines.length > 0) parts.push('');
    parts.push(logicLines.join('\n'));
  }

  if (jsxNode) {
    parts.push('  ---');
    const jsxn = encodeJSXFromSource(jsxNode, code);
    parts.push(indentBlock(jsxn, '  '));
  }

  return parts.join('\n');
}

function buildSignature(funcNode, code, prefix, forceName) {
  const name = forceName || (funcNode.id ? funcNode.id.name : '');

  let paramsStr;
  if (funcNode.params.length > 0) {
    // Slice params from source, stripping TS type annotations on the outer level
    const paramsRaw = funcNode.params.map(p => {
      let s = code.slice(p.start, p.end);
      // Strip type annotation from simple params: "x: string" → "x"
      // but keep destructured patterns intact
      if (p.typeAnnotation && p.type === 'Identifier') {
        s = p.name;
      }
      return s;
    });
    paramsStr = '(' + paramsRaw.join(', ') + ')';
  } else {
    paramsStr = '()';
  }

  return `${prefix}${name}${paramsStr}`;
}

// ---------------------------------------------------------------------------
// Hook compression
// ---------------------------------------------------------------------------

function tryCompressHook(stmt, code) {
  if (stmt.type === 'VariableDeclaration' && stmt.declarations.length === 1) {
    const decl = stmt.declarations[0];
    const init = decl.init;

    if (!init || init.type !== 'CallExpression') return null;

    const callee = init.callee;
    const calleeName = callee.type === 'Identifier' ? callee.name : null;
    if (!calleeName) return null;

    // useState → @state
    if (calleeName === 'useState') {
      return compressUseState(decl, init, code);
    }

    // useRef → @ref
    if (calleeName === 'useRef') {
      return compressUseRef(decl, init, code);
    }

    // Other useX hooks: name = useX(...)
    if (calleeName.startsWith('use') && calleeName.length > 3) {
      const name = decl.id.type === 'Identifier' ? decl.id.name :
                   code.slice(decl.id.start, decl.id.end);
      const args = code.slice(init.start + calleeName.length, init.end);
      return `${name} = ${calleeName}${args}`;
    }
  }

  // Bare hook call: useEffect(() => {...}, [])
  if (stmt.type === 'ExpressionStatement' && stmt.expression.type === 'CallExpression') {
    const callee = stmt.expression.callee;
    const calleeName = callee.type === 'Identifier' ? callee.name : null;
    if (calleeName && calleeName.startsWith('use') && calleeName.length > 3) {
      return code.slice(stmt.start, stmt.end);
    }
  }

  return null;
}

function compressUseState(decl, init, code) {
  let name;
  if (decl.id.type === 'ArrayPattern' && decl.id.elements.length >= 1) {
    name = decl.id.elements[0].name;
  } else if (decl.id.type === 'Identifier') {
    name = decl.id.name;
  } else {
    return null;
  }

  const args = init.arguments;
  let val;
  if (args.length === 0) {
    val = 'undefined';
  } else {
    val = code.slice(args[0].start, args[0].end);
  }

  return `@state ${name} = ${val}`;
}

function compressUseRef(decl, init, code) {
  const name = decl.id.type === 'Identifier' ? decl.id.name :
               code.slice(decl.id.start, decl.id.end);

  const args = init.arguments;
  let val;
  if (args.length === 0) {
    val = 'undefined';
  } else {
    val = code.slice(args[0].start, args[0].end);
  }

  return `@ref ${name} = ${val}`;
}

// ---------------------------------------------------------------------------
// JSX encoding (delegates to existing pipeline)
// ---------------------------------------------------------------------------

/**
 * Encode a JSX AST node using the existing encode pipeline.
 * Extracts the JSX source from the original code and runs it through
 * analyze → generateAliases → emit.
 */
function encodeJSXFromSource(jsxNode, code) {
  const jsxSource = code.slice(jsxNode.start, jsxNode.end);
  const ast = parseJSX(jsxSource);
  const frequencies = analyze(ast);
  const aliases = generateAliases(frequencies);
  const headers = formatHeaders(aliases);
  const body = emit(ast, aliases, jsxSource);

  if (headers) {
    return `${headers}\n\n${body}`;
  }
  return body;
}

function indentBlock(text, indent, isSeparator) {
  if (isSeparator) {
    // For arrow-with-expression-body: add --- then indented JSXN
    const lines = text.split('\n');
    // Find where JSXN body starts (after headers or at start)
    return indent + '---\n' + lines.map(l => l ? indent + l : '').join('\n');
  }
  return text.split('\n').map(l => l ? indent + l : '').join('\n');
}

// ---------------------------------------------------------------------------
// Utilities
// ---------------------------------------------------------------------------

function containsJSX(node) {
  let found = false;
  function walk(n) {
    if (found || !n || typeof n !== 'object') return;
    if (n.type === 'JSXElement' || n.type === 'JSXFragment') {
      found = true;
      return;
    }
    for (const key of Object.keys(n)) {
      if (key === 'loc' || key === 'leadingComments' || key === 'trailingComments') continue;
      const val = n[key];
      if (Array.isArray(val)) { for (const item of val) walk(item); }
      else if (val && typeof val === 'object' && val.type) walk(val);
      if (found) return;
    }
  }
  walk(node);
  return found;
}

function findJSXInReturn(stmt) {
  if (!stmt.argument) return null;
  let node = stmt.argument;
  while (node && node.type === 'ParenthesizedExpression') node = node.expression;
  if (node.type === 'JSXElement' || node.type === 'JSXFragment') return node;
  return null;
}
