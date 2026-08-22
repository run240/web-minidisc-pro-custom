const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

async function main() {
  const electronVersion = require('electron/package.json').version;
  assert.equal(electronVersion, '43.4.1');

  const evaluatorPackage = JSON.parse(
    fs.readFileSync(
      path.join(path.dirname(require.resolve('expr-eval')), '..', 'package.json'),
      'utf8',
    ),
  );
  assert.equal(evaluatorPackage.name, 'expr-eval-fork');
  assert.equal(evaluatorPackage.version, '3.0.3');

  const { Parser } = require('expr-eval');
  assert.equal(Parser.evaluate('0x24 - 0x4'), 32);
  assert.throws(
    () => Parser.evaluate('callback()', { callback: () => 1 }),
    /allowed function/i,
  );
  assert.throws(() => Parser.evaluate('constructor'), /prototype access/i);

  const evaluatorUrl = pathToFileURL(
    path.join(
      __dirname,
      '..',
      'custom-overrides',
      'renderer',
      'assets',
      'safe-expression-evaluator.mjs',
    ),
  );
  const { evaluateArithmeticExpression } = await import(evaluatorUrl.href);
  assert.equal(evaluateArithmeticExpression('392 + 4'), 396);
  assert.equal(evaluateArithmeticExpression('0x24 - 0x4'), 32);
  assert.equal(evaluateArithmeticExpression('-(2 + 3) * 4'), -20);
  for (const unsafeExpression of [
    'constructor',
    'callback()',
    '1;globalThis.compromised=true',
    '1 / 0',
  ]) {
    assert.throws(() => evaluateArithmeticExpression(unsafeExpression));
  }

  console.log('Security dependency and expression evaluator tests: PASS');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
