import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';

const root = path.resolve('src');
const normalize = (p: string) => p.replaceAll('\\', '/');
function files(dir: string): string[] {
  return fs
    .readdirSync(dir, { withFileTypes: true })
    .flatMap((e) =>
      e.isDirectory()
        ? files(path.join(dir, e.name))
        : /\.tsx?$/.test(e.name)
          ? [path.join(dir, e.name)]
          : [],
    );
}
const sources = files(root);
function resolve(from: string, spec: string) {
  const base = spec.startsWith('@')
    ? spec.replace(/^@(core|features|shared)\//, `${normalize(root)}/$1/`)
    : spec.startsWith('.')
      ? path.resolve(path.dirname(from), spec)
      : null;
  if (!base) return null;
  const resolved =
    [
      base,
      base + '.ts',
      base + '.tsx',
      path.join(base, 'index.ts'),
      path.join(base, 'index.tsx'),
    ].find((p) => fs.existsSync(p) && fs.statSync(p).isFile()) ?? null;
  return resolved ? path.resolve(resolved) : null;
}
const graph = new Map<string, string[]>();
const violations: string[] = [];
for (const file of sources) {
  const source = ts.createSourceFile(
    file,
    fs.readFileSync(file, 'utf8'),
    ts.ScriptTarget.Latest,
    true,
  );
  const from = normalize(path.relative(root, file));
  const ownFeature = from.match(/^features\/([^/]+)\//)?.[1];
  const edges: string[] = [];
  for (const node of source.statements) {
    if (!ts.isImportDeclaration(node) && !ts.isExportDeclaration(node))
      continue;
    if (!node.moduleSpecifier || !ts.isStringLiteral(node.moduleSpecifier))
      continue;
    const spec = node.moduleSpecifier.text;
    const target = resolve(file, spec);
    if (!target) continue;
    const to = normalize(path.relative(root, target));
    const typeOnly = ts.isImportDeclaration(node)
      ? node.importClause?.isTypeOnly
      : node.isTypeOnly;
    if (!typeOnly) edges.push(target);
    if (to.startsWith('app/'))
      violations.push(`${from}: imports a route (${to})`);
    if (from.startsWith('shared/') && !to.startsWith('shared/'))
      violations.push(`${from}: shared code depends on ${to}`);
    const otherFeature = to.match(/^features\/([^/]+)\//)?.[1];
    if (
      ownFeature &&
      otherFeature &&
      ownFeature !== otherFeature &&
      !/^features\/[^/]+\/(index|ui|export)\.tsx?$/.test(to)
    )
      violations.push(`${from}: reaches inside another feature (${to})`);
    if (
      from.includes('/model/') &&
      !typeOnly &&
      (to.includes('/screens/') ||
        to.includes('/components/') ||
        to.startsWith('core/') ||
        to.startsWith('shared/ui/'))
    )
      violations.push(`${from}: model depends on UI/runtime wiring (${to})`);
    if (
      from.startsWith('core/state/') &&
      (to.includes('/screens/') || to.includes('/components/'))
    )
      violations.push(`${from}: state composition loads UI (${to})`);
  }
  graph.set(file, edges);
}
test('module boundaries keep routes, shared code and feature internals separated', () =>
  assert.deepEqual(violations, []));
test('runtime modules have no circular dependencies', () => {
  const visited = new Set<string>();
  const active = new Set<string>();
  const chain: string[] = [];
  function visit(file: string) {
    if (active.has(file))
      assert.fail(
        'Dependency cycle: ' +
          [...chain, file]
            .map((p) => normalize(path.relative(root, p)))
            .join(' -> '),
      );
    if (visited.has(file)) return;
    active.add(file);
    chain.push(file);
    for (const next of graph.get(file) ?? []) visit(next);
    chain.pop();
    active.delete(file);
    visited.add(file);
  }
  for (const file of sources) visit(file);
});
