import traverseModule from '@babel/traverse';

const traverse = traverseModule.default || traverseModule;

/**
 * Analyze AST to count frequency of component names and prop names.
 *
 * @param {object} ast - Babel AST
 * @returns {{ components: Map<string, number>, props: Map<string, number> }}
 */
export function analyze(ast) {
  const components = new Map();
  const props = new Map();
  const classes = new Map();

  traverse(ast, {
    JSXOpeningElement(path) {
      const nameNode = path.node.name;

      // Count component (simple identifiers starting with uppercase only)
      // Member expressions (Form.Input) are not aliased
      if (nameNode.type === 'JSXIdentifier' && /^[A-Z]/.test(nameNode.name)) {
        components.set(nameNode.name, (components.get(nameNode.name) ?? 0) + 1);
      }

      // Count props and collect class names
      for (const attr of path.node.attributes) {
        if (attr.type === 'JSXAttribute') {
          const propName = attr.name.type === 'JSXNamespacedName'
            ? `${attr.name.namespace.name}:${attr.name.name.name}`
            : attr.name.name;

          // Collect individual class names from static className strings
          if (propName === 'className') {
            const val = attr.value;
            if (val && val.type === 'StringLiteral') {
              for (const cls of val.value.split(/\s+/).filter(Boolean)) {
                classes.set(cls, (classes.get(cls) ?? 0) + 1);
              }
            }
            continue;
          }

          if (propName === 'id') continue;

          props.set(propName, (props.get(propName) ?? 0) + 1);
        }
      }
    },
  });

  return { components, props, classes };
}

function getComponentName(nameNode) {
  if (nameNode.type === 'JSXIdentifier') return nameNode.name;
  if (nameNode.type === 'JSXMemberExpression') {
    return `${getComponentName(nameNode.object)}.${nameNode.property.name}`;
  }
  return null;
}
