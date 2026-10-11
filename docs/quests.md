# Quests (BETA-25)

Quests são conjuntos fixos de atividades escolhidas para uma pessoa treinar dentro de
um prazo. Há um atalho para **Quests** nas abas **Kanji, Kotoba, Bunpou e Shiken**,
além do acesso em **Benkyou**. Cada ocorrência guarda os IDs exatos de
Kanji, Kotoba e Bunpou, em qualquer combinação e quantidade. Também pode incluir
simulados específicos do Shiken e histórias do Monogatari, inclusive uma seleção
composta apenas por histórias. **Começar** abre diretamente a seleção; não há
configuração de categoria, nível ou quantidade antes de estudar.

Benkyou abre uma tela com três destinos no mesmo formato: **Quests**,
**Monogatari** (histórias) e **Anki / 暗記** (flashcards, memorização). O treino
normal mantém seus modos, filtros e retomada dentro de Anki. Os atalhos de estudo
nas bibliotecas abrem essa configuração diretamente com a categoria e o nível
selecionados. Voltar de Anki ou Monogatari leva à entrada do Benkyou, preservando
as preferências.

## Seleção e conclusão

- A automação consulta as estatísticas individuais com `get_study_cards`, percorre
  as páginas do catálogo e envia os IDs escolhidos em `create_quest`. Ela pode
  criar várias quests, com títulos e prazos diferentes. Não foi criado um
  agendamento nesta implementação.
- O modelo usa `cardIds`, `paperIds` e `storyIds`, sem descrição ou objetivos genéricos por
  quantidade. Os IDs devem ser únicos, pertencer à conta e estar disponíveis na
  criação. A ordem escolhida é preservada; primeiro vêm os cards, depois os
  simulados selecionados e por fim as histórias selecionadas. Dentro de cada
  lista, a ordem enviada é preservada. Ao menos uma das listas deve ter um alvo.
- Para escolher histórias, a automação consulta `list_stories` e `get_story` com
  `stories:read`. `create_quest` continua exigindo `quests:read` e `quests:write`,
  como já acontece ao vincular cards ou simulados: incluir um ID não concede
  acesso ao texto nem ao gabarito. A criação verifica dono e disponibilidade.
- Uma quest só fica concluída quando todos os seus alvos forem praticados.
  Responder um mesmo card várias vezes não substitui os demais. Qualquer avaliação
  confirmada conta, inclusive incorreta: o requisito inicial é praticar a seleção.
- Apenas a prática iniciada pela própria quest conta para ela. Estudo avulso e
  outra quest não completam seus alvos, mesmo que usem os mesmos cards.
- Cada história tem uma leitura própria por quest, separada da leitura avulsa e
  de outras quests. Já ter concluído o mesmo texto no Monogatari não dispensa a
  prática selecionada. A história conta ao responder todas as perguntas e
  confirmar a conclusão; a nota não impede o crédito. A quest registra os IDs
  em `completedStoryIds` e só conclui quando os três conjuntos estiverem completos.
- As respostas já dadas ficam guardadas para retomada. **Continuar** abre o que
  falta. É possível alternar entre várias quests; iniciar outro estudo encerra a
  sessão anterior, preservando os alvos já respondidos. Um simulado em andamento
  deve ser finalizado antes de iniciar outro; não é concluído automaticamente.
- Não há limite de 100 cards por quest, nem cota por tipo. Conjuntos grandes são
  percorridos em partes internas, com continuação automática e sem conclusão
  intermediária. Permanecem os limites técnicos de armazenamento e tamanho de
  mensagens; nenhum conjunto é truncado silenciosamente.
- Se um alvo necessário estiver indisponível antes de começar, a operação falha
  com uma mensagem. Não é substituído por outro card. Cards de uma parte já
  iniciada usam a cópia guardada no começo, mesmo após edição ou arquivamento.

## Prazo, histórico e interface

O atalho aparece depois do streak, dentro da rolagem principal. Usa o marrom
`palette.secondary` e a Betinha brava com magnésio enquanto houver quests para
concluir; ao concluir todas as disponíveis, muda para o verde `palette.primary`
com a Betinha dormindo no crash pad. O texto também informa o estado, sem depender
somente de cor ou imagem. O mesmo componente é usado em todas as abas, e voltar
da lista de quests leva à aba de origem, inclusive depois de pausar ou concluir
uma prática.

Para esse indicador, uma quest disponível já começou, ainda está no prazo e não
foi cancelada. Quests futuras, vencidas e canceladas não entram no cálculo. Verde
exige pelo menos uma quest disponível e `completedAt` em todas elas; carregamento,
lista vazia e somente histórico concluído permanecem marrons, com texto próprio.
Uma nova quest disponível retorna o indicador ao marrom. O estado usa o catálogo
local e o progresso já salvo, inclusive offline, sem acrescentar sincronizações;
os horários de início e vencimento são reavaliados localmente.

O atalho passou pela verificação completa em 11/10/2026: formatação, lint,
TypeScript e 701 testes (444 mobile, 231 backend e 26 scripts). Os testes incluem
as quatro abas, retorno à origem, rolagem única, conclusão integral, nova quest,
offline e mudanças no horário de início/vencimento. Esta alteração de interface
não gerou um novo APK.

A lista mostra título, data de criação, tempo relativo até expirar e a ação de
começar ou continuar. A criação aparece entre o título e o prazo, como
**Criada em DD/MM/AAAA**, no fuso da quest. Não mostra descrição, barras de
progresso parcial ou datas e horários absolutos de disponibilidade.
Quests concluídas mostram também o dia da conclusão. O
contador durante o estudo serve para orientar a prática, sem dar uma conclusão
parcial à quest.

A visualização abre em **Ativas**, com as quests disponíveis ordenadas pelo prazo
mais próximo. Quests programadas aparecem à parte em **Em breve**. A aba
**Concluídas** reúne somente conquistas completas, da mais recente para a mais
antiga; abaixo delas, **Encerradas** pode ser expandido para consultar quests
vencidas ou canceladas. Vencimento não conta como conclusão. A separação é
reavaliada no horário de início/vencimento e quando o progresso local muda.

As duas abas usam o mesmo catálogo local. Trocar de aba não inicia sincronização.
Em **Concluídas**, **Consultar histórico completo** busca páginas anteriores
somente quando solicitado e com conexão. A mesma consulta atende conquistas e
encerradas, sem duplicar quests já presentes no aparelho. O texto diferencia
histórico recente, páginas ainda incompletas e uma lista integralmente vazia;
offline, o histórico recente continua acessível. Enquanto houver atividades
pendentes de sincronização, a consulta anterior também fica limitada ao histórico
recente e informa o motivo; a interface não confunde esse cache com uma lista
completa sem conquistas.

`startsAt` e `dueAt` são instantes UTC em milissegundos; `timeZone` é um fuso IANA.
Valem atividades desde `max(createdAt, startsAt)` até antes de `dueAt`. Não há
crédito retroativo. Ao expirar ou cancelar, ainda é possível terminar a prática
em andamento, mas ela não ganha novos créditos de quest nem inicia a próxima
parte automaticamente.

Desfazer uma resposta retira o crédito enquanto a quest está incompleta; a
conquista já concluída é preservada. Cancelar mantém o histórico. A criação é
idempotente por `clientKey`: repetir a mesma chave e conteúdo recupera a mesma
ocorrência; reutilizar com outra seleção gera conflito.

O botão de desfazer alcança os cards da parte em andamento. Ao passar
automaticamente para a próxima parte de um conjunto grande, ele não volta à
parte anterior.

## Offline e sincronização

O app reaproveita o diário offline de respostas, simulados e histórias. As ações
de leitura vinculadas carregam `questId`; omitir o vínculo mantém a leitura avulsa.
Vale o horário da
atividade, sujeito à validação pelo servidor, e não o momento do envio. Reenvios
não duplicam progresso. Os resultados confirmados reconciliam o estado local.
O catálogo e os alvos precisam estar no aparelho para iniciar sem conexão.

As bibliotecas seguem a atualização na abertura/segundo plano e por gesto manual.
Não foi adicionado polling. O cache guarda quests recentes e programadas, com
histórico anterior paginado online. Os detalhes de ferramentas, permissões e
limites técnicos estão em [mcp.md](mcp.md).

## Publicação e validação de histórias em quests

A extensão foi publicada a partir de `/home/golias/projects/beta`: DEV em
`2026-10-11T02:38:13.440Z` e PROD em `2026-10-11T02:38:52.368Z` (noite de
10/10/2026 no fuso `America/Sao_Paulo`). Os dois plugins ChatGPT atualizaram
`create_quest` com `storyIds` e `get_quest` com `completedStoryIds`, conservando
29 ferramentas e os escopos existentes. Não houve novo consentimento.

`npm run check` passou com formatação, lint, tipos e **661 testes**: 423 mobile,
215 backend e 23 scripts. A verificação remota confirmou descoberta, autenticação
obrigatória, CORS e funções publicadas nos dois ambientes. Não houve outro smoke
OAuth completo nem novo APK nesta extensão. Os recibos e a distinção das
validações anteriores estão em [Produção](production.md) e [MCP](mcp.md).

## Perguntas guardadas para revisão

As definições de seleção exata, mistura livre, várias quests, conclusão integral
e cartões compactos foram confirmadas pelo usuário. As escolhas abaixo foram
assumidas sem interromper o trabalho:

| Pergunta                                                               | Resposta adotada                                                                                                                                        |
| ---------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Posso parar uma quest e fazer outra?                                   | Sim. Guarda as respostas e retoma apenas o que falta.                                                                                                   |
| Onde consultar quests vencidas ou canceladas?                          | Em **Concluídas**, no grupo recolhido **Encerradas**, separado das conquistas; futuras aparecem em **Em breve**, na aba **Ativas**.                     |
| Uma resposta errada conta?                                             | Sim; conta a prática confirmada de cada alvo.                                                                                                           |
| O mesmo card em duas quests completa ambas?                            | Não. Cada quest tem sua própria prática.                                                                                                                |
| Qual é a ordem dos cards?                                              | A ordem enviada pela automação, com tipos misturados.                                                                                                   |
| Como ficam os simulados da especificação original?                     | Podem ser selecionados por ID e vêm depois dos cards.                                                                                                   |
| Posso receber uma quest só de histórias?                               | Sim. Basta preencher `storyIds`; também pode misturar com cards e simulados.                                                                            |
| Em que ordem vêm as histórias?                                         | Depois dos cards e simulados, conservando a ordem de `storyIds`.                                                                                        |
| Uma história já lida ou presente em duas quests conta automaticamente? | Não. Cada quest exige sua própria leitura, respostas e confirmação final; o histórico avulso permanece separado.                                        |
| Preciso acertar todas as perguntas da história?                        | Não. Todas devem ser respondidas e a conclusão confirmada; a nota é independente.                                                                       |
| E se um card for arquivado?                                            | Não é substituído. Uma parte já iniciada mantém sua cópia; a próxima precisa dos alvos disponíveis.                                                     |
| Desfazer pode retirar uma conquista?                                   | Retira crédito antes da conclusão; preserva uma conquista concluída.                                                                                    |
| E se eu sincronizar depois do prazo?                                   | Vale o horário da prática, confirmado pelo servidor.                                                                                                    |
| Posso alterar a seleção de uma quest existente?                        | Para trocar, cancela a ocorrência e cria outra com uma nova chave.                                                                                      |
| A automação diária já foi criada?                                      | Não. O MCP foi preparado para a automação futura definir sua própria seleção e agenda.                                                                  |
| Foram criadas quests na conta real?                                    | Em 10/10/2026, a pedido do usuário, duas diárias em produção: 30 kanjis e 30 kotoba, cada uma com 15 N4 e 15 N3. A prévia continua usando demonstração. |
