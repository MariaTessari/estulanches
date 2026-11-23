const entrada = document.getElementById('entrada');
const painel = document.getElementById('painel');
const erroEntrada = document.getElementById('erro-entrada');
const listaPedidos = document.getElementById('pedidos');
const listaItens = document.getElementById('itens');
const mensagem = document.getElementById('mensagem');

let senha = sessionStorage.getItem('senhaAdmin');
let timer = null;

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

async function carregarPedidos() {
  const r = await chamar('/api/admin/pedidos', 'GET');
  if (r.status === 401) return sair();

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

    const itens = criar('ul', 'itens-pedido');
    for (const item of pedido.itens) {
      itens.append(criar('li', '', item.quantidade + 'x ' + item.nome));
    }

    const cartao = criar('div', 'cartao');
    cartao.append(topo, itens, criar('p', 'total', 'Total: ' + dinheiro(pedido.total_centavos)));

    const acoes = criar('div', 'acoes');
    for (const [novoStatus, texto] of ACOES[pedido.status] || []) {
      const botao = criar('button', novoStatus === 'recusado' ? 'perigo' : '', texto);
      botao.type = 'button';
      botao.onclick = () => mudarStatus(pedido.id, novoStatus);
      acoes.append(botao);
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
  if (r.status === 401) return sair();

  listaItens.replaceChildren();
  for (const item of r.dados) {
    const botao = criar('button', 'claro', item.disponivel ? 'Tirar do cardápio' : 'Voltar ao cardápio');
    botao.type = 'button';
    botao.onclick = async () => {
      await chamar('/api/admin/itens/' + item.id, 'PATCH', { disponivel: !item.disponivel });
      carregarItens();
    };

    const nome = criar('span', '', item.nome + (item.disponivel ? '' : ' (fora do cardápio)'));
    const direita = criar('span', 'direita');
    direita.append(criar('span', 'preco', dinheiro(item.preco_centavos)), botao);

    const linha = criar('li', 'linha');
    linha.append(nome, direita);
    listaItens.append(linha);
  }
}

document.getElementById('form-item').addEventListener('submit', async (evento) => {
  evento.preventDefault();
  const texto = document.getElementById('preco').value.replace(',', '.');
  const centavos = Math.round(Number(texto) * 100);

  const r = await chamar('/api/admin/itens', 'POST', {
    nome: document.getElementById('nome').value,
    preco_centavos: centavos,
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
    return false;
  }
  entrada.hidden = true;
  painel.hidden = false;
  carregarPedidos();
  carregarItens();
  clearInterval(timer);
  timer = setInterval(carregarPedidos, 5000);
  return true;
}

document.getElementById('form-entrada').addEventListener('submit', async (evento) => {
  evento.preventDefault();
  senha = document.getElementById('senha').value;
  sessionStorage.setItem('senhaAdmin', senha);
  const entrou = await abrirPainel();
  erroEntrada.textContent = entrou ? '' : 'Senha incorreta.';
});

document.getElementById('sair').addEventListener('click', sair);

if (senha) abrirPainel();
