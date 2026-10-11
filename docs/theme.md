# Tema outdoor do beta

A BETA-24 aplica uma paleta de escalada outdoor em toda a interface, mantendo as cenas aprovadas da Betinha. Os tokens ficam em `mobile/src/theme.ts`; os recursos do widget usam os equivalentes em `mobile/modules/beta-streak/android/src/main/res/values/colors.xml`.

## Pesquisa e escolha

A combinação de verde pinheiro, terracota e ocre é uma escolha de design para aproximar o app de vegetação, rocha e luz natural, junto aos marrons e cremes da Betinha. As cores de arenito descritas pelo [National Park Service em Zion](https://home.nps.gov/zion/learn/nature/navajo-colors.htm) incluem vermelho, marrom, dourado e branco. A textura mineral se apoia na aparência de granito descrita no [guia geológico de Yosemite](https://www.nps.gov/yose/learn/nature/geology.htm). Essas referências orientam a paleta; não representam uma identidade visual oficial dos parques.

| Papel      | Cor                   | Uso                                              |
| ---------- | --------------------- | ------------------------------------------------ |
| Primária   | Pinheiro `#2E5948`    | Ações principais, seleção, navegação e acerto    |
| Secundária | Terracota `#9B4E32`   | Destaques, categorias e superfícies de conquista |
| Terciária  | Ocre `#876526`        | Apoio, classificação e resposta parcial          |
| Fundo      | Areia `#F5F1E8`       | Base das telas                                   |
| Superfície | Giz `#FFFCF6`         | Campos, cards e conteúdo                         |
| Texto      | `#292C25` / `#625F54` | Texto principal e secundário                     |
| Pedra      | `#696557` / `#494A40` | Contornos fortes, apoio e widget                 |
| Floresta   | `#203B31`             | Superfícies escuras e cards de estudo            |
| Erro       | `#A93529`             | Falhas e resposta incorreta, sempre com texto    |

Cada acento também tem versões claras e escuras. Os nomes dos tokens expressam o papel na interface, para que uma cor de marca não seja confundida com um resultado de estudo.

## Textura e acessibilidade

`RockTexture` reaproveita `mobile/assets/brand/mountain-icon-background.png`, uma textura de pedra e montanha já aprovada. A camada fica atrás do conteúdo, com baixa opacidade, sem capturar toques e fora da árvore de acessibilidade. Aparece em boas-vindas, coleções, sequência, progresso e áreas de estudo; formulários e textos longos mantêm superfícies limpas. Não há download de textura nem animação nova.

Os pares de texto atendem ao contraste mínimo de 4,5:1 definido pela [WCAG 2.1](https://www.w3.org/TR/WCAG21/#contrast-minimum). Os testes de tema também consideram os extremos claro e escuro da textura. Erro, acerto, parcial e seleção continuam identificados por rótulos, ícones ou estado acessível.

A arte da Betinha, os chifres, os tons naturais e o crash pad azul permanecem preservados. A textura aprovada do ícone também é mantida; o fallback Android, a máscara monocromática, as cores do widget e o destaque da notificação acompanham a nova paleta.
