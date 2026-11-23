const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');

process.env.ADMIN_TOKEN = 'senha-de-teste';

const app = require('../src/app');
const pool = require('../src/db');

let servidor;
let base;

before(() => {
  servidor = app.listen(0);
  base = 'http://127.0.0.1:' + servidor.address().port;
});

after(async () => {
  await pool.query("DELETE FROM pedido_itens WHERE pedido_id IN (SELECT id FROM pedidos WHERE cliente = 'Cliente de Teste')");
  await pool.query("DELETE FROM pedidos WHERE cliente = 'Cliente de Teste'");
  await pool.query("DELETE FROM itens WHERE nome LIKE 'Teste:%'");
  servidor.closeAllConnections();
  servidor.close();
  await pool.end();
});

function enviar(rota, metodo, corpo, comSenha) {
  const headers = { 'Content-Type': 'application/json' };
  if (comSenha) headers['X-Admin-Token'] = 'senha-de-teste';
  return fetch(base + rota, {
    method: metodo,
    headers,
    body: corpo ? JSON.stringify(corpo) : undefined,
  });
}

test('/health confirma aplicação e banco', async () => {
  const res = await enviar('/health', 'GET');
  assert.equal(res.status, 200);
  const dados = await res.json();
  assert.equal(dados.banco, 'ok');
});

test('/api/cardapio devolve itens do banco', async () => {
  const res = await enviar('/api/cardapio', 'GET');
  assert.equal(res.status, 200);
  const itens = await res.json();
  assert.ok(itens.length > 0);
});

test('fluxo completo: criar item, fazer pedido e aprovar', async () => {
  const novo = await enviar('/api/admin/itens', 'POST', { nome: 'Teste: item novo', preco_centavos: 700 }, true);
  assert.equal(novo.status, 201);
  const item = await novo.json();

  const pedidoRes = await enviar('/api/pedidos', 'POST', {
    cliente: 'Cliente de Teste',
    itens: [{ id: item.id, quantidade: 2 }],
  });
  assert.equal(pedidoRes.status, 201);
  const pedido = await pedidoRes.json();
  assert.equal(pedido.total_centavos, 1400);
  assert.equal(pedido.status, 'aguardando');

  const consulta = await (await enviar('/api/pedidos/' + pedido.id, 'GET')).json();
  assert.equal(consulta.cliente, 'Cliente de Teste');
  assert.equal(consulta.itens[0].quantidade, 2);

  const aprovado = await enviar('/api/admin/pedidos/' + pedido.id, 'PATCH', { status: 'aprovado' }, true);
  assert.equal(aprovado.status, 200);
  assert.equal((await aprovado.json()).status, 'aprovado');

  const pulo = await enviar('/api/admin/pedidos/' + pedido.id, 'PATCH', { status: 'entregue' }, true);
  assert.equal(pulo.status, 400);
});

test('pedido sem itens é recusado', async () => {
  const res = await enviar('/api/pedidos', 'POST', { cliente: 'Cliente de Teste', itens: [] });
  assert.equal(res.status, 400);
});

test('item tirado do cardápio não pode ser pedido', async () => {
  const novo = await (await enviar('/api/admin/itens', 'POST', { nome: 'Teste: item sumido', preco_centavos: 300 }, true)).json();
  await enviar('/api/admin/itens/' + novo.id, 'PATCH', { disponivel: false }, true);

  const res = await enviar('/api/pedidos', 'POST', { cliente: 'Cliente de Teste', itens: [{ id: novo.id, quantidade: 1 }] });
  assert.equal(res.status, 400);
});

test('rotas do admin exigem a senha', async () => {
  const res = await enviar('/api/admin/pedidos', 'GET');
  assert.equal(res.status, 401);
});
