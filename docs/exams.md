# Simulados JLPT — Shiken

O BAB-15 é um módulo de provas de múltipla escolha, separado dos cards de memória. **試験 · Shiken** mantém provas, alternativas marcadas, cronômetros e resultados próprios. As respostas nunca entram no Benkyou ou nas estatísticas de memorização.

## Estrutura

Cada prova tem título, um nível N1–N5, descrição e fonte opcionais, e questões ordenadas de quatro áreas: kanji/vocabulário, gramática, leitura e escuta. Os tipos de questão disponíveis acompanham o nível. Questões escritas têm quatro alternativas; escuta aceita três ou quatro. Cada questão guarda gabarito, explicação, texto de apoio e, quando necessário, imagem e áudio por URL HTTPS.

Os blocos seguem a [estrutura oficial](https://www.jlpt.jp/e/guideline/testsections.html):

| Nível | Vocabulário                                      | Gramática + leitura | Escuta |
| ----- | ------------------------------------------------ | ------------------- | ------ |
| N5    | 20 min                                           | 40 min              | 30 min |
| N4    | 25 min                                           | 55 min              | 35 min |
| N3    | 30 min                                           | 70 min              | 40 min |
| N2    | Vocabulário, gramática e leitura juntos: 105 min | Mesmo bloco         | 50 min |
| N1    | Vocabulário, gramática e leitura juntos: 110 min | Mesmo bloco         | 55 min |

A duração de escuta é uma referência e pode variar conforme a gravação. Não se exige uma quantidade fixa de questões inferida dos exemplos oficiais. Uma seleção autoral breve deve ser identificada como tal, sem se apresentar como caderno oficial completo.

## Cadastro e aplicação

O cadastro pode ser salvo como rascunho e editado por área. Para iniciar, deve conter as quatro áreas e áudio em todas as questões de escuta. O app prepara as mídias necessárias antes de iniciar o relógio; uma falha de download impede iniciar uma prova incompleta. Arquivar retira a prova do catálogo ativo e mantém as tentativas anteriores.

Durante a prova, o usuário marca uma alternativa, pode limpar a resposta, sinalizar questões para revisar e navegar dentro do bloco atual. Avançar para outro bloco exige confirmação e fecha o anterior. O prazo é absoluto: sair da tela ou fechar o app não reinicia nem pausa o cronômetro. Depois do prazo, novas respostas daquele bloco são bloqueadas; o usuário inicia o próximo quando estiver pronto. A entrega pode ser antecipada mediante confirmação, deixando as questões restantes sem resposta.

Na última questão de cada bloco, a navegação ao lado de “Anterior” passa a oferecer “Próximo bloco” ou “Finalizar prova”. A ação continua acessível mesmo com respostas em branco, sempre com a confirmação correspondente.

Não há frente/verso, autoavaliação ou revelação antecipada do gabarito. A entrega libera correção automática, acertos, erros, questões em branco, percentual por área e revisão das alternativas com explicações. A pontuação oficial usa uma escala própria; o app não converte acertos para 0–180 nem declara aprovação oficial. Consulte a [pesquisa e fontes](research/jlpt-exam-structure.md).

## Persistência e compatibilidade

Provas e tentativas pertencem ao usuário autenticado. A tentativa congela a prova e o gabarito; editar o cadastro não altera o que foi respondido. Revisões impedem sobrescrever alterações concorrentes. Cadastro e edição exigem internet e modo online. A fila offline preserva alternativas, marcações, avanço e entrega antes de confirmar a ação na interface. Recibos e aliases evitam duplicação ao repetir envios. Tentativas offline só são enviadas quando o usuário escolhe sincronizar e voltar online nas configurações.

Os arquivos de mídia são baixados separadamente com verificação de conclusão. Apenas arquivos efetivamente disponíveis são tratados como preparados para offline. O cache de dados mantém até 200 provas e as 100 tentativas mais recentes, além da ativa; o histórico completo pode ser consultado online. Cada prova aceita até 200 questões e 400 KB de conteúdo textual.

Os antigos registros de examCards e seu histórico foram preservados para compatibilidade. Não são convertidos automaticamente em provas: perguntas abertas não fornecem alternativas, gabarito estruturado nem área confiável. Novas seleções do Benkyou excluem esses itens. Comandos antigos já pendentes podem terminar sua sincronização.

A prévia usa uma seleção fictícia independente. Em 2026-09-21, o desenvolvimento recebeu o simulado **N5 · Treino autoral 01 — 20 questões** para `joaovgolias@gmail.com`: cinco questões de cada área, com cinco áudios japoneses sintetizados e armazenados no Convex. O cadastro real foi conferido no banco, incluindo proprietário, integridade das mídias e reexecução sem duplicação. Não contém questões copiadas de cadernos oficiais. Consulte [conteúdo, atribuição e importador](data/jlpt-n5-authorial.md).

## Validação

Testes cobrem estrutura por nível, campos e alternativas, proprietários, snapshots, revisões, prazos, bloqueio de retorno a blocos, correção, persistência após reinício e repetição de envio sem duplicação. A validação visual usa as telas reais com armazenamento e mídia de demonstração. No Android, conferir também reprodução do áudio baixado, retomada após encerrar o processo e sincronização após modo avião.

Em 2026-09-19, a prévia confirmou respostas e marcações preservadas após recarregar offline, resultado de 5/8 com um erro e duas questões em branco, gabarito após entrega e fila sincronizada ao reconectar ao servidor simulado. A navegação corrigida foi conferida nos três blocos até a entrega. O APK de desenvolvimento 13 inclui a correção. A reprodução no Android ainda requer validação física. Houve um encerramento da aba integrada ao acionar Play no navegador, sem causa confirmada; a revisão estática e a integridade do WAV não identificaram o motivo.
