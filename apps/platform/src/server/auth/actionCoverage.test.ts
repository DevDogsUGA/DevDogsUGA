import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import ts from "typescript";
import { expect, it } from "vitest";

/** Every browser-callable action declares its Access rule or public reason. */
it("every exported async server action declares its access", () => {
  const missing: string[] = [];
  function scan(dir: string) {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) {
        scan(path);
        continue;
      }
      if (!/\.tsx?$/.test(path)) continue;
      const source = readFileSync(path, "utf8");
      const file = ts.createSourceFile(
        path,
        source,
        ts.ScriptTarget.Latest,
        true,
      );
      if (
        !file.statements.some(
          (node) =>
            ts.isExpressionStatement(node) &&
            ts.isStringLiteral(node.expression) &&
            node.expression.text === "use server",
        )
      )
        continue;
      function check(
        name: string,
        node: ts.FunctionDeclaration | ts.ArrowFunction | ts.FunctionExpression,
      ) {
        if (
          !node.modifiers?.some((m) => m.kind === ts.SyntaxKind.AsyncKeyword)
        ) {
          missing.push(`${path}:${name}: action must be async`);
          return;
        }
        const body = node.body?.getText(file) ?? "";
        if (!/\b(?:authorize|authorizeSession|publicAction)\s*\(/.test(body))
          missing.push(`${entry.name}:${name}`);
        if (/\bpublicAction\s*\(/.test(body) && !/\/\/ Public: .+/.test(body))
          missing.push(`${entry.name}: missing public reason`);
      }
      for (const node of file.statements) {
        if (ts.isExportDeclaration(node)) {
          if (!node.isTypeOnly)
            missing.push(`${path}: value re-export needs explicit coverage`);
          continue;
        }
        if (ts.isExportAssignment(node)) {
          if (
            ts.isArrowFunction(node.expression) ||
            ts.isFunctionExpression(node.expression)
          )
            check("default", node.expression);
          else missing.push(`${path}: unrecognized default action export`);
          continue;
        }
        if (
          !ts.canHaveModifiers(node) ||
          !ts
            .getModifiers(node)
            ?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword)
        )
          continue;
        if (ts.isFunctionDeclaration(node))
          check(node.name?.text ?? "default", node);
        if (ts.isVariableStatement(node)) {
          for (const declaration of node.declarationList.declarations) {
            const initializer = declaration.initializer;
            if (
              initializer &&
              (ts.isArrowFunction(initializer) ||
                ts.isFunctionExpression(initializer))
            )
              check(declaration.name.getText(file), initializer);
            else
              missing.push(
                `${path}:${declaration.name.getText(file)}: unrecognized action export`,
              );
          }
        }
      }
    }
  }
  scan(join(process.cwd(), "src"));
  expect(missing).toEqual([]);
});
