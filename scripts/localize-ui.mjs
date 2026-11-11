import { parse } from "@babel/parser";
import traversePackage from "@babel/traverse";
import generatorPackage from "@babel/generator";
import * as b from "@babel/types";
const traverse = traversePackage.default ?? traversePackage,
  generate = generatorPackage.default ?? generatorPackage;
const uiAttributes = new Set([
  "title",
  "placeholder",
  "aria-label",
  "alt",
  "label",
  "description",
  "eyebrow",
  "subtitle",
  "emptyText",
  "emptyMessage",
  "caption",
]);
const uiNames = new Set([
  "label",
  "title",
  "subtitle",
  "description",
  "eyebrow",
  "error",
  "formError",
  "notice",
  "message",
  "currentPage",
  "status",
  "category",
  "folderLabel",
  "planName",
  "roleLabel",
  "emptyMessage",
  "emptyText",
  "nameLabel",
  "toast",
  "fact",
]);
const uiMembers = new Set([
  "label",
  "title",
  "subtitle",
  "description",
  "status",
  "category",
  "message",
  "hint",
  "reason",
  "error",
  "notice",
  "detail",
  "position",
]);
function rootIdentifier(node) {
  while (b.isMemberExpression(node) || b.isOptionalMemberExpression(node))
    node = node.object;
  return b.isIdentifier(node) ? node.name : "";
}
function knownUi(node) {
  if (b.isIdentifier(node))
    return (
      uiNames.has(node.name) ||
      /(?:Label|Message|Error|Notice)$/.test(node.name)
    );
  if (b.isMemberExpression(node) || b.isOptionalMemberExpression(node)) {
    if (
      node.computed &&
      b.isIdentifier(node.object) &&
      (/(?:Labels|Names|Categories|Folders|Statuses|States|Reasons)$/.test(
        node.object.name,
      ) ||
        ["categories", "roles", "descriptions", "fiscalTerritories"].includes(
          node.object.name,
        ))
    )
      return true;
    if (!node.computed && b.isIdentifier(node.property)) {
      const property = node.property.name,
        root = rootIdentifier(node.object);
      // Only plan/option names are UI; attachment and customer names remain original.
      if (property === "name") return ["plan", "option", "p"].includes(root);
      // Do not translate names, document titles/descriptions or other authored data.
      if (
        [
          "label",
          "title",
          "subtitle",
          "description",
          "name",
          "hint",
          "reason",
          "detail",
        ].includes(property)
      ) {
        return [
          "insight",
          "option",
          "plan",
          "feature",
          "setting",
          "module",
          "content",
          "item",
          "p",
          "f",
          "m",
          "info",
          "alert",
          "w",
          "change",
          "fiscalOptions",
          "trend",
          "delta",
        ].includes(root);
      }
      return uiMembers.has(property);
    }
  }
  return false;
}
function cleanText(raw) {
  const lines = raw.split(/\r\n|\n|\r/);
  let last = 0;
  for (let i = 0; i < lines.length; i++) if (/\S/.test(lines[i])) last = i;
  let result = "";
  for (let i = 0; i < lines.length; i++) {
    let line = lines[i].replace(/\t/g, " ");
    if (i !== 0) line = line.replace(/^ +/, "");
    if (i !== lines.length - 1) line = line.replace(/ +$/, "");
    if (line) {
      result += line;
      if (i !== last) result += " ";
    }
  }
  return result;
}
export function localizeUi() {
  return {
    name: "truckcontrol-interface-locales",
    enforce: "pre",
    transform(code, id) {
      const filename = id.split("?")[0].replaceAll("\\", "/");
      if (
        !/\/src\/.*\.[jt]sx?$/.test(filename) ||
        filename.includes("/src/i18n/") ||
        /\.test\.[jt]sx?$/.test(filename)
      )
        return null;
      const ast = parse(code, {
        sourceType: "module",
        plugins: ["typescript", ...(filename.endsWith("tsx") ? ["jsx"] : [])],
      });
      let changed = false;
      const call = (value, params) => {
        changed = true;
        return b.callExpression(b.identifier("__tcText"), [
          value,
          ...(params ? [b.arrayExpression(params)] : []),
        ]);
      };
      function translate(node, dynamic = false) {
        if (b.isStringLiteral(node))
          return /[A-Za-zÁÉÍÓÚÑáéíóúñ]/.test(node.value) ? call(node) : node;
        if (b.isTemplateLiteral(node)) {
          const text = node.quasis
            .map(
              (q, i) =>
                (q.value.cooked ?? q.value.raw) +
                (i < node.expressions.length ? `{${i}}` : ""),
            )
            .join("");
          if (!/[A-Za-zÁÉÍÓÚÑáéíóúñ]/.test(text)) return node;
          return call(
            b.stringLiteral(text),
            node.expressions.map((x) => (knownUi(x) ? call(x) : x)),
          );
        }
        if (b.isConditionalExpression(node)) {
          node.consequent = translate(node.consequent, dynamic);
          node.alternate = translate(node.alternate, dynamic);
          return node;
        }
        if (b.isLogicalExpression(node)) {
          if (knownUi(node.left)) node.left = call(node.left);
          node.right = translate(node.right, dynamic);
          return node;
        }
        if (knownUi(node)) return call(node);
        if (
          b.isCallExpression(node) &&
          b.isIdentifier(node.callee) &&
          /(?:Label|Message)$/.test(node.callee.name)
        )
          return call(node);
        return node;
      }
      traverse(ast, {
        JSXText(path) {
          const text = cleanText(path.node.value);
          if (/[A-Za-zÁÉÍÓÚÑáéíóúñ]/.test(text))
            path.replaceWith(
              b.jsxExpressionContainer(call(b.stringLiteral(text))),
            );
        },
        JSXAttribute(path) {
          const name = path.node.name?.name;
          if (!uiAttributes.has(name)) return;
          if (b.isStringLiteral(path.node.value))
            path.node.value = b.jsxExpressionContainer(
              translate(path.node.value),
            );
          else if (b.isJSXExpressionContainer(path.node.value)) {
            const expression = path.node.value.expression;
            path.node.value.expression =
              ["label", "eyebrow"].includes(name) && b.isIdentifier(expression)
                ? call(expression)
                : translate(expression, true);
          }
        },
        JSXExpressionContainer(path) {
          if (path.parentPath.isJSXAttribute()) return;
          const expression = path.node.expression;
          const parentName =
            path.parentPath.isJSXElement() &&
            path.parentPath.node.openingElement.name;
          const optionLabel =
            b.isJSXIdentifier(parentName, { name: "option" }) &&
            b.isIdentifier(expression) &&
            ["v", "l", "name"].includes(expression.name);
          const legalText =
            /\/(?:LegalPage|PublicPortal)\.tsx$/.test(filename) &&
            b.isMemberExpression(expression) &&
            !expression.computed &&
            b.isIdentifier(expression.property) &&
            ["text", "title"].includes(expression.property.name);
          const dashboardLabel =
            /\/(?:DashboardExperience|AdminConsole)\.tsx$/.test(filename) &&
            b.isMemberExpression(expression) &&
            !expression.computed &&
            b.isIdentifier(expression.property, { name: "label" });
          const providerDetail =
            filename.endsWith("/ProviderSetup.tsx") &&
            b.isMemberExpression(expression) &&
            !expression.computed &&
            b.isIdentifier(expression.property) &&
            ["name", "detail"].includes(expression.property.name);
          path.node.expression =
            optionLabel || legalText || providerDetail || dashboardLabel
              ? call(expression)
              : translate(expression);
        },
        NewExpression(path) {
          const n = path.node;
          if (
            !b.isMemberExpression(n.callee) ||
            !b.isIdentifier(n.callee.object, { name: "Intl" }) ||
            !b.isIdentifier(n.callee.property) ||
            !b.isStringLiteral(n.arguments[0], { value: "es-ES" })
          )
            return;
          const name = n.callee.property.name;
          if (!["NumberFormat", "DateTimeFormat"].includes(name)) return;
          changed = true;
          path.replaceWith(
            b.callExpression(
              b.identifier(
                name === "NumberFormat" ? "__tcNumberFormat" : "__tcDateFormat",
              ),
              n.arguments.slice(1),
            ),
          );
        },
        CallExpression(path) {
          const n = path.node;
          if (
            b.isMemberExpression(n.callee) &&
            b.isIdentifier(n.callee.property)
          ) {
            const name = n.callee.property.name;
            if (
              [
                "toLocaleString",
                "toLocaleDateString",
                "toLocaleTimeString",
              ].includes(name) &&
              b.isStringLiteral(n.arguments[0], { value: "es-ES" })
            ) {
              changed = true;
              n.arguments[0] = b.callExpression(b.identifier("__tcLocale"), []);
            }
            if (
              name === "localeCompare" &&
              b.isStringLiteral(n.arguments[1]) &&
              ["es", "es-ES"].includes(n.arguments[1].value)
            ) {
              changed = true;
              n.arguments[1] = b.callExpression(b.identifier("__tcLocale"), []);
            }
            if (
              b.isIdentifier(n.callee.object, { name: "window" }) &&
              ["confirm", "alert"].includes(name) &&
              n.arguments[0]
            )
              n.arguments[0] = translate(n.arguments[0]);
          }
        },
      });
      if (!changed) return null;
      ast.program.body.unshift(
        b.importDeclaration(
          [
            b.importSpecifier(b.identifier("__tcText"), b.identifier("t")),
            b.importSpecifier(
              b.identifier("__tcLocale"),
              b.identifier("currentLocale"),
            ),
            b.importSpecifier(
              b.identifier("__tcNumberFormat"),
              b.identifier("localizedNumberFormat"),
            ),
            b.importSpecifier(
              b.identifier("__tcDateFormat"),
              b.identifier("localizedDateFormat"),
            ),
          ],
          b.stringLiteral("/src/i18n/runtime"),
        ),
      );
      return generate(
        ast,
        { sourceMaps: true, sourceFileName: filename, retainLines: true },
        code,
      );
    },
  };
}
