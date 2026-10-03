# Kanji N5: fontes da carga pessoal em desenvolvimento

Consulta e preparação: 9 de setembro de 2026. Dataset: [jlpt-n5-kanji.json](../data/jlpt-n5-kanji.json).

## Resultado da carga em desenvolvimento

Importação concluída em `kindhearted-hare-87`: 102 cards novos e reaproveitamento de um `二` arquivado. As leituras desse registro foram corrigidas pela fonte e ele foi reativado, mantendo sua identidade. Foram verificados 103 símbolos distintos, ativos e classificados como N5, todos visíveis pela API autenticada usada pelo app. Frente e verso foram conferidos contra o formato canônico. A carga não registrou tentativas de estudo.

## Lista escolhida

Foram selecionados **103 kanji** do KANJIDIC2 cujo campo `misc/jlpt` é `4`, a classificação anterior a 2010. A própria documentação relaciona esse nível antigo ao N5 atual. Trata-se de uma referência de estudo; o JLPT não publica uma lista oficial fechada de kanji para o formato atual. Fontes: [documentação KANJIDIC](https://www.edrdg.org/wiki/KANJIDIC_Project.html) e [FAQ oficial JLPT](https://www.jlpt.jp/e/faq/index.html).

A comparação feita nesta consulta explica as contagens diferentes:

| Referência                                                   | Contagem observada | Uso nesta carga                         |
| ------------------------------------------------------------ | -----------------: | --------------------------------------- |
| KANJIDIC2 `misc/jlpt=4`                                      |                103 | Seleção e informações dos cards         |
| [JLPT Sensei N5](https://jlptsensei.com/jlpt-n5-kanji-list/) |                 80 | Conferência da diferença entre listas   |
| [KanjiAPI N5](https://kanjiapi.dev/v1/kanji/jlpt-5)          |                 79 | Conferência; não usado para gerar dados |

Os 79 símbolos da KanjiAPI estão contidos nos 103 escolhidos. A lista de 80 do JLPT Sensei acrescenta `分` aos 79. Os outros 23 presentes na seleção histórica são `安飲駅花会魚空言古口耳社手週少新足多店道買目立`. São contagens e diferenças calculadas nesta consulta, não uma afirmação de equivalência oficial entre todas as listas.

A [KanjiAPI](https://kanjiapi.dev/) atribui seus níveis ao [Tanos/Jonathan Waller](https://www.tanos.co.uk/jlpt/). Seu arquivo [jlpt.tsv](https://raw.githubusercontent.com/onlyskin/kanjiapi.dev/master/jlpt.tsv) permite conferir a seleção. A [licença Tanos](https://www.tanos.co.uk/jlpt/sharing/) declara CC BY, sem indicar versão; a seleção Tanos não foi reutilizada neste dataset.

## Dados e transformação

O arquivo veio do [download oficial KANJIDIC2](http://ftp.edrdg.org/pub/Nihongo/kanjidic2.xml.gz). A URL HTTP é publicada pelo projeto; a variante HTTPS do mesmo host apresentou erro de TLS nesta consulta. O cabeçalho recebido informa `file_version=4`, `database_version=2026-252` e `date_of_creation=2026-09-09`.

Foram copiados `literal`, leituras `ja_kun`/`ja_on` e significados `meaning[m_lang=pt]`. Pontos de okurigana e hífens permanecem nas leituras. O radical usa `rad_value[rad_type=classical]`, convertido para ideograma CJK unificado pela terceira coluna de [CJKRadicals 17.0.0](https://www.unicode.org/Public/17.0.0/ucd/CJKRadicals.txt). Esse campo registra o radical de classificação, não todos os componentes visuais. Fontes: [DTD KANJIDIC2](https://www.edrdg.org/kanjidic/kanjidic2_dtdh.html) e o próprio arquivo Unicode.

Todos recebem idioma `ja`, escrita `Hani` e nível `N5`. A ordenação usa a primeira kun, ou a primeira on convertida para hiragana, sem pontos/hífens; o símbolo seria o último recurso. Exemplos ficam vazios. Frente e verso são omitidos para o Babel Crux produzir as faces canônicas. Nenhuma leitura, tradução ou radical foi inventado.

Validação local: 103 símbolos únicos; todos com significados em português, on'yomi e radical. `校`, `週`, `電` e `駅` têm kun'yomi vazia na fonte e mantêm `[]`. Os maiores arrays têm 11 significados e 18 leituras kun, dentro dos limites do modelo.

## Atribuição e licença

Os dados de kanji são do **KANJIDIC2, de James William Breen e do Electronic Dictionary Research and Development Group (EDRDG)**, utilizados conforme a [licença geral EDRDG](https://www.edrdg.org/edrdg/licence.html), **[CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/)**. Este extrato e suas transformações mantêm essa licença e esta atribuição. Não são importados códigos SKIP, descritores ou índices de outros dicionários.

O mapeamento dos radicais é do **Unicode Character Database 17.0.0, © 2025 Unicode, Inc.**, conforme a [Unicode License v3](https://www.unicode.org/license.txt).

Esta carga atende à biblioteca privada de um usuário em desenvolvimento. Caso esses dados sejam futuramente distribuídos como catálogo do app, manter a atribuição acessível e os documentos/licenças exigidos pela fonte, incluindo um meio de atualizar o extrato. A licença dos dados não exige que o código do aplicativo use a mesma licença.

## Integridade

SHA-256 dos bytes baixados ou gerados:

| Arquivo              | SHA-256                                                            |
| -------------------- | ------------------------------------------------------------------ |
| `kanjidic2.xml.gz`   | `4c420668e61cf10b14140c5528bd3517484bdb9bbe086d922445ee89d4bea4f5` |
| XML descompactado    | `d7db2776fdf505ef471e6efec78d16f7fb6f35da36c7b3631abea19318bbf1fc` |
| `CJKRadicals.txt`    | `826f83be25cd18fb8a5015a514704504e1982e840ea14d058bf583e1cc620c83` |
| `jlpt-n5-kanji.json` | `d56800796a0810c71fc51c9c73798a362a252d89bfc1afc785f7e67a5f16f4d9` |
