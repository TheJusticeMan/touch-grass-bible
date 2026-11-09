/** @type {Set<string>} Array methods that mutate the receiver in-place. */
const MUTATING_METHODS = new Set([
  "push",
  "pop",
  "shift",
  "unshift",
  "splice",
  "sort",
  "reverse",
  "fill",
  "copyWithin",
]);

const COLOR_LITERAL_RE = /(^|[^-\w])(#(?:[0-9a-fA-F]{3,8})\b|rgba?\(|hsla?\()/;
const CUSTOM_PROPERTY_DEF_RE = /(^|\s|;|\{|\})(--[A-Za-z0-9_-]+)\s*:/g;
const CUSTOM_PROPERTY_USE_RE = /var\(\s*(--[A-Za-z0-9_-]+)(?:(\s*,)|\s*\))/g;

const RUNTIME_SET_CUSTOM_PROPERTIES = new Set([
  "--ui-gap",
  "--menu-x",
  "--menu-y",
  "--first-pane-offset",
  "--last-pane-offset",
  "--map-label-font-size",
  "--workspace-transition-timing-ease-out",
]);

function isAllowedColorLine(line) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith("/*") || trimmed.startsWith("*")) return true;
  if (trimmed.startsWith("--")) return true;
  if (trimmed.includes("var(")) return true;
  return false;
}

function collectDefinitions(content) {
  const definitions = new Map();
  for (const match of content.matchAll(CUSTOM_PROPERTY_DEF_RE)) {
    const propertyName = match[2];
    if (!propertyName || definitions.has(propertyName)) continue;
    definitions.set(propertyName, {
      index: match.index ?? 0,
      length: match[0].length,
    });
  }
  return definitions;
}

function collectReferences(content) {
  const references = new Set();
  for (const match of content.matchAll(CUSTOM_PROPERTY_USE_RE)) {
    const propertyName = match[1];
    if (propertyName) references.add(propertyName);
  }
  return references;
}

/** Returns true when `node` is a `.val` member access (e.g. `state.val`). */
function isValAccess(node) {
  return (
    node.type === "MemberExpression" &&
    !node.computed &&
    node.property.type === "Identifier" &&
    node.property.name === "val"
  );
}

/** Returns true when `node` is a `this` expression. */
function isThisExpression(node) {
  return node.type === "ThisExpression";
}

/**
 * Disallows in-place mutation of the array held inside a van.state value.
 *
 * Patterns caught:
 *   state.val.push(x)          - mutating method call
 *   state.val[0] = x           - computed index assignment
 *   state.val.length = 0       - length truncation
 */
export const noVanStateMutation = {
  meta: {
    type: "problem",
    docs: {
      description: "Disallow in-place mutation of van.state array values. Reassign state.val instead.",
    },
    messages: {
      mutatingMethod:
        ".{{method}}() mutates the van.state array in-place and bypasses reactivity. " +
        "Reassign: state.val = [...state.val, ...]",
      indexAssign:
        "Direct index assignment on a van.state array bypasses reactivity. " + "Reassign state.val instead.",
      lengthAssign:
        "Assigning to .length on a van.state array bypasses reactivity. " + "Reassign state.val instead.",
    },
  },
  create(context) {
    return {
      // state.val.push(...) / state.val.sort() / etc.
      CallExpression(node) {
        const { callee } = node;
        if (
          callee.type === "MemberExpression" &&
          !callee.computed &&
          callee.property.type === "Identifier" &&
          MUTATING_METHODS.has(callee.property.name) &&
          isValAccess(callee.object)
        ) {
          context.report({
            node,
            messageId: "mutatingMethod",
            data: { method: callee.property.name },
          });
        }
      },

      AssignmentExpression(node) {
        const { left } = node;
        if (left.type !== "MemberExpression") return;

        // state.val[i] = ...
        if (left.computed && isValAccess(left.object)) {
          context.report({ node, messageId: "indexAssign" });
          return;
        }

        // state.val.length = 0
        if (
          !left.computed &&
          left.property.type === "Identifier" &&
          left.property.name === "length" &&
          isValAccess(left.object)
        ) {
          context.report({ node, messageId: "lengthAssign" });
        }
      },
    };
  },
};

const FLUENT_METHOD_NAME_RE = /^(add|append|clear|prepend|register|remove|toggle|update)[A-Z_]/;

/**
 * Requires fluent mutator methods to return `this` unless they intentionally
 * return another value.
 */
export const fluentMethodsReturnThis = {
  meta: {
    type: "suggestion",
    docs: {
      description: "Require fluent mutator methods to return this when they do not return another value.",
    },
    messages: {
      missingReturn: "Fluent mutator methods should return `this` unless they return another explicit value.",
    },
  },
  create(context) {
    const sourceCode = context.sourceCode;
    const visitorKeys = sourceCode.visitorKeys;

    function analyzeReturns(node, state) {
      if (!node || state.stop) return;

      if (node.type === "ReturnStatement") {
        state.sawReturnStatement = true;
        if (!node.argument) {
          state.sawBareReturn = true;
        } else if (isThisExpression(node.argument)) {
          state.sawThisReturn = true;
        } else {
          state.sawExplicitNonThisReturn = true;
          state.stop = true;
        }
        return;
      }

      const keys = visitorKeys[node.type] ?? [];
      for (const key of keys) {
        const value = node[key];
        if (Array.isArray(value)) {
          for (const child of value) {
            if (child && typeof child.type === "string") analyzeReturns(child, state);
            if (state.stop) break;
          }
        } else if (value && typeof value.type === "string") {
          analyzeReturns(value, state);
        }
        if (state.stop) break;
      }
    }

    function analyzeMethod(node) {
      if (!node.key || node.key.type !== "Identifier") return null;
      if (node.accessibility === "private" || node.accessibility === "protected") return null;
      if (
        !node.value ||
        (node.value.type !== "FunctionExpression" && node.value.type !== "ArrowFunctionExpression")
      )
        return null;

      const state = {
        sawReturnStatement: false,
        sawBareReturn: false,
        sawThisReturn: false,
        sawExplicitNonThisReturn: false,
        stop: false,
      };

      analyzeReturns(node.value.body, state);

      return {
        node,
        name: node.key.name,
        ...state,
      };
    }

    function checkClass(node) {
      const methods = node.body.body
        .filter(element => element.type === "MethodDefinition")
        .map(element => analyzeMethod(element))
        .filter(Boolean);

      const isFluentClass = methods.some(method => method.sawThisReturn);
      if (!isFluentClass) return;

      for (const method of methods) {
        if (!FLUENT_METHOD_NAME_RE.test(method.name)) continue;
        if (method.sawExplicitNonThisReturn) continue;
        if (method.sawReturnStatement && !method.sawBareReturn && method.sawThisReturn) continue;
        context.report({ node: method.node.key, messageId: "missingReturn" });
      }
    }

    return {
      ClassDeclaration: checkClass,
      ClassExpression: checkClass,
    };
  },
};

/**
 * Lints the bundled CSS output for bundle-wide custom property hygiene.
 */
export const bundleCssVars = {
  meta: {
    type: "problem",
    docs: {
      description: "Check custom property definitions and uses in the bundled CSS output.",
    },
    messages: {
      rawColorLiteral: "raw color literal should be defined as a CSS variable",
      undefinedCustomProperty: "CSS variable {{name}} is used without being defined in the bundle",
      unusedCustomProperty: "CSS variable {{name}} is defined but not used in the bundle",
    },
  },
  create(context) {
    const sourceCode = context.sourceCode;
    const content = sourceCode.text;
    const lines = content.split(/\r?\n/);
    const allDefinitions = collectDefinitions(content);
    const allReferences = collectReferences(content);

    return {
      Program() {
        for (let index = 0; index < lines.length; index += 1) {
          const line = lines[index];
          if (isAllowedColorLine(line)) continue;
          if (!COLOR_LITERAL_RE.test(line)) continue;
          context.report({
            loc: {
              start: { line: index + 1, column: 0 },
              end: { line: index + 1, column: Math.max(line.length, 1) },
            },
            messageId: "rawColorLiteral",
          });
        }

        for (const [lineIndex, line] of lines.entries()) {
          for (const match of line.matchAll(CUSTOM_PROPERTY_USE_RE)) {
            const propertyName = match[1];
            const hasFallback = Boolean(match[2]);
            if (!propertyName) continue;
            if (
              allDefinitions.has(propertyName) ||
              hasFallback ||
              RUNTIME_SET_CUSTOM_PROPERTIES.has(propertyName)
            ) {
              continue;
            }

            const column = match.index ?? 0;
            context.report({
              loc: {
                start: { line: lineIndex + 1, column },
                end: { line: lineIndex + 1, column: column + match[0].length },
              },
              messageId: "undefinedCustomProperty",
              data: { name: propertyName },
            });
          }
        }

        for (const [propertyName, definition] of allDefinitions.entries()) {
          if (allReferences.has(propertyName) || RUNTIME_SET_CUSTOM_PROPERTIES.has(propertyName)) continue;

          const lineIndex = lines.findIndex(line => line.includes(propertyName));
          const lineNumber = lineIndex >= 0 ? lineIndex + 1 : 1;
          const line = lineIndex >= 0 ? lines[lineIndex] : "";
          const column = lineIndex >= 0 ? line.indexOf(propertyName) : 0;

          context.report({
            loc: {
              start: { line: lineNumber, column: column >= 0 ? column : definition.index },
              end: {
                line: lineNumber,
                column: (column >= 0 ? column : definition.index) + propertyName.length,
              },
            },
            messageId: "unusedCustomProperty",
            data: { name: propertyName },
          });
        }
      },
    };
  },
};

export default {
  rules: {
    "no-van-state-mutation": noVanStateMutation,
    "fluent-methods-return-this": fluentMethodsReturnThis,
    "bundle-css-vars": bundleCssVars,
  },
};
