CREATE TABLE IF NOT EXISTS itens (
  id SERIAL PRIMARY KEY,
  nome VARCHAR(60) NOT NULL,
  preco_centavos INT NOT NULL,
  disponivel BOOLEAN NOT NULL DEFAULT true,
  excluido BOOLEAN NOT NULL DEFAULT false
);

CREATE TABLE IF NOT EXISTS pedidos (
  id SERIAL PRIMARY KEY,
  codigo VARCHAR(8) NOT NULL UNIQUE,
  cliente VARCHAR(60) NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'aguardando',
  total_centavos INT NOT NULL,
  criado_em TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS pedido_itens (
  id SERIAL PRIMARY KEY,
  pedido_id INT NOT NULL REFERENCES pedidos(id),
  item_id INT NOT NULL REFERENCES itens(id),
  quantidade INT NOT NULL,
  preco_centavos INT NOT NULL
);

INSERT INTO itens (nome, preco_centavos) VALUES
  ('Coxinha', 600),
  ('Pão de queijo', 400),
  ('Suco de laranja', 550),
  ('Sanduíche natural', 800),
  ('Bolo de cenoura', 500);