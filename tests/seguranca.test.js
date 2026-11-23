const test = require('node:test');
const assert = require('node:assert/strict');
const { limitador, senhaCorreta, cabecalhosSeguros, gerarCodigo } = require('../src/seguranca');

test('o limitador bloqueia depois do máximo de tentativas', () => {
  const l = limitador(3, 1000);
  for (let i = 0; i < 3; i++) {
    assert.equal(l.bloqueado('1.1.1.1'), false);
    l.registrar('1.1.1.1');
  }
  assert.equal(l.bloqueado('1.1.1.1'), true);
  assert.equal(l.bloqueado('2.2.2.2'), false);
});

test('o limitador libera de novo depois do tempo', async () => {
  const l = limitador(1, 30);
  l.registrar('1.1.1.1');
  assert.equal(l.bloqueado('1.1.1.1'), true);
  await new Promise((resolve) => setTimeout(resolve, 60));
  assert.equal(l.bloqueado('1.1.1.1'), false);
});

test('confere a senha do admin', () => {
  assert.equal(senhaCorreta('abc123', 'abc123'), true);
  assert.equal(senhaCorreta('abc124', 'abc123'), false);
  assert.equal(senhaCorreta(undefined, 'abc123'), false);
});

test('o código do pedido tem 8 caracteres e muda a cada pedido', () => {
  const a = gerarCodigo();
  const b = gerarCodigo();
  assert.match(a, /^[A-F0-9]{8}$/);
  assert.notEqual(a, b);
});

test('os cabeçalhos de segurança são aplicados', () => {
  const enviados = {};
  const res = { set: (nome, valor) => { enviados[nome] = valor; } };
  let seguiu = false;
  cabecalhosSeguros({}, res, () => { seguiu = true; });
  assert.equal(seguiu, true);
  assert.equal(enviados['X-Content-Type-Options'], 'nosniff');
  assert.equal(enviados['X-Frame-Options'], 'DENY');
  assert.ok(enviados['Content-Security-Policy']);
});