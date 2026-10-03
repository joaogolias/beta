# Treino autoral N5 de desenvolvimento

`jlpt-n5-authorial.json` contém 20 questões inéditas: cinco de kanji/vocabulário, cinco de gramática, cinco de leitura e cinco de escuta. A classificação segue os [tipos de questão publicados pelo JLPT](https://www.jlpt.jp/e/samples/sample09.html); nenhum enunciado, gabarito ou áudio foi copiado de provas oficiais. É um conjunto curto de prática, sem a quantidade de questões de uma edição oficial e sem equivalência entre seu percentual de acertos e a escala do JLPT.

As transcrições ficam separadas do enunciado no arquivo-fonte. O importador as acrescenta à explicação, disponível na correção. Os áudios são voz sintetizada japonesa, não gravações de uma prova.

## Preparação e importação

Execute com o Node 24 do projeto, no Linux/WSL:

```sh
node scripts/jlpt-dev-seed.mjs --prepare
node scripts/jlpt-dev-seed.mjs --inspect
node scripts/jlpt-dev-seed.mjs --apply
```

`--prepare` só valida o conjunto e gera WAVs PCM16 com o runtime isolado de Open JTalk já existente em `.tools/jlpt-tts/runtime`. O script não instala dependências de sistema. Mantém os WAVs e um relatório de duração/checksum em `.tools/jlpt-n5-seed/`.

Antes de `--inspect` ou `--apply`, o operador precisa publicar `backend/convex/jlptDevSeed.ts` no **desenvolvimento** pelo fluxo normal de deploy do repositório. O script nunca publica código. As funções são internas e recusam qualquer deployment que não seja `kindhearted-hare-87`.

`--apply` resolve `joaovgolias@gmail.com` no Clerk de desenvolvimento, encontra o usuário existente pelo identificador autenticado e não cria usuários. Envia cinco arquivos distintos ao armazenamento Convex, confirma seus checksums e baixa cada URL HTTPS para validar disponibilidade, formato e integridade antes de inserir o simulado. Mantém um manifesto local retomável, sem credenciais, em `.tools/jlpt-n5-seed/uploads.json`.

Executar novamente com o mesmo manifesto e conteúdo retorna o mesmo simulado. Renomear o simulado não cria uma cópia: o marcador de origem e os IDs das questões também identificam o conjunto. Alterações do usuário são preservadas; se o conteúdo divergir, a importação para com um erro em vez de sobrescrever. Um simulado arquivado também permanece arquivado. Se o manifesto local foi perdido, o script para antes de enviar áudios duplicados quando encontra o simulado existente.

## Voz e atribuição

Áudio gerado pelo [Open JTalk](https://open-jtalk.sp.nitech.ac.jp/), com a voz `nitech-jp-atr503-m001`, sob [Creative Commons Attribution 3.0](https://creativecommons.org/licenses/by/3.0/). Créditos do modelo de voz: Nagoya Institute of Technology, Department of Computer Science (2003–2012), e Tokyo Institute of Technology, Interdisciplinary Graduate School of Science and Engineering (2003–2008). Roteiros autorais escritos para o Babel Crux; sem vínculo ou endosso dessas instituições ou do JLPT. Essa atribuição também acompanha o campo de fonte do simulado importado.
