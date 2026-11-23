# Escalabilidade: EstuLanches para o Brasil todo (conceitual)

Cenário: 1 milhão de usuários, 100 mil ao mesmo tempo (por exemplo, no horário do recreio).

**Problema:** um servidor só não aguenta. Ele é o ponto único de falha e tem limite de CPU e memória.

**Solução: escalar na horizontal**, ou seja, mais cópias em vez de um servidor maior.

1. **Várias cópias da aplicação.** O container é sempre o mesmo, então o Docker facilita criar várias.
   A aplicação não guarda nada na memória (tudo fica no banco), então qualquer cópia atende qualquer cliente.
2. **Load balancer** na frente, dividindo as requisições entre as cópias.
3. **Cache (Redis)** para o cardápio, que muda pouco e é lido por todo mundo. Alivia o banco.
4. **Banco com réplicas de leitura.** Quem só consulta (cardápio, status) lê das réplicas; os pedidos novos vão para o banco principal.
5. **CDN** para entregar páginas, CSS e imagens de um ponto perto de cada usuário.
6. **Orquestrador (Kubernetes)** para criar e remover cópias sozinho conforme a demanda, e reiniciar as que falharem.
7. **Fila de mensagens** para os picos de pedidos não derrubarem o banco.
8. **Monitoramento** (logs e métricas) para ver os problemas antes dos usuários.

**O que já existe no projeto e ajuda nisso:** aplicação sem estado, banco separado em outro container,
`/health` com healthcheck (o orquestrador usa isso para saber se uma cópia está viva) e configuração por variáveis de ambiente.
