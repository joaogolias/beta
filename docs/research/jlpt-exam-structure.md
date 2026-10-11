# JLPT: estrutura para o módulo Shiken

Consulta em 19/09/2026. Somente fontes oficiais do domínio jlpt.jp. Esta nota
separa fatos publicados de recomendações de implementação.

## Blocos e tempos

As quatro áreas pedagógicas são vocabulário/kanji, gramática, leitura e escuta.
Elas não correspondem a quatro cronômetros oficiais. N1/N2 juntam as três
primeiras; N3–N5 separam vocabulário de gramática/leitura. Escuta tem bloco próprio.

| Nível | Blocos na ordem da aplicação               | Minutos    |
| ----- | ------------------------------------------ | ---------- |
| N1    | Conhecimento linguístico + leitura; escuta | 110; 55    |
| N2    | Conhecimento linguístico + leitura; escuta | 105; 50    |
| N3    | Vocabulário; gramática + leitura; escuta   | 30; 70; 40 |
| N4    | Vocabulário; gramática + leitura; escuta   | 25; 55; 35 |
| N5    | Vocabulário; gramática + leitura; escuta   | 20; 40; 30 |

O tempo de escuta pode variar com a gravação. Os tempos de N4/N5 mudaram em
dezembro de 2020; o de escuta N1 mudou em dezembro de 2022. Não usar os tempos
antigos dos cadernos de exemplo como configuração atual.
[Fonte: composição e tempos](https://www.jlpt.jp/sp/e/guideline/testsections.html).

## Tipos de questões por nível

- Todos: leitura de kanji, expressão adequada ao contexto, paráfrase; escolha da
  forma gramatical, composição de frase, gramática textual; leitura curta, média
  e busca de informação.
- Ortografia: N2–N5. Formação de palavras: somente N2. Uso de vocabulário: N1–N4.
- Compreensão de texto longo: N1/N3. Integração de textos e compreensão temática
  de texto longo: N1/N2.

Essas são categorias oficiais, não uma lista fechada de palavras/kanji a importar.
[Fonte: tabela de tipos](https://www.jlpt.jp/sp/e/guideline/testsections.html).

As extensões de leitura orientam o suporte a textos compartilhados e rolagem:
N1 inclui textos de cerca de 1.000 caracteres e comparação de textos;
N2 inclui compreensão temática de cerca de 900; N3, texto longo de cerca de 550;
N4, leitura média de cerca de 450; N5, leitura média de cerca de 250. Não são
limites de validação para o app.
[N1](https://www.jlpt.jp/e/guideline/pdf/n1_e_revised.pdf?mode=pc),
[N2](https://www.jlpt.jp/e/guideline/pdf/n2_e.pdf?mode=pc),
[N3](https://www.jlpt.jp/e/guideline/pdf/n3_e.pdf?mode=pc),
[N4](https://www.jlpt.jp/e/guideline/pdf/n4_e_revised.pdf?mode=pc),
[N5](https://www.jlpt.jp/e/guideline/pdf/n5_e_revised.pdf?mode=pc).

## Escuta e formato da resposta

O JLPT é de múltipla escolha: normalmente quatro alternativas; algumas questões
de escuta têm três. Não há prova de conversação nem de redação. Portanto, a
correção em Shiken deve comparar a alternativa marcada ao gabarito, sem depender
da autoavaliação dos cards de Benkyou.
[Fonte: FAQ, test questions](https://jlpt.jp/sp/e/faq/).

| Tipo de escuta                                            | Níveis |
| --------------------------------------------------------- | ------ |
| Resolução de tarefa e identificação de pontos importantes | N1–N5  |
| Compreensão geral                                         | N1–N3  |
| Escolha de expressão adequada à situação ilustrada        | N3–N5  |
| Resposta rápida a uma fala curta                          | N1–N5  |
| Integração de informações de gravação mais longa          | N1–N2  |

Expressões verbais combinam áudio com ilustração; resposta rápida trabalha com
falas curtas; integração exige combinar informações. A mídia precisa ser parte
da questão, não apenas um link externo. Não confundir roteiro/transcrição com o
conteúdo apresentado ao candidato.
[N1](https://www.jlpt.jp/e/guideline/pdf/n1_e_revised.pdf?mode=pc),
[N3](https://www.jlpt.jp/e/guideline/pdf/n3_e.pdf?mode=pc),
[N5](https://www.jlpt.jp/e/guideline/pdf/n5_e_revised.pdf?mode=pc).

Os materiais oficiais oferecem áudio e roteiro separadamente, além de gabaritos.
A coleção de exemplos não tem necessariamente a quantidade de questões da prova.
Não foi confirmada nesta pesquisa uma regra oficial universal de repetição do
áudio; não anunciar uma política inventada como regra do JLPT.
[Fonte: materiais de exemplo](https://www.jlpt.jp/e/samples/sample09.html).

## Resultado

| Nível | Faixas das seções de resultado               | Mínimo geral | Mínimos por seção |
| ----- | -------------------------------------------- | ------------ | ----------------- |
| N1    | Conhecimento 0–60; leitura 0–60; escuta 0–60 | 100/180      | 19 em cada        |
| N2    | Mesmas faixas de N1                          | 90/180       | 19 em cada        |
| N3    | Mesmas faixas de N1                          | 95/180       | 19 em cada        |
| N4    | Conhecimento + leitura 0–120; escuta 0–60    | 90/180       | 38; 19            |
| N5    | Conhecimento + leitura 0–120; escuta 0–60    | 80/180       | 38; 19            |

A aprovação exige mínimo geral e todos os mínimos por seção. Ausência de uma
seção invalida a aprovação. Blocos de aplicação e seções de resultado são
conceitos distintos.
[Fonte: resultados](https://www.jlpt.jp/e/guideline/results.html?pScanchor5=).

A pontuação oficial é escalonada por teoria de resposta ao item (IRT), conforme
o padrão de respostas. Não é uma soma de pontos fixos e duas pessoas com a mesma
quantidade de acertos podem ter notas diferentes. Consequência de produto:
mostrar acertos/total e percentuais do simulado; não converter proporcionalmente
para 180 nem prometer aprovação oficial. Uma estimativa futura exigiria método
próprio claramente identificado e validado.
[Fonte: cálculo oficial](https://jlpt.jp/e/about/pdf/scaledscore_e.pdf?mode=pc).

## Conteúdo real e requisitos sugeridos

Os cadernos oficiais de 2012 e 2018 contêm seleções de questões efetivamente
aplicadas desde 2010, com quantidade próxima de uma prova; o site não publica
integralmente cada aplicação passada. O uso dos cadernos segue a política do
site, e áudios incluem direitos de terceiros. Importar somente conteúdo que o
autor possa utilizar; guardar fonte e edição, distinguindo prova oficial,
seleção oficial e simulado autoral. Não cadastrar as fixtures fictícias como
provas reais.
[Fonte: cadernos oficiais e condições de uso](https://www.jlpt.jp/e/samples/sampleindex.html?mode=pc).

Recomendações de implementação (inferências para o beta):

1. Prova identificada por nível, título/edição, origem e blocos ordenados; questões
   pertencem a uma das quatro áreas e a um tipo de questão.
2. Questão com enunciado, alternativas com IDs estáveis, alternativa correta,
   explicação, texto de apoio compartilhável e mídia opcional. Escuta exige áudio
   disponível para iniciar a tentativa.
3. Tentativa com alternativas marcadas, questões pendentes, navegação, entrega
   explícita e resultado automático. Gabarito, explicação e transcrição aparecem
   após a entrega, sem autoavaliação de acerto/parcial/erro.
4. Shiken possui histórico próprio; respostas não entram nas estatísticas de
   memória de Benkyou. Na revisão, mostrar a escolha e a resposta correta.
5. Temporizadores opcionais por bloco; um treino parcial deve ser identificado
   como parcial. Não fixar quantidades de questões com base no caderno de 2009.
6. Offline exige download verificado de todos os áudios necessários. Guardar a
   tentativa e suas respostas antes de avançar, com sincronização idempotente.
