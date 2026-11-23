const crypto = require('crypto');

function limitador(maximo, janelaMs) {
  const registros = new Map();

  function atual(chave) {
    const registro = registros.get(chave);
    if (registro && Date.now() > registro.ate) {
      registros.delete(chave);
      return null;
    }
    return registro || null;
  }

  return {
    bloqueado(chave) {
      const registro = atual(chave);
      return registro !== null && registro.total >= maximo;
    },
    registrar(chave) {
      let registro = atual(chave);
      if (!registro) {
        registro = { total: 0, ate: Date.now() + janelaMs };
        registros.set(chave, registro);
      }
      registro.total += 1;
    },
  };
}

function senhaCorreta(informada, esperada) {
  const a = crypto.createHash('sha256').update(String(informada || '')).digest();
  const b = crypto.createHash('sha256').update(String(esperada || '')).digest();
  return crypto.timingSafeEqual(a, b);
}

function cabecalhosSeguros(req, res, next) {
  res.set('Content-Security-Policy', "default-src 'self'");
  res.set('X-Content-Type-Options', 'nosniff');
  res.set('X-Frame-Options', 'DENY');
  res.set('Referrer-Policy', 'no-referrer');
  next();
}

function gerarCodigo() {
  return crypto.randomBytes(4).toString('hex').toUpperCase();
}

module.exports = { limitador, senhaCorreta, cabecalhosSeguros, gerarCodigo };