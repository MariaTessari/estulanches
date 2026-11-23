const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');

process.env.ADMIN_TOKEN = 'senha-de-teste';

const app = require('../src/app');
const pool = require('../src/db');

const CLIENTE = 'Cliente de Teste';

let servidor;
let base;

before(() => {
  servidor = app.listen(0);
  base = 'http://127.0.0.1:' + servidor.address().port;
});

after(async () => {
  await pool.query("DELETE FROM pedido_itens WHERE pedido_id IN (SELECT id FROM pedidos WHERE cliente = $1)", [CLIENTE]);
  await pool.query('DELETE FROM pedidos WHERE cliente = $1', [CLIENTE]);
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

async function criarItem(nome, preco) {
  const res = await enviar('/api/admin/itens', 'POST', { nome, preco_centavos: preco }, true);
  assert.equal(res.status, 201);
  return res.json();
}

test('/health confirma aplicação e banco', async () => {
  const res = await enviar('/health', 'GET');
  assert.equal(res.status, 200);
  const dados = await res.json();
  assert.equal(dados.banco, 'ok');
});

test('as respostas trazem cabeçalhos de segurança', async () => {
  const res = await enviar('/health', 'GET');
  assert.equal(res.headers.get('x-content-type-options'), 'nosniff');
  assert.equal(res.headers.get('x-frame-options'), 'DENY');
  assert.ok(res.headers.get('content-security-policy'));
  assert.equal(res.headers.get('x-powered-by'), null);
});

test('/api/cardapio devolve itens do banco', async () => {
  const res = await enviar('/api/cardapio', 'GET');
  assert.equal(res.status, 200);
  const itens = await res.json();
  assert.ok(itens.length > 0);
});

test('fluxo completo: criar item, fazer pedido, acompanhar e aprovar', async () => {
  const item = await criarItem('Teste: item novo', 700);

  const pedidoRes = await enviar('/api/pedidos', 'POST', {
    cliente: CLIENTE,
    itens: [{ id: item.id, quantidade: 2 }],
  });
  assert.equal(pedidoRes.status, 201);
  const pedido = await pedidoRes.json();
  assert.equal(pedido.total_centavos, 1400);
  assert.equal(pedido.status, 'aguardando');
  assert.match(pedido.codigo, /^[A-F0-9]{8}$/);

  const consulta = await (await enviar('/api/pedidos/' + pedido.codigo, 'GET')).json();
  assert.equal(consulta.cliente, CLIENTE);
  assert.equal(consulta.itens[0].quantidade, 2);

  const aprovado = await enviar('/api/admin/pedidos/' + pedido.id, 'PATCH', { status: 'aprovado' }, true);
  assert.equal(aprovado.status, 200);
  assert.equal((await aprovado.json()).status, 'aprovado');

  const pulo = await enviar('/api/admin/pedidos/' + pedido.id, 'PATCH', { status: 'entregue' }, true);
  assert.equal(pulo.status, 400);
});

test('pedido exige nome completo', async () => {
  const item = await criarItem('Teste: item nome', 300);
  const res = await enviar('/api/pedidos', 'POST', {
    cliente: 'Maria',
    itens: [{ id: item.id, quantidade: 1 }],
  });
  assert.equal(res.status, 400);
});

test('o pedido de outra pessoa não pode ser visto pelo número', async () => {
  const item = await criarItem('Teste: item privado', 300);
  const pedido = await (await enviar('/api/pedidos', 'POST', {
    cliente: CLIENTE,
    itens: [{ id: item.id, quantidade: 1 }],
  })).json();

  assert.equal((await enviar('/api/pedidos/' + pedido.id, 'GET')).status, 404);
  assert.equal((await enviar('/api/pedidos/AAAAAAAA', 'GET')).status, 404);
});

test('editar item atualiza nome e preço no cardápio', async () => {
  const item = await criarItem('Teste: item antes', 500);

  const edicao = await enviar('/api/admin/itens/' + item.id, 'PUT', { nome: 'Teste: item depois', preco_centavos: 650 }, true);
  assert.equal(edicao.status, 200);

  const cardapio = await (await enviar('/api/cardapio', 'GET')).json();
  const achado = cardapio.find((i) => i.id === item.id);
  assert.equal(achado.nome, 'Teste: item depois');
  assert.equal(achado.preco_centavos, 650);

  const invalida = await enviar('/api/admin/itens/' + item.id, 'PUT', { nome: 'X', preco_centavos: 0 }, true);
  assert.equal(invalida.status, 400);
});

test('excluir item tira do cardápio mas mantém o pedido antigo', async () => {
  const item = await criarItem('Teste: item excluído', 400);
  const pedido = await (await enviar('/api/pedidos', 'POST', {
    cliente: CLIENTE,
    itens: [{ id: item.id, quantidade: 1 }],
  })).json();

  const exclusao = await enviar('/api/admin/itens/' + item.id, 'DELETE', undefined, true);
  assert.equal(exclusao.status, 200);

  const cardapio = await (await enviar('/api/cardapio', 'GET')).json();
  assert.equal(cardapio.some((i) => i.id === item.id), false);

  const lista = await (await enviar('/api/admin/itens', 'GET', undefined, true)).json();
  assert.equal(lista.some((i) => i.id === item.id), false);

  const consulta = await (await enviar('/api/pedidos/' + pedido.codigo, 'GET')).json();
  assert.equal(consulta.itens[0].nome, 'Teste: item excluído');

  const outra = await enviar('/api/admin/itens/' + item.id, 'DELETE', undefined, true);
  assert.equal(outra.status, 404);
});

test('item tirado do cardápio não pode ser pedido', async () => {
  const item = await criarItem('Teste: item sumido', 300);
  await enviar('/api/admin/itens/' + item.id, 'PATCH', { disponivel: false }, true);

  const res = await enviar('/api/pedidos', 'POST', {
    cliente: CLIENTE,
    itens: [{ id: item.id, quantidade: 1 }],
  });
  assert.equal(res.status, 400);
});

test('JSON quebrado volta erro 400, não 500', async () => {
  const res = await fetch(base + '/api/admin/itens', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Admin-Token': 'senha-de-teste' },
    body: '{ quebrado',
  });
  assert.equal(res.status, 400);
});

test('rotas do admin exigem a senha certa', async () => {
  const semSenha = await enviar('/api/admin/pedidos', 'GET');
  assert.equal(semSenha.status, 401);

  const errada = await fetch(base + '/api/admin/pedidos', { headers: { 'X-Admin-Token': 'errada' } });
  assert.equal(errada.status, 401);
});

test('muitos pedidos seguidos são bloqueados', async () => {
  let bloqueou = false;
  for (let i = 0; i < 15; i++) {
    const res = await enviar('/api/pedidos', 'POST', { cliente: 'x', itens: [] });
    if (res.status === 429) bloqueou = true;
  }
  assert.equal(bloqueou, true);
});