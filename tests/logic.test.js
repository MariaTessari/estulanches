const test = require('node:test');
const assert = require('node:assert/strict');
const { podeMudarStatus, validarNomeCompleto, validarItem, calcularPedido } = require('../src/logic');

const cardapio = [
  { id: 1, nome: 'Coxinha', preco_centavos: 600, disponivel: true },
  { id: 2, nome: 'Suco', preco_centavos: 550, disponivel: true },
  { id: 3, nome: 'Bolo', preco_centavos: 500, disponivel: false },
];

test('calcula o total de um pedido com vários itens', () => {
  const r = calcularPedido([{ id: 1, quantidade: 2 }, { id: 2, quantidade: 1 }], cardapio);
  assert.equal(r.erros.length, 0);
  assert.equal(r.total, 2 * 600 + 550);
});

test('recusa pedido sem itens', () => {
  assert.ok(calcularPedido([], cardapio).erros.length > 0);
});

test('recusa item que não existe ou está indisponível', () => {
  assert.ok(calcularPedido([{ id: 99, quantidade: 1 }], cardapio).erros.length > 0);
  assert.ok(calcularPedido([{ id: 3, quantidade: 1 }], cardapio).erros.length > 0);
});

test('recusa quantidade fora do limite', () => {
  assert.ok(calcularPedido([{ id: 1, quantidade: 0 }], cardapio).erros.length > 0);
  assert.ok(calcularPedido([{ id: 1, quantidade: 11 }], cardapio).erros.length > 0);
});

test('aceita nome completo e arruma os espaços', () => {
  const r = validarNomeCompleto('  Maria   da Silva ');
  assert.equal(r.valido, true);
  assert.equal(r.nome, 'Maria da Silva');
  assert.equal(validarNomeCompleto("Ana D'Ávila-Souza").valido, true);
});

test('recusa nome sem sobrenome, vazio ou com números', () => {
  assert.equal(validarNomeCompleto('Maria').valido, false);
  assert.equal(validarNomeCompleto('').valido, false);
  assert.equal(validarNomeCompleto(undefined).valido, false);
  assert.equal(validarNomeCompleto('Maria 123').valido, false);
  assert.equal(validarNomeCompleto('M S').valido, false);
});

test('valida item novo do cardápio', () => {
  assert.equal(validarItem({ nome: 'Pastel', preco_centavos: 700 }).erros.length, 0);
  assert.ok(validarItem({ nome: 'P', preco_centavos: 700 }).erros.length > 0);
  assert.ok(validarItem({ nome: 'Pastel', preco_centavos: -5 }).erros.length > 0);
  assert.ok(validarItem({ nome: 'Pastel', preco_centavos: null }).erros.length > 0);
});

test('o status do pedido só segue a ordem certa', () => {
  assert.equal(podeMudarStatus('aguardando', 'aprovado'), true);
  assert.equal(podeMudarStatus('aprovado', 'preparando'), true);
  assert.equal(podeMudarStatus('aguardando', 'entregue'), false);
  assert.equal(podeMudarStatus('entregue', 'aprovado'), false);
});