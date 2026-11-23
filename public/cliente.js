const lista = document.getElementById('cardapio');
const resumo = document.getElementById('resumo');
const mensagem = document.getElementById('mensagem');
const caixa = document.getElementById('acompanhamento');

let cardapio = [];
const quantidades = {};
let timer = null;

const ETAPAS = ['aguardando', 'aprovado', 'preparando', 'pronto', 'entregue'];

async function carregarCardapio() {
  const resposta = await fetch('/api/cardapio');
  cardapio = await resposta.json();
  desenharCardapio();
}

function mudarQuantidade(id, diferenca) {
  const nova = (quantidades[id] || 0) + diferenca;
  quantidades[id] = Math.max(0, Math.min(10, nova));
  desenharCardapio();
}

function desenharCardapio() {
  lista.replaceChildren();
  let total = 0;

  if (cardapio.length === 0) {
    lista.append(criar('li', 'vazio', 'O cardápio está vazio no momento.'));
  }

  for (const item of cardapio) {
    const qtd = quantidades[item.id] || 0;
    total += qtd * item.preco_centavos;

    const menos = criar('button', 'mini', '-');
    menos.type = 'button';
    menos.setAttribute('aria-label', 'Tirar um ' + item.nome);
    menos.onclick = () => mudarQuantidade(item.id, -1);

    const mais = criar('button', 'mini', '+');
    mais.type = 'button';
    mais.setAttribute('aria-label', 'Adicionar um ' + item.nome);
    mais.onclick = () => mudarQuantidade(item.id, 1);

    const direita = criar('span', 'direita');
    direita.append(criar('span', 'preco', dinheiro(item.preco_centavos)), menos, criar('span', 'qtd', String(qtd)), mais);

    const linha = criar('li', 'linha');
    linha.append(criar('span', '', item.nome), direita);
    lista.append(linha);
  }

  resumo.textContent = 'Total: ' + dinheiro(total);
}

function avisar(texto, erro) {
  mensagem.textContent = texto;
  mensagem.className = 'msg ' + (erro ? 'erro' : 'ok');
}

document.getElementById('form-pedido').addEventListener('submit', async (evento) => {
  evento.preventDefault();

  const itens = [];
  for (const id in quantidades) {
    if (quantidades[id] > 0) itens.push({ id: Number(id), quantidade: quantidades[id] });
  }
  if (itens.length === 0) {
    return avisar('Escolha pelo menos um item do cardápio.', true);
  }

  const resposta = await fetch('/api/pedidos', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ cliente: document.getElementById('cliente').value, itens }),
  });
  const dados = await resposta.json();

  if (!resposta.ok) {
    return avisar(dados.erros.join(' '), true);
  }

  avisar('Pedido enviado! Guarde o código ' + dados.codigo + '.', false);
  for (const id in quantidades) delete quantidades[id];
  desenharCardapio();
  mostrarPedido(dados.codigo);
});

document.getElementById('form-busca').addEventListener('submit', (evento) => {
  evento.preventDefault();
  const codigo = document.getElementById('codigo').value.trim().toUpperCase();
  if (codigo) mostrarPedido(codigo);
});

async function mostrarPedido(codigo) {
  clearInterval(timer);
  const resposta = await fetch('/api/pedidos/' + encodeURIComponent(codigo));

  if (!resposta.ok) {
    if (localStorage.getItem('codigoAtual') === codigo) localStorage.removeItem('codigoAtual');
    caixa.replaceChildren(criar('p', 'erro', 'Pedido não encontrado. Confira o código.'));
    return;
  }

  const pedido = await resposta.json();
  localStorage.setItem('codigoAtual', codigo);
  desenharPedido(pedido);

  if (pedido.status !== 'entregue' && pedido.status !== 'recusado') {
    timer = setInterval(() => mostrarPedido(codigo), 5000);
  }
}

function desenharPedido(pedido) {
  const cartao = criar('div', 'cartao');
  cartao.append(criar('h3', '', 'Pedido de ' + pedido.cliente));

  const codigo = criar('p', 'codigo', 'Código: ');
  codigo.append(criar('strong', '', pedido.codigo));
  cartao.append(codigo);

  if (pedido.status === 'recusado') {
    cartao.append(criar('p', 'erro', 'Este pedido foi recusado pela cantina.'));
  } else {
    const etapas = criar('ol', 'etapas');
    const posicao = ETAPAS.indexOf(pedido.status);
    ETAPAS.forEach((etapa, i) => {
      let classe = '';
      if (i < posicao) classe = 'feita';
      if (i === posicao) classe = 'atual';
      etapas.append(criar('li', classe, NOMES_STATUS[etapa]));
    });
    cartao.append(etapas);
  }

  const itens = criar('ul', 'itens-pedido');
  for (const item of pedido.itens) {
    itens.append(criar('li', '', item.quantidade + 'x ' + item.nome));
  }
  cartao.append(itens, criar('p', 'total', 'Total: ' + dinheiro(pedido.total_centavos)));
  caixa.replaceChildren(cartao);
}

carregarCardapio();
const guardado = localStorage.getItem('codigoAtual');
if (guardado) mostrarPedido(guardado);