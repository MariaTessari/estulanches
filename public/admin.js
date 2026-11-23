const entrada = document.getElementById('entrada');
const painel = document.getElementById('painel');
const erroEntrada = document.getElementById('erro-entrada');
const listaPedidos = document.getElementById('pedidos');
const listaItens = document.getElementById('itens');
const mensagem = document.getElementById('mensagem');

let senha = sessionStorage.getItem('senhaAdmin');
let timer = null;
let itensAtuais = [];
let editando = null;

const ACOES = {
  aguardando: [['aprovado', 'Aprovar'], ['recusado', 'Recusar']],
  aprovado: [['preparando', 'Iniciar preparo']],
  preparando: [['pronto', 'Marcar como pronto']],
  pronto: [['entregue', 'Marcar como entregue']],
};

async function chamar(rota, metodo, corpo) {
  const resposta = await fetch(rota, {
    method: metodo,
    headers: { 'Content-Type': 'application/json', 'X-Admin-Token': senha || '' },
    body: corpo ? JSON.stringify(corpo) : undefined,
  });
  const dados = await resposta.json();
  return { ok: resposta.ok, status: resposta.status, dados };
}

function sair() {
  sessionStorage.removeItem('senhaAdmin');
  senha = null;
  clearInterval(timer);
  painel.hidden = true;
  entrada.hidden = false;
}

function avisar(texto, erro) {
  mensagem.textContent = texto;
  mensagem.className = 'msg ' + (erro ? 'erro' : 'ok');
}

function botao(texto, classe, aoClicar) {
  const el = criar('button', classe, texto);
  el.type = 'button';
  el.onclick = aoClicar;
  return el;
}

function paraCentavos(texto) {
  return Math.round(Number(String(texto).replace(',', '.')) * 100);
}

async function carregarPedidos() {
  const r = await chamar('/api/admin/pedidos', 'GET');
  if (r.status === 401 || r.status === 429) return sair();

  listaPedidos.replaceChildren();
  if (r.dados.length === 0) {
    listaPedidos.append(criar('p', 'vazio', 'Nenhum pedido ainda.'));
  }

  for (const pedido of r.dados) {
    const topo = criar('div', 'topo-cartao');
    topo.append(
      criar('h3', '', 'Pedido nº ' + pedido.id + ' - ' + pedido.cliente),
      criar('span', 'selo ' + pedido.status, NOMES_STATUS[pedido.status])
    );

    const codigo = criar('p', 'codigo', 'Código: ');
    codigo.append(criar('strong', '', pedido.codigo));

    const itens = criar('ul', 'itens-pedido');
    for (const item of pedido.itens) {
      itens.append(criar('li', '', item.quantidade + 'x ' + item.nome));
    }

    const cartao = criar('div', 'cartao');
    cartao.append(topo, codigo, itens, criar('p', 'total', 'Total: ' + dinheiro(pedido.total_centavos)));

    const acoes = criar('div', 'acoes');
    for (const [novoStatus, texto] of ACOES[pedido.status] || []) {
      acoes.append(botao(texto, novoStatus === 'recusado' ? 'perigo' : '', () => mudarStatus(pedido.id, novoStatus)));
    }
    if (acoes.children.length > 0) cartao.append(acoes);

    listaPedidos.append(cartao);
  }
}

async function mudarStatus(id, status) {
  const r = await chamar('/api/admin/pedidos/' + id, 'PATCH', { status });
  if (!r.ok) avisar(r.dados.erros.join(' '), true);
  carregarPedidos();
}

async function carregarItens() {
  const r = await chamar('/api/admin/itens', 'GET');
  if (r.status === 401 || r.status === 429) return sair();
  itensAtuais = r.dados;
  desenharItens();
}

function desenharItens() {
  listaItens.replaceChildren();
  if (itensAtuais.length === 0) {
    listaItens.append(criar('li', 'vazio', 'Nenhum item no cardápio.'));
  }
  for (const item of itensAtuais) {
    listaItens.append(item.id === editando ? linhaEdicao(item) : linhaItem(item));
  }
}

function linhaItem(item) {
  const nome = criar('span', item.disponivel ? '' : 'riscado', item.nome + (item.disponivel ? '' : ' (fora do cardápio)'));

  const editar = botao('Editar', 'claro pequeno', () => {
    editando = item.id;
    desenharItens();
  });

  const alternar = botao(item.disponivel ? 'Tirar do cardápio' : 'Voltar ao cardápio', 'claro pequeno', async () => {
    await chamar('/api/admin/itens/' + item.id, 'PATCH', { disponivel: !item.disponivel });
    carregarItens();
  });

  const excluir = botao('Excluir', 'perigo pequeno', async () => {
    if (!confirm('Excluir "' + item.nome + '" do cardápio?')) return;
    const r = await chamar('/api/admin/itens/' + item.id, 'DELETE');
    if (r.ok) avisar('Item excluído.', false);
    else avisar(r.dados.erros.join(' '), true);
    carregarItens();
  });

  const direita = criar('span', 'direita');
  direita.append(criar('span', 'preco', dinheiro(item.preco_centavos)), editar, alternar, excluir);

  const linha = criar('li', 'linha');
  linha.append(nome, direita);
  return linha;
}

function linhaEdicao(item) {
  const campoNome = criar('input');
  campoNome.type = 'text';
  campoNome.maxLength = 60;
  campoNome.value = item.nome;
  campoNome.setAttribute('aria-label', 'Nome do item');

  const campoPreco = criar('input');
  campoPreco.type = 'text';
  campoPreco.inputMode = 'decimal';
  campoPreco.value = (item.preco_centavos / 100).toFixed(2).replace('.', ',');
  campoPreco.setAttribute('aria-label', 'Preço do item em reais');

  const salvar = botao('Salvar', 'pequeno', async () => {
    const r = await chamar('/api/admin/itens/' + item.id, 'PUT', {
      nome: campoNome.value,
      preco_centavos: paraCentavos(campoPreco.value),
    });
    if (!r.ok) return avisar(r.dados.erros.join(' '), true);
    editando = null;
    avisar('Item atualizado.', false);
    carregarItens();
  });

  const cancelar = botao('Cancelar', 'claro pequeno', () => {
    editando = null;
    desenharItens();
  });

  const linha = criar('li', 'linha edicao');
  linha.append(campoNome, campoPreco, salvar, cancelar);
  return linha;
}

document.getElementById('form-item').addEventListener('submit', async (evento) => {
  evento.preventDefault();

  const r = await chamar('/api/admin/itens', 'POST', {
    nome: document.getElementById('nome').value,
    preco_centavos: paraCentavos(document.getElementById('preco').value),
  });

  if (!r.ok) return avisar(r.dados.erros.join(' '), true);

  avisar('Item adicionado ao cardápio.', false);
  evento.target.reset();
  carregarItens();
});

async function abrirPainel() {
  const teste = await chamar('/api/admin/itens', 'GET');
  if (!teste.ok) {
    sair();
    return teste.status === 429 ? 'Muitas tentativas. Aguarde alguns minutos.' : 'Senha incorreta.';
  }
  entrada.hidden = true;
  painel.hidden = false;
  itensAtuais = teste.dados;
  desenharItens();
  carregarPedidos();
  clearInterval(timer);
  timer = setInterval(carregarPedidos, 5000);
  return '';
}

document.getElementById('form-entrada').addEventListener('submit', async (evento) => {
  evento.preventDefault();
  senha = document.getElementById('senha').value;
  sessionStorage.setItem('senhaAdmin', senha);
  erroEntrada.textContent = await abrirPainel();
});

document.getElementById('sair').addEventListener('click', sair);

if (senha) abrirPainel();