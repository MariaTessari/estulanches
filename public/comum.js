function dinheiro(centavos) {
  return 'R$ ' + (centavos / 100).toFixed(2).replace('.', ',');
}

function criar(tag, classe, texto) {
  const el = document.createElement(tag);
  if (classe) el.className = classe;
  if (texto !== undefined) el.textContent = texto;
  return el;
}

const NOMES_STATUS = {
  aguardando: 'Aguardando aprovação',
  aprovado: 'Aprovado',
  preparando: 'Preparando',
  pronto: 'Pronto para retirar',
  entregue: 'Entregue',
  recusado: 'Recusado',
};
