const express = require('express');
const path = require('path');
const pool = require('./db');
const { podeMudarStatus, validarItem, calcularPedido } = require('./logic');

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, '..', 'public')));

function soAdmin(req, res, next) {
  const senha = process.env.ADMIN_TOKEN;
  if (!senha || req.get('X-Admin-Token') !== senha) {
    return res.status(401).json({ erros: ['Acesso negado'] });
  }
  next();
}

const SQL_PEDIDOS = `
  SELECT p.id, p.cliente, p.status, p.total_centavos, p.criado_em,
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
    'SELECT id, nome, preco_centavos FROM itens WHERE disponivel = true ORDER BY id'
  );
  res.json(r.rows);
});

app.post('/api/pedidos', async (req, res) => {
  const dados = req.body || {};
  const cliente = typeof dados.cliente === 'string' ? dados.cliente.trim() : '';

  if (cliente.length < 2 || cliente.length > 60) {
    return res.status(400).json({ erros: ['Informe seu nome (de 2 a 60 letras)'] });
  }

  const cardapio = await pool.query('SELECT * FROM itens');
  const calculo = calcularPedido(dados.itens, cardapio.rows);
  if (calculo.erros.length > 0) {
    return res.status(400).json({ erros: calculo.erros });
  }

  const conexao = await pool.connect();
  try {
    await conexao.query('BEGIN');
    const pedido = await conexao.query(
      'INSERT INTO pedidos (cliente, total_centavos) VALUES ($1, $2) RETURNING id, cliente, status, total_centavos',
      [cliente, calculo.total]
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

app.get('/api/pedidos/:id', async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) {
    return res.status(400).json({ erros: ['Número de pedido inválido'] });
  }
  const r = await pool.query(SQL_PEDIDOS + ' WHERE p.id = $1 GROUP BY p.id', [id]);
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
  const r = await pool.query('SELECT * FROM itens ORDER BY id');
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

app.patch('/api/admin/itens/:id', soAdmin, async (req, res) => {
  const disponivel = Boolean((req.body || {}).disponivel);
  const r = await pool.query(
    'UPDATE itens SET disponivel = $1 WHERE id = $2 RETURNING *',
    [disponivel, Number(req.params.id)]
  );
  if (r.rows.length === 0) {
    return res.status(404).json({ erros: ['Item não encontrado'] });
  }
  res.json(r.rows[0]);
});

app.use((erro, req, res, next) => {
  console.error(erro);
  res.status(500).json({ erros: ['Erro interno do servidor'] });
});

module.exports = app;
