# EstuLanches

Sistema de cardápio e pedidos da cantina da escola, rodando com Docker.

- **Cliente** (`/`): vê o cardápio, monta o pedido e acompanha o status.
- **Cantina/admin** (`/admin.html`): aprova ou recusa pedidos, acompanha o preparo e cuida do cardápio.

## Como rodar
```bash
cp .env.example .env     # troque as senhas
docker compose up -d --build
```
- Cliente: http://localhost:3000
- Cantina: http://localhost:3000/admin.html (senha = `ADMIN_TOKEN` do `.env`)

## Conferir se subiu certo
```bash
docker compose ps        # serviços, portas e estado (healthy)
docker compose logs      # logs da aplicação e do banco
```

## Testes
```bash
docker compose exec app npm test
```
- `tests/logic.test.js`: teste unitário das regras (total do pedido, validações, ordem dos status)
- `tests/api.test.js`: teste de integração (rotas + banco). Apaga o que criou ao terminar.

## Fluxo do pedido
`aguardando` → `aprovado` → `preparando` → `pronto` → `entregue`
(na primeira etapa a cantina também pode `recusar`)

## Rotas
| Método | Rota | Quem usa | Função |
|---|---|---|---|
| GET | /health | todos | confere aplicação e banco |
| GET | /api/cardapio | cliente | itens disponíveis |
| POST | /api/pedidos | cliente | faz um pedido |
| GET | /api/pedidos/:id | cliente | status de um pedido |
| GET | /api/admin/pedidos | admin | lista os pedidos |
| PATCH | /api/admin/pedidos/:id | admin | muda o status |
| GET | /api/admin/itens | admin | todos os itens do cardápio |
| POST | /api/admin/itens | admin | cadastra item |
| PATCH | /api/admin/itens/:id | admin | tira ou volta ao cardápio |

##Vídeo: https://drive.google.com/file/d/174w02TbpqPk3Cos_eRp0lojJ8aSKMVRO/view?usp=drive_link 
##Ficha RDM: https://drive.google.com/file/d/1YbYqRfk54TTOTy7rrrO3klVKPzYdWD2z/view?usp=sharing


## Segurança
- senhas no `.env`, que não vai pro GitHub
- rotas de admin exigem a senha no cabeçalho `X-Admin-Token`
- consultas com `$1, $2` (evita SQL injection)
- validação de tudo que chega (nome, quantidade, status)
- o preço vem do banco, o cliente só escolhe item e quantidade
- a tela usa `textContent`, então nome com HTML não vira código
- banco sem porta aberta pra fora
- container roda sem ser root, e em modo produção
- em uso real o site precisaria de HTTPS, senão a senha do admin trafega sem proteção
