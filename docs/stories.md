# Monogatari · Histórias

Implementação de [BETA-26](https://linear.app/babel-crux/issue/BETA-26/feature-8-historias), em 10/10/2026. Entrada **物語 · Monogatari · Histórias** em Benkyou; as seis abas principais continuam disponíveis.

## Experiência

- Catálogo por data, do mais novo ao mais antigo, com filtros de nível N5–N1 e Todas/Novas/Concluídas. Leituras iniciadas têm ação **Continuar leitura** ou **Continuar perguntas**. Uma conclusão exige responder todas as questões e tocar em **Concluir história**; chegar ao fim do texto não conclui.
- Leitor com um único scroll vertical e apenas o toggle **Furigana** na barra superior. Furigana começa ligada; a preferência fica salva por conta e ambiente. A fonte usa o tamanho padrão e respeita a ampliação do sistema. Se o autor não forneceu leituras, um aviso explica isso e o controle fica desativado.
- Cada parágrafo tem sua própria ação **Ver tradução / Ocultar tradução**, sem fechar as demais traduções. Criar ou editar uma história exige tradução em todos os parágrafos. Conteúdo legado sem tradução continua acessível e informa a ausência ao abrir essa opção; nenhuma tradução ou pronúncia é inventada pelo app.
- Uma questão por vez, alternativa selecionada antes de confirmar, correção com explicação, consulta ao texto preservando a seleção. Após confirmação, a explicação é trazida à área visível.
- Resultado separa conclusão de nota. Reler mantém o resultado anterior; não há uma segunda tentativa que substitua a primeira. O catálogo preserva filtros na volta.
- O catálogo aceita puxar para atualizar no scroll principal. O leitor mantém seu próprio scroll e não captura o gesto para baixar catálogos.

## Conteúdo e integração

`shared/stories.ts` define texto em parágrafos com segmentos `{text, reading?}`, tradução e questões com alternativas identificadas, gabarito e explicação opcional. O armazenamento aceita tradução ausente para compatibilidade com histórias antigas, mas a criação e a edição exigem texto traduzido não vazio em cada parágrafo. As leituras são anotadas pela autoria no contexto da palavra; não são deduzidas de um kanji isolado.

Correções editoriais atualizam a história no mesmo ID, com `expectedContentVersion` para impedir sobrescritas concorrentes. Cada edição anterior fica preservada. O primeiro progresso vincula a leitura à edição estudada; alterar texto, perguntas ou gabarito não muda as respostas nem a nota dessa leitura. O editor recebe a edição mais recente; o leitor recebe a edição vinculada ao seu progresso. Exclusão é reversível por arquivamento e não apaga texto nem progresso. Histórias arquivadas continuam aceitando respostas já pendentes no aparelho.

O MCP oferece `list_stories`, `get_story`, `create_story`, `update_story`, `delete_story` e `set_story_archived`, com escopos `stories:read` e `stories:write`. O dono vem da identidade autenticada. `create_story` recebe `clientKey` idempotente: repetir a mesma chave e conteúdo original retorna a história existente, mesmo após uma edição; reutilizá-la com conteúdo diferente falha. `update_story` recebe o conteúdo completo e a versão esperada; repetir uma atualização já aplicada com o mesmo conteúdo é seguro. `delete_story` arquiva, e `set_story_archived` permite restaurar. Consulte [MCP](mcp.md) para o contrato e a configuração dos escopos. A futura automação poderá publicar textos sem intervenção no app; nenhum agendamento foi criado nesta entrega.

Limites de transporte: 64 KiB de conteúdo por história, até 200 parágrafos, 200 segmentos por parágrafo, 30 questões e 2–6 alternativas por questão. São limites técnicos, não recomendação pedagógica; textos maiores podem ser divididos em capítulos.

## Persistência e sincronização

Histórias também podem ser alvos fixos de quests pelo campo `storyIds`, sozinhas
ou com cards e simulados. **Começar** na quest abre a seleção na ordem cards →
simulados → histórias. A leitura vinculada guarda posição, respostas, edição e
conclusão com `questId`; ela é independente da leitura avulsa e de outras quests
que usem o mesmo texto. Um resultado avulso anterior não conclui uma quest nova.
O crédito exige responder todas as perguntas e confirmar a conclusão dentro do
prazo da própria quest, sem nota mínima. A lista e as consultas MCP de histórias
continuam mostrando o progresso avulso; consulte `get_quest` para verificar os
`completedStoryIds` daquela seleção. Veja [Quests](quests.md).

Posição por parágrafo e respostas são gravadas no disco antes de a interface confirmar a ação. O diário offline usa `story.progress`, `story.answer` e `story.complete`; recibos idempotentes evitam duplicar operações após perda de conexão. Cada operação carrega a versão do conteúdo, e a confirmação devolve conteúdo e progresso correspondentes. Tempos separados por resposta e por marcador permitem conciliar dispositivos sem uma resposta atrasada mover a posição de leitura. Uma conclusão confirmada conserva o resultado. Um conflito entre versões estudadas em aparelhos diferentes mantém a operação pendente e sinaliza o conflito; respostas de versões diferentes nunca são misturadas.

O download normal inclui até 30 histórias recentes e até 10 leituras em curso, respeitando 2 MB. Histórias mais antigas são paginadas online e baixadas ao abrir. O cache retém até 100 histórias, além das necessárias para leituras abertas ou operações pendentes; antigas podem ser baixadas de novo. Metadados dos IDs cacheados reconciliam arquivamento/restauração sem baixar todo o histórico. Preferências não são substituídas por um refresh.

Não há polling. Catálogos seguem abertura/retorno/segundo plano, gesto de atualização e ação manual já existentes. Abrir a lista, mudar filtro, pedir a próxima página ou abrir uma história consulta somente o conteúdo necessário. Progresso segue o envio do diário de estudos. No modo offline explícito, não há consultas remotas; as leituras baixadas continuam utilizáveis. Falhas de download mantêm o conteúdo local e permitem tentar novamente.

## Benchmarks usados

A [pesquisa com fontes primárias](research/stories-ux-benchmarks.md) reúne Satori Reader, Tadoku, Duolingo, diretrizes Android e W3C. Orientou a separação entre leitura e perguntas, furigana editorial, retomada, áreas de toque de 48 dp e revisão de texto ampliado. A consulta à interface atual da NHK não pôde ser verificada e não embasou afirmações sobre seus recursos atuais. Não foi feito teste com usuários nem alegação de melhoria mensurada de aprendizagem.

## Três rodadas de autoavaliação e melhorias

A prévia usa os componentes reais e os hooks de Histórias, com o OfflineEngine real e transporte/dados locais de demonstração. Não cria histórias na conta de produção. Rodadas executadas em sequência, após a implementação inicial.

| Rodada                  | Inspeção e problema observado                                                                                                                                                                                                                                                                                                                             | Modificação                                                                                                                                                                                                                                                    | Revalidação                                                                                                                   |
| ----------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| 1 — Encontrar e começar | Em 360 px, abrir N4, ler e voltar manteve filtro e progresso. Os seis níveis mediam 47,5 px de largura, e o cabeçalho ocupava duas linhas grandes antes dos filtros.                                                                                                                                                                                      | Cabeçalho curto **Histórias**, níveis com largura mínima de 48 e quebra de linha; leitura iniciada com destaque e ação específica.                                                                                                                             | Em 320 px, níveis medidos com largura mínima de 48 e altura de 48; cartões e títulos quebram sem corte.                       |
| 2 — Ler e compreender   | Em 320 px, selecionar uma resposta errada, consultar o texto, desligar furigana, ampliar fonte e voltar preservou a seleção. O switch media 40×20 e a explicação ficava abaixo da dobra após confirmar.                                                                                                                                                   | Linha inteira da furigana acionável, mínimo de 48; aviso quando não existem leituras; rolagem até a explicação após confirmação; proteção de largura dos segmentos.                                                                                            | Switch medido em 290×48 em 360 px; resposta confirmada traz explicação à vista. O texto e a seleção permaneceram disponíveis. |
| 3 — Retomar e concluir  | Reabrir retomou a pergunta 2 e conservou a primeira resposta; conclusão 1/2 apareceu no histórico. **Reler** levava ao resultado; a revisão não mostrava a resposta errada escolhida. Simulação de fonte 200% em 320 px sobrepunha rótulos do filtro de estado. Revisão do código identificou ordem incerta dos eventos de layout ao restaurar parágrafo. | Releitura abre texto, revisão explicita resposta escolhida/correta, restauração aguarda medidas do corpo e do parágrafo, erros de gravação permanecem visíveis, filtros permitem ampliação e quebra. Catálogo recebe o gesto de atualizar no scroll existente. | Fluxos e casos de persistência cobertos por testes. Inspeção final da prévia e limites de validação registrados abaixo.       |

Os testes automatizados cobrem propriedade, validação de conteúdo, paginação, idempotência, ordenação de eventos, conclusão parcial rejeitada, restart, falha de disco, ACK perdido, resultado de outro aparelho, arquivos/restauração, retenção do leitor aberto, preferências, filtros e navegação com um único scroll.

Verificação da implementação inicial: `npm run check` passou, incluindo formatação, lint, tipos e **607 testes** (389 mobile, 195 backend e 23 scripts). Os últimos ajustes visuais passaram novamente pelos 49 testes focados de Histórias/navegação e lint. Na prévia, foram confirmados filtros vazios, paginação de 20 para 25 sem repetição, conclusão e releitura offline, fonte 200% em 320 px, além das larguras 360 e 412 px. A ampliação revelou também um símbolo decorativo com altura fixa e excesso de texto na barra superior: o símbolo agora cresce com o texto e a barra mantém apenas Voltar/Aa; a nova captura ficou sem sobreposição.

**Limite da avaliação:** a simulação web amplia as fontes e entrelinhas a 200%; ela não substitui escala real do Android, TalkBack, botão físico Voltar ou o gesto de refresh no aparelho. Essa etapa de avaliação não incluiu novo APK, teste manual Android, deploy ou configuração remota dos novos escopos OAuth; a publicação posterior está registrada abaixo.

A exportação Android do Expo também passou: 990 módulos compilados e bundle Hermes gerado em `.tools/stories-export`. Isso valida o empacotamento do JavaScript nativo; não equivale a instalar ou testar um APK no aparelho.

## Ajuste solicitado após a prévia

Em 10/10/2026, o usuário confirmou tradução disponível em todos os parágrafos, remoção dos controles de fonte e CRUD de histórias pelo MCP. A demo recebeu traduções completas nos quatro parágrafos; o leitor exibe apenas o toggle de furigana, e cada tradução abre ou fecha de forma independente. Os controles de fonte da própria prévia também foram removidos. Essas escolhas substituem as alternativas de leitura descritas nas rodadas históricas acima.

O CRUD adiciona edição com controle de versão e exclusão reversível. A revisão identificou dois cuidados adicionais: uma resposta de rede atrasada não pode trocar a edição após a confirmação do progresso; uma leitura ainda não iniciada precisa consultar a edição atual antes de salvar automaticamente o primeiro parágrafo. Ambos foram corrigidos. Leituras já iniciadas e o modo offline continuam abrindo diretamente do cache; falha de consulta usa o conteúdo local com aviso.

Validação deste ajuste: `npm run check` passou com formatação, lint, tipos e **629 testes** (401 mobile, 205 backend e 23 scripts). A verificação visual abriu as quatro traduções, fechou a segunda sem afetar as outras e alternou furigana; a largura de 320 px manteve os controles sem sobreposição. Testes cobrem criação/edição sem tradução, CRUD autenticado, conflitos de edição, respostas offline nas versões preservadas e consulta inicial antes de iniciar uma nova leitura. Nenhum deploy ou novo APK foi feito neste ajuste.

Na publicação inicial do backend, em 10/10/2026 no fuso `America/Sao_Paulo`, o backend de histórias foi publicado em DEV e PROD a partir de `/home/golias/projects/beta`, e os escopos Clerk foram cadastrados e permitidos nos clientes existentes. Os dois plugins ChatGPT importaram as 29 ferramentas, incluindo o CRUD de histórias. Uma incompatibilidade do padrão Unicode do JSON Schema foi corrigida mantendo a validação de kana; passaram 34 testes MCP, tipos, lint e validação dos 58 schemas com Python `jsonschema`. O smoke autenticado de leitura, PKCE e refresh passou nos dois ambientes, sem alterar dados pessoais. Os dois plugins foram reconectados após autorização dos novos escopos e retornaram conectados ao ChatGPT, sem erro. Consulte o estado operacional e os recibos em [Produção](production.md) e [MCP](mcp.md). A publicação do backend não inclui um novo APK.

## Publicação da extensão de histórias em quests

A leitura independente por `questId` e os alvos `storyIds` foram publicados a
partir de `/home/golias/projects/beta`: DEV em `2026-10-11T02:38:13.440Z` e PROD
em `2026-10-11T02:38:52.368Z`. Os dois plugins ChatGPT confirmaram o contrato
atualizado, com `storyIds` em `create_quest` e `completedStoryIds` em `get_quest`,
mantendo 29 ferramentas. Os recibos de deploy atuais substituem os da publicação
inicial descrita acima; a evidência específica desta extensão está em
`.tools/quest-stories-release-receipt.json`.

A validação completa passou com formatação, lint, tipos e **661 testes**
(423 mobile, 215 backend e 23 scripts). Foram verificadas remotamente descoberta
HTTP 200 com 14 escopos, proteção MCP HTTP 401, CORS HTTP 204 e funções publicadas
nos dois ambientes. Os novos testes incluem seleção mista, leitura exclusiva da
quest, preservação de versões e progresso, prazo, replay e isolamento entre
contas. Não foram repetidos o smoke OAuth completo nem a reconexão da etapa
anterior; não houve novo APK nesta extensão.

## Dúvidas guardadas para você responder quando voltar

Nenhuma resposta foi solicitada durante sua ausência. Estas decisões são revisáveis:

| Pergunta                                                          | Decisão adotada                                                                                                               |
| ----------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| Histórias merece uma aba própria?                                 | Entrada no Benkyou, preservando as seis abas.                                                                                 |
| Qual nome japonês prefere?                                        | **物語 · Monogatari**, acompanhado de Histórias.                                                                              |
| Precisa acertar tudo para concluir?                               | Não; todas as perguntas respondidas e confirmação final concluem, com nota separada.                                          |
| Quer refazer o questionário e guardar múltiplas tentativas?       | Nesta versão, releitura e revisão mantêm o resultado original.                                                                |
| Repetir a história em uma quest substitui meu resultado anterior? | Não. Cada quest tem seu próprio progresso; a leitura avulsa e os resultados das outras quests ficam preservados.              |
| Furigana deve começar ligada ou seguir os kanjis conhecidos?      | Ligada inicialmente, preferência salva; personalização por conhecimento fica para depois.                                     |
| Áudio e dicionário entram nesta versão?                           | Permanecem fora do escopo. A tradução em todos os parágrafos foi confirmada pelo usuário neste ajuste.                        |
| Quanto tempo deve durar uma história?                             | Não imposto; catálogo mostra estimativa aproximada a 180 caracteres/minuto, uma hipótese editorial.                           |
| A futura task publica direto ou precisa de revisão?               | Contrato validado e pronto para publicação; agendamento e política editorial ainda não configurados.                          |
| Excluir deve apagar também o histórico?                           | Adotada exclusão reversível. Edição no mesmo ID preserva a versão de leituras iniciadas; a solicitação de CRUD está atendida. |
| Quanto histórico manter offline?                                  | Download recente limitado e cache de até 100, com proteção das leituras abertas e pendentes.                                  |
