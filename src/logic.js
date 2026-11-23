const PROXIMOS = {
  aguardando: ['aprovado', 'recusado'],
  aprovado: ['preparando'],
  preparando: ['pronto'],
  pronto: ['entregue'],
  entregue: [],
  recusado: [],
};

function podeMudarStatus(atual, novo) {
  return (PROXIMOS[atual] || []).includes(novo);
}

function validarNomeCompleto(texto) {
  const nome = typeof texto === 'string' ? texto.trim().replace(/\s+/g, ' ') : '';
  const palavras = nome.split(' ');
  const formatoDePalavra = /^[\p{L}][\p{L}'.-]*$/u;
  const valido =
    nome.length <= 60 &&
    palavras.length >= 2 &&
    palavras.every((p) => p.length >= 2 && formatoDePalavra.test(p));
  return { valido, nome };
}

function validarItem(dados) {
  const nome = typeof dados.nome === 'string' ? dados.nome.trim() : '';
  const preco = Number(dados.preco_centavos);
  const erros = [];

  if (nome.length < 2 || nome.length > 60) {
    erros.push('O nome deve ter de 2 a 60 letras');
  }
  if (!Number.isInteger(preco) || preco <= 0) {
    erros.push('O preço deve ser maior que zero');
  }
  return { erros, nome, preco };
}

function calcularPedido(linhas, cardapio) {
  if (!Array.isArray(linhas) || linhas.length === 0) {
    return { erros: ['O pedido precisa ter pelo menos um item'], itens: [], total: 0 };
  }

  const erros = [];
  const itens = [];
  let total = 0;

  for (const linha of linhas) {
    const item = cardapio.find((c) => c.id === Number(linha.id));
    const quantidade = Number(linha.quantidade);

    if (!item || !item.disponivel) {
      erros.push('O item ' + linha.id + ' não está disponível');
      continue;
    }
    if (!Number.isInteger(quantidade) || quantidade < 1 || quantidade > 10) {
      erros.push('Quantidade inválida para ' + item.nome + ' (use de 1 a 10)');
      continue;
    }

    itens.push({ id: item.id, quantidade, preco: item.preco_centavos });
    total += item.preco_centavos * quantidade;
  }

  return { erros, itens, total };
}

module.exports = { podeMudarStatus, validarNomeCompleto, validarItem, calcularPedido };