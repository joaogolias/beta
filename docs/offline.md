# Uso offline e sincronização

O modo offline permite consultar e estudar **kanji, vocabulário e gramática já baixados**. BAB-14 mantém frente/verso, três avaliações, fila e conteúdo congelados, retomada, correção com **Voltar**, histórico e progresso por categoria/nível. O módulo **Shiken** do BAB-15 usa a mesma fila para tentativas, mas mantém provas de múltipla escolha, alternativas, cronômetros e histórico próprios. Seus resultados não entram no Benkyou. Áudio e imagens devem ser preparados antes de iniciar a prova.

Cadastrar, editar, arquivar e restaurar cards ou provas exige conexão e modo online. Essas alterações são confirmadas diretamente pelo servidor; somente o estudo cria novas operações locais pendentes. Filas de versões anteriores que contêm alterações de biblioteca continuam válidas e são enviadas antes de uma nova edição online, sem descarte automático. Quando uma alteração online já foi confirmada, uma falha no download posterior não a transforma em falha de cadastro: o app guarda a resposta recebida no cache e tenta atualizar a biblioteca novamente.

## Preparação e acesso

Entre na conta com internet e aguarde **Tudo sincronizado** antes do primeiro uso offline. A abertura sem conexão depende de o Clerk conseguir restaurar a sessão já autenticada neste aparelho, usando seus caches de tokens e recursos, e de existir um perfil local dessa mesma conta. O cache de recursos do Clerk é experimental. Login novo, entrada após sair, recuperação de senha e sessão que não puder ser restaurada exigem internet; o cache da biblioteca não cria uma autenticação alternativa.

Os dados locais ficam separados por URL do ambiente Convex e usuário Clerk. Trocar de conta não revela a biblioteca anterior. Sair com pendências mostra um aviso: a fila permanece guardada para a próxima entrada na mesma conta. Desinstalar ou limpar os dados do aplicativo remove o que ainda não foi sincronizado.

## Persistência e envio

O app salva biblioteca, sessões, estatísticas, histórico recente e fila de operações no armazenamento SQLite do Android. Cada gravação substitui o estado confirmado e a fila juntos. A interface só confirma uma alteração ou avança o card depois dessa gravação; falha de armazenamento mantém a ação disponível para tentar novamente.

A perda confirmada de internet abre um convite para continuar offline. Aceitar salva essa escolha por conta no aparelho. Recusar encerra a observação automática de internet até reiniciar o processo do app; a engrenagem ao lado de sair continua permitindo ativar o modo manualmente. Uma desconexão apenas do servidor, sem perda de internet, não dispara o convite.

No modo online, a sincronização envia as operações em ordem quando há autenticação Convex e conexão, com o app aberto, ao voltar para ele e nas tentativas periódicas de 30 segundos. No modo offline, essas tentativas ficam suspensas mesmo quando a internet volta ou o app é reaberto. Para sair, o usuário escolhe **Sincronizar e voltar online** nas configurações: a fila é enviada e a biblioteca atualizada antes de confirmar a saída. Falha, conflito ou perda de conexão conserva o modo offline e as pendências. Não há serviço de sincronização garantido com o app encerrado. Um download que falha preserva a base local anterior.

Cada operação possui um identificador persistido. O servidor guarda seu conteúdo e resultado na mesma transação da alteração. Se a confirmação se perder, repetir o envio devolve o resultado anterior, sem duplicar cards ou respostas, inclusive depois de um **Voltar**. Identificadores locais são associados aos definitivos por usuário.

As respostas preservam o conteúdo e a data do estudo no aparelho. Uma edição remota não troca a resposta de uma sessão já iniciada. Cards arquivados localmente antes de serem apresentados são pulados: essa decisão acompanha a resposta enviada, para aparelho e servidor avançarem à mesma posição. Arquivar remotamente um card depois de ele ter sido estudado offline não apaga aquela resposta.

## Conflitos

Edições usam a versão e o estado de arquivo conhecidos pelo aparelho. Divergências, uma sessão ativa em outro dispositivo ou conteúdo inválido interrompem a fila e bloqueiam novas alterações; a consulta local continua disponível. Nada é descartado automaticamente.

- **Usar alterações deste aparelho**, quando disponível, exige confirmação. Aplica os campos editados sobre o card remoto ou encerra a outra sessão ativa para receber a sessão local. As demais pendências continuam na fila.
- **Usar versão da nuvem** exige confirmação para descartar **toda a fila ainda pendente neste aparelho**, incluindo cadastros, edições e respostas, e baixar a conta novamente. Operações já confirmadas no servidor permanecem.
- Escolher a versão local não ignora proprietário nem validações. Uma sessão criada offline com um card que foi arquivado remotamente continua em conflito até esse card ser restaurado na nuvem; essa escolha não o restaura automaticamente.

## Limites desta versão

| Item                  | Limite e comportamento                                                                                                                                                  |
| --------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Biblioteca baixada    | Até 3.000 cards somando categorias, ativos e arquivados. Acima disso o download falha e preserva o cache anterior.                                                      |
| Estatísticas baixadas | Até 1.000 cards com tentativas. Se houver mais, o app interrompe o download completo para não apresentar progresso parcial como completo.                               |
| Fila pendente         | Até 2.000 operações, incluindo revelar, responder e voltar. Ao atingir o limite, é preciso sincronizar antes de alterar mais dados.                                     |
| Estudo                | Até 100 cards por sessão e 1.000 candidatos após os filtros locais. O comando de sincronização aceita até 500 KB; sessões com textos extensos podem exigir menos cards. |
| Histórico offline     | As 100 tentativas mais recentes da conta baixadas, mais as respostas locais ainda presentes no cache/fila. Não corresponde a 100 por card.                              |
| Histórico online      | Consulta paginada completa por card quando autenticado, conectado e sem operações pendentes; não apaga o histórico mais antigo do servidor.                             |

O progresso offline usa estatísticas acumuladas baixadas, não apenas as 100 tentativas em cache. Alterações remotas só ficam visíveis depois de um download bem-sucedido. Datas de ações devem ser válidas e não estar mais de cinco minutos à frente do servidor.

Questões e histórico são baixados em páginas com orçamento de 2 MiB, mantendo até 100 tentativas recentes mesmo quando exigem várias consultas. As consultas diretas do servidor para selecionar cards ou calcular progresso têm orçamento de 6 MiB de conteúdo; ao excedê-lo, retornam um erro explícito em vez de apresentar uma seleção ou estatística incompleta. A criação direta de sessões limita os snapshots a 450 KB; no app, continua valendo também o limite do comando offline.

## Verificação no Android

1. Instalar o APK, entrar com internet e aguardar **Tudo sincronizado**. Conferir as três bibliotecas de cards, o catálogo Shiken e os totais de progresso.
2. Ativar modo avião e aceitar o modo offline. Consultar e buscar cards. Confirmar que cadastrar, editar, arquivar e restaurar exige voltar ao modo online com internet.
3. Iniciar estudo, revelar e usar as três avaliações. Voltar, corrigir uma resposta e conferir o progresso. Verificar também tentativas de Shiken com o conteúdo já baixado.
4. Forçar o encerramento, reabrir ainda sem internet e conferir biblioteca, pendências, sessão, verso revelado e opção **Voltar**. Nenhuma ação já confirmada pela interface deve desaparecer.
5. Reconectar com o app aberto e conferir que o modo offline e as pendências continuam. Escolher **Sincronizar e voltar online** na engrenagem, aguardar **Tudo sincronizado** e conferir IDs, versões, datas, respostas e totais na conta; repetir a sincronização não pode duplicar registros. Recusar o convite em outra execução não deve exibi-lo novamente ao alternar conexão ou voltar do segundo plano.
6. Em outro dispositivo/cliente, editar o mesmo card ou iniciar outra sessão antes de reconectar o primeiro. Verificar as duas confirmações de conflito, cancelar sem perda e testar cada resolução com dados descartáveis.
7. Testar saída com pendências e troca de conta: a outra conta não pode receber dados ou operações anteriores. Voltar à conta original deve conservar sua fila.

Os testes automatizados cobrem persistência simulada, reinício do motor local, isolamento entre contas, falhas de gravação, conflitos e integração do motor com Convex. O cenário integrado inclui criar/editar, pular um card arquivado, responder, voltar, corrigir, perder a confirmação do servidor e reiniciar antes do reenvio. Testes e prévia de navegador não substituem a verificação física, especialmente conflitos entre aparelhos e reprodução das mídias de um simulado completo.

Em 2026-10-03, a validação no Galaxy S24+ confirmou recuperação da fila de vocabulário do APK anterior sem descarte, modo offline, sessão autenticada e pendências preservados após reiniciar o processo com Wi-Fi e dados móveis desligados, bloqueio de cadastro offline, envio somente pela saída manual, convite após desligar Wi-Fi e dados móveis e ausência de novo convite após recusar e repetir a perda de conexão. No APK 18, passaram os testes de deslizar para a direita para acertar e para a esquerda para errar, toque duplo no verso para acerto parcial, toque simples para voltar à frente e **Voltar** para desfazer a resposta anterior. A rolagem vertical ficou livre, sem usar o arrasto para baixo como avaliação. O logout retornou à tela de login mantendo o processo vivo, sem erro fatal nem a exceção de cliente Convex fechado nos logs. As redes foram restauradas ao estado inicial. O catálogo Shiken dessa conta estava vazio; tentativas e mídias offline desse módulo foram verificadas pelos testes automatizados, sem uma prova completa no aparelho.
