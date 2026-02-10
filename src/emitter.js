/**
 * Walk a Babel AST and emit JSXN notation.
 *
 * @param {object} ast - Babel AST
 * @param {object} aliases - { components, props, classes } Maps
 * @param {string} code - original source code (used to slice expressions)
 * @returns {string} JSXN output
 */
export function emit(ast, aliases, code) {
  const ctx = {
    compAlias: aliases?.components ?? new Map(),
    propAlias: aliases?.props ?? new Map(),
    classAlias: aliases?.classes ?? new Map(),
    code,
  };
  const lines = [];

  for (const stmt of ast.program.body) {
    collectJSX(stmt, (node) => {
      emitNode(node, 0, lines, ctx);
    });
  }

  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function indent(level) {
  return ' '.repeat(level);
}

function collectJSX(node, callback) {
  if (!node) return;
  if (node.type === 'JSXElement' || node.type === 'JSXFragment') {
    callback(node);
    return;
  }
  if (node.type === 'ExpressionStatement') {
    collectJSX(node.expression, callback);
  } else if (node.type === 'ReturnStatement') {
    collectJSX(node.argument, callback);
  } else if (node.type === 'ParenthesizedExpression') {
    collectJSX(node.expression, callback);
  } else if (node.type === 'ExportDefaultDeclaration' || node.type === 'ExportNamedDeclaration') {
    collectJSX(node.declaration, callback);
  } else if (node.type === 'FunctionDeclaration' || node.type === 'FunctionExpression' || node.type === 'ArrowFunctionExpression') {
    collectJSXFromBlock(node.body, callback);
  } else if (node.type === 'VariableDeclaration') {
    for (const decl of node.declarations) {
      if (decl.init) collectJSX(decl.init, callback);
    }
  }
}

function collectJSXFromBlock(node, callback) {
  if (!node) return;
  if (node.type === 'BlockStatement') {
    for (const stmt of node.body) {
      collectJSX(stmt, callback);
    }
  } else {
    collectJSX(node, callback);
  }
}

function getTagName(nameNode, compAlias) {
  const rawName = getRawTagName(nameNode);
  return compAlias.get(rawName) ?? rawName;
}

function getRawTagName(nameNode) {
  if (nameNode.type === 'JSXIdentifier') return nameNode.name;
  if (nameNode.type === 'JSXMemberExpression') {
    return `${getRawTagName(nameNode.object)}.${nameNode.property.name}`;
  }
  if (nameNode.type === 'JSXNamespacedName') {
    return `${nameNode.namespace.name}:${nameNode.name.name}`;
  }
  return 'unknown';
}

/**
 * Emit a single JSX node (element or fragment) and its children.
 */
function emitNode(node, level, lines, ctx) {
  if (node.type === 'JSXFragment') {
    const children = getSignificantChildren(node.children);
    lines.push(`${indent(level)}_`);
    for (const child of children) emitNode(child, level + 1, lines, ctx);
    return;
  }

  if (node.type === 'JSXText') {
    const text = node.value.trim();
    if (text) lines.push(`${indent(level)}"${text}"`);
    return;
  }

  if (node.type === 'JSXExpressionContainer') {
    emitExpression(node, level, lines, ctx);
    return;
  }

  if (node.type === 'JSXSpreadChild') {
    const src = ctx.code.slice(node.argument.start, node.argument.end);
    lines.push(`${indent(level)}(...${src})`);
    return;
  }

  if (node.type !== 'JSXElement') return;

  const opening = node.openingElement;
  const tagName = getTagName(opening.name, ctx.compAlias);

  let classNames = null;
  let idValue = null;
  const otherProps = [];

  for (const attr of opening.attributes) {
    if (attr.type === 'JSXSpreadAttribute') {
      otherProps.push({ spread: true, node: attr });
      continue;
    }

    const propName = attr.name.type === 'JSXNamespacedName'
      ? `${attr.name.namespace.name}:${attr.name.name.name}`
      : attr.name.name;

    if (propName === 'className') {
      classNames = extractAttrValue(attr, ctx.code);
      continue;
    }
    if (propName === 'id') {
      idValue = extractAttrValue(attr, ctx.code);
      continue;
    }

    otherProps.push({ propName, attr });
  }

  // Build the tag line
  let line = tagName;

  // Append #id
  if (idValue !== null) {
    if (idValue.type === 'string') {
      line += `#${idValue.value}`;
    } else {
      line += `#{${idValue.value}}`;
    }
  }

  // Append .classes (applying class aliases)
  if (classNames !== null) {
    if (classNames.type === 'string') {
      const classes = classNames.value.split(/\s+/).filter(Boolean);
      for (const cls of classes) {
        line += `.${ctx.classAlias.get(cls) ?? cls}`;
      }
    } else {
      line += `.{${classNames.value}}`;
    }
  }

  // Append other props
  const propsStr = formatProps(otherProps, ctx.propAlias, ctx.code);
  if (propsStr) {
    line += ` ${propsStr}`;
  }

  // Process children
  const children = getSignificantChildren(node.children);

  if (children.length === 0) {
    lines.push(`${indent(level)}${line}`);
  } else if (children.length === 1 && isInlineChild(children[0])) {
    const child = children[0];
    if (child.type === 'JSXText') {
      lines.push(`${indent(level)}${line} "${child.value.trim()}"`);
    } else if (child.type === 'JSXExpressionContainer') {
      const expr = child.expression;
      if (expr.type === 'StringLiteral') {
        lines.push(`${indent(level)}${line} "${expr.value}"`);
      } else {
        const src = ctx.code.slice(expr.start, expr.end);
        lines.push(`${indent(level)}${line} (${src})`);
      }
    }
  } else {
    lines.push(`${indent(level)}${line}`);
    for (const child of children) {
      emitNode(child, level + 1, lines, ctx);
    }
  }
}

function emitExpression(node, level, lines, ctx) {
  const expr = node.expression;
  if (!expr || expr.type === 'JSXEmptyExpression') return;

  if (expr.type === 'LogicalExpression' && expr.operator === '&&' && isJSXNode(expr.right)) {
    const condSrc = ctx.code.slice(expr.left.start, expr.left.end);
    const jsxNode = unwrapParens(expr.right);
    const childLines = [];
    emitNode(jsxNode, 0, childLines, ctx);
    lines.push(`${indent(level)}?${condSrc} > ${childLines[0].trim()}`);
    for (let i = 1; i < childLines.length; i++) {
      lines.push(`${indent(level)} ${childLines[i]}`);
    }
    return;
  }

  if (expr.type === 'ConditionalExpression' && (isJSXNode(expr.consequent) || isJSXNode(expr.alternate))) {
    const condSrc = ctx.code.slice(expr.test.start, expr.test.end);
    const consNode = unwrapParens(expr.consequent);
    const altNode = unwrapParens(expr.alternate);

    if (isJSXNode(consNode) && isJSXNode(altNode)) {
      const consLines = [];
      emitNode(consNode, 0, consLines, ctx);
      const altLines = [];
      emitNode(altNode, 0, altLines, ctx);
      lines.push(`${indent(level)}?${condSrc} > ${consLines[0].trim()} | ${altLines[0].trim()}`);
      return;
    }
  }

  if (isMapExpression(expr)) {
    emitMapExpression(expr, level, lines, ctx);
    return;
  }

  const src = ctx.code.slice(expr.start, expr.end);
  lines.push(`${indent(level)}(${src})`);
}

function isMapExpression(expr) {
  return (
    expr.type === 'CallExpression' &&
    expr.callee.type === 'MemberExpression' &&
    expr.callee.property.name === 'map' &&
    expr.arguments.length >= 1
  );
}

function emitMapExpression(expr, level, lines, ctx) {
  const collectionSrc = ctx.code.slice(expr.callee.object.start, expr.callee.object.end);
  const callback = expr.arguments[0];
  const jsxBody = getMapCallbackJSX(callback);

  if (jsxBody) {
    const childLines = [];
    emitNode(jsxBody, 0, childLines, ctx);
    lines.push(`${indent(level)}*${collectionSrc} > ${childLines[0].trim()}`);
    for (let i = 1; i < childLines.length; i++) {
      lines.push(`${indent(level)} ${childLines[i]}`);
    }
  } else {
    const src = ctx.code.slice(expr.start, expr.end);
    lines.push(`${indent(level)}(${src})`);
  }
}

function getMapCallbackJSX(callback) {
  if (!callback) return null;
  if (callback.type === 'ArrowFunctionExpression' || callback.type === 'FunctionExpression') {
    const body = callback.body;
    if (body.type === 'JSXElement' || body.type === 'JSXFragment') return body;
    if (body.type === 'ParenthesizedExpression') {
      const inner = body.expression;
      if (inner.type === 'JSXElement' || inner.type === 'JSXFragment') return inner;
    }
    if (body.type === 'BlockStatement') {
      for (const stmt of body.body) {
        if (stmt.type === 'ReturnStatement' && stmt.argument) {
          const arg = unwrapParens(stmt.argument);
          if (arg.type === 'JSXElement' || arg.type === 'JSXFragment') return arg;
        }
      }
    }
  }
  return null;
}

function unwrapParens(node) {
  while (node && node.type === 'ParenthesizedExpression') node = node.expression;
  return node;
}

function isJSXNode(node) {
  const n = unwrapParens(node);
  return n && (n.type === 'JSXElement' || n.type === 'JSXFragment');
}

function getSignificantChildren(children) {
  return children.filter((child) => {
    if (child.type === 'JSXText') return child.value.trim().length > 0;
    if (child.type === 'JSXExpressionContainer' && child.expression.type === 'JSXEmptyExpression') return false;
    return true;
  });
}

function isInlineChild(child) {
  if (child.type === 'JSXText') return true;
  if (child.type === 'JSXExpressionContainer') {
    const expr = child.expression;
    if (expr.type === 'LogicalExpression' && expr.operator === '&&' && isJSXNode(expr.right)) return false;
    if (expr.type === 'ConditionalExpression' && (isJSXNode(expr.consequent) || isJSXNode(expr.alternate))) return false;
    if (isMapExpression(expr)) return false;
    if (isJSXNode(expr)) return false;
    return true;
  }
  return false;
}

function extractAttrValue(attr, code) {
  const val = attr.value;
  if (!val) return { type: 'boolean', value: true };
  if (val.type === 'StringLiteral') return { type: 'string', value: val.value };
  if (val.type === 'JSXExpressionContainer') {
    const expr = val.expression;
    if (expr.type === 'StringLiteral') return { type: 'string', value: expr.value };
    return { type: 'expression', value: code.slice(expr.start, expr.end) };
  }
  return { type: 'string', value: String(val.value ?? '') };
}

function formatProps(props, propAlias, code) {
  if (props.length === 0) return '';
  const parts = [];
  for (const p of props) {
    if (p.spread) {
      parts.push(`...${code.slice(p.node.argument.start, p.node.argument.end)}`);
      continue;
    }
    const alias = propAlias.get(p.propName) ?? p.propName;
    const val = extractAttrValue(p.attr, code);
    if (val.type === 'boolean') { parts.push(alias); continue; }
    parts.push(`${alias}:${val.value}`);
  }
  return `{${parts.join(', ')}}`;
}
