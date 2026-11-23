const express = require('express');
const path = require('path');
const pool = require('./db');
const { podeMudarStatus, validarNomeCompleto, validarItem, calcularPedido } = require('./logic');
const { limitador, senhaCorreta, cabecalhosSeguros, gerarCodigo } = require('./seguranca');

const app = express();
app.disable('x-powered-by');
app.use(cabecalhosSeguros);
app.use(express.json({ limit: '10kb' }));
app.use(express.static(path.join(__dirname, '..', 'public')));

const falhasAdmin = limitador(5, 15 * 60 * 1000);
const pedidosPorIp = limitador(10, 60 * 1000);

app.param('id', (req, res, next, valor) => {
  if (!/^\d{1,9}$/.test(valor)) {
    return res.status(404).json({ erros: ['Não encontrado'] });
  }
  next();
});

function soAdmin(req, res, next) {
  if (falhasAdmin.bloqueado(req.ip)) {
    return res.status(429).json({ erros: ['Muitas tentativas. Tente novamente em alguns minutos'] });
  }
  const esperada = process.env.ADMIN_TOKEN;
  if (!esperada || !senhaCorreta(req.get('X-Admin-Token'), esperada)) {
    falhasAdmin.registrar(req.ip);
    return res.status(401).json({ erros: ['Acesso negado'] });
  }
  next();
}

const SQL_PEDIDOS = `
  SELECT p.id, p.codigo, p.cliente, p.status, p.total_centavos, p.criado_em,
         COALESCE(
           json_agg(json_build_object('nome', i.nome, 'quantidade', pi.quantidade))
           FILTER (WHERE pi.id IS NOT NULL), '[]') AS itens
  FROM pedidos p
  LEFT JOIN pedido_itens pi ON pi.pedido_id = p.id
  LEFT JOIN itens i ON i.id = pi.item_id`;

app.get('/health', async (req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({ status: 'ok', banco: 'ok', versao: process.env.APP_VERSION || 'dev' });
  } catch (erro) {
    res.status(503).json({ status: 'erro', banco: 'fora do ar' });
  }
});

app.get('/api/cardapio', async (req, res) => {
  const r = await pool.query(
    'SELECT id, nome, preco_centavos FROM itens WHERE disponivel = true AND excluido = false ORDER BY id'
  );
  res.json(r.rows);
});

app.post('/api/pedidos', async (req, res) => {
  if (pedidosPorIp.bloqueado(req.ip)) {
    return res.status(429).json({ erros: ['Muitos pedidos em pouco tempo. Aguarde um minuto'] });
  }
  pedidosPorIp.registrar(req.ip);

  const dados = req.body || {};
  const cliente = validarNomeCompleto(dados.cliente);
  if (!cliente.valido) {
    return res.status(400).json({ erros: ['Informe o nome completo (nome e sobrenome)'] });
  }

  const cardapio = await pool.query('SELECT * FROM itens WHERE excluido = false');
  const calculo = calcularPedido(dados.itens, cardapio.rows);
  if (calculo.erros.length > 0) {
    return res.status(400).json({ erros: calculo.erros });
  }

  const conexao = await pool.connect();
  try {
    await conexao.query('BEGIN');
    const pedido = await conexao.query(
      'INSERT INTO pedidos (codigo, cliente, total_centavos) VALUES ($1, $2, $3) RETURNING id, codigo, cliente, status, total_centavos',
      [gerarCodigo(), cliente.nome, calculo.total]
    );
    for (const item of calculo.itens) {
      await conexao.query(
        'INSERT INTO pedido_itens (pedido_id, item_id, quantidade, preco_centavos) VALUES ($1, $2, $3, $4)',
        [pedido.rows[0].id, item.id, item.quantidade, item.preco]
      );
    }
    await conexao.query('COMMIT');
    res.status(201).json(pedido.rows[0]);
  } catch (erro) {
    await conexao.query('ROLLBACK');
    throw erro;
  } finally {
    conexao.release();
  }
});

app.get('/api/pedidos/:codigo', async (req, res) => {
  const codigo = String(req.params.codigo).toUpperCase();
  if (!/^[A-F0-9]{8}$/.test(codigo)) {
    return res.status(404).json({ erros: ['Pedido não encontrado'] });
  }
  const r = await pool.query(SQL_PEDIDOS + ' WHERE p.codigo = $1 GROUP BY p.id', [codigo]);
  if (r.rows.length === 0) {
    return res.status(404).json({ erros: ['Pedido não encontrado'] });
  }
  res.json(r.rows[0]);
});

app.get('/api/admin/pedidos', soAdmin, async (req, res) => {
  const r = await pool.query(SQL_PEDIDOS + ' GROUP BY p.id ORDER BY p.id DESC LIMIT 50');
  res.json(r.rows);
});

app.patch('/api/admin/pedidos/:id', soAdmin, async (req, res) => {
  const id = Number(req.params.id);
  const novo = (req.body || {}).status;

  const atual = await pool.query('SELECT status FROM pedidos WHERE id = $1', [id]);
  if (atual.rows.length === 0) {
    return res.status(404).json({ erros: ['Pedido não encontrado'] });
  }
  if (!podeMudarStatus(atual.rows[0].status, novo)) {
    return res.status(400).json({
      erros: ['Não é possível mudar de ' + atual.rows[0].status + ' para ' + novo],
    });
  }

  const r = await pool.query(
    'UPDATE pedidos SET status = $1 WHERE id = $2 RETURNING id, status',
    [novo, id]
  );
  res.json(r.rows[0]);
});

app.get('/api/admin/itens', soAdmin, async (req, res) => {
  const r = await pool.query('SELECT * FROM itens WHERE excluido = false ORDER BY id');
  res.json(r.rows);
});

app.post('/api/admin/itens', soAdmin, async (req, res) => {
  const v = validarItem(req.body || {});
  if (v.erros.length > 0) {
    return res.status(400).json({ erros: v.erros });
  }
  const r = await pool.query(
    'INSERT INTO itens (nome, preco_centavos) VALUES ($1, $2) RETURNING *',
    [v.nome, v.preco]
  );
  res.status(201).json(r.rows[0]);
});

app.put('/api/admin/itens/:id', soAdmin, async (req, res) => {
  const v = validarItem(req.body || {});
  if (v.erros.length > 0) {
    return res.status(400).json({ erros: v.erros });
  }
  const r = await pool.query(
    'UPDATE itens SET nome = $1, preco_centavos = $2 WHERE id = $3 AND excluido = false RETURNING *',
    [v.nome, v.preco, Number(req.params.id)]
  );
  if (r.rows.length === 0) {
    return res.status(404).json({ erros: ['Item não encontrado'] });
  }
  res.json(r.rows[0]);
});

app.patch('/api/admin/itens/:id', soAdmin, async (req, res) => {
  const disponivel = Boolean((req.body || {}).disponivel);
  const r = await pool.query(
    'UPDATE itens SET disponivel = $1 WHERE id = $2 AND excluido = false RETURNING *',
    [disponivel, Number(req.params.id)]
  );
  if (r.rows.length === 0) {
    return res.status(404).json({ erros: ['Item não encontrado'] });
  }
  res.json(r.rows[0]);
});

app.delete('/api/admin/itens/:id', soAdmin, async (req, res) => {
  const r = await pool.query(
    'UPDATE itens SET excluido = true, disponivel = false WHERE id = $1 AND excluido = false RETURNING id',
    [Number(req.params.id)]
  );
  if (r.rows.length === 0) {
    return res.status(404).json({ erros: ['Item não encontrado'] });
  }
  res.json({ id: r.rows[0].id });
});

app.use((erro, req, res, next) => {
  const status = erro.status && erro.status < 500 ? erro.status : 500;
  if (status === 500) {
    console.error(erro);
    return res.status(500).json({ erros: ['Erro interno do servidor'] });
  }
  res.status(status).json({ erros: ['Requisição inválida'] });
});

module.exports = app;