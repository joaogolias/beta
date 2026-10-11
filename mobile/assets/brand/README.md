# Betinha, a ibex escaladora

Os seis PNGs `betinha-*.png` são as fontes aprovadas da mascote do beta. As cinco cenas de escalada correspondem à revisão v2 aprovada pelo usuário; o retrato conserva o rosto com o chifre corrigido. A aplicação no app, widget e ícone mantém esses desenhos sem alterações adicionais. As imagens têm fundo transparente e permanecem intactas ao reconstruir os derivados de marca.

| Arquivo                 | Cena aprovada                                                                                                                            |
| ----------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| `betinha-welcome.png`   | Boas-vindas: Betinha menor no primeiro plano, com uma pata dianteira dobrada, diante de uma grande montanha de planos azul-acinzentados. |
| `betinha-celebrate.png` | Muito feliz: Betinha escalando um boulder grande e íngreme, com planos em vários tons azul-acinzentados.                                 |
| `betinha-rest.png`      | Descanso: deitada de lado, corpo e rosto apoiados em um crash pad azul dobrável de dois painéis, olhos fechados.                         |
| `betinha-sad.png`       | Triste: corpo tombando e patas perdendo os apoios ao deslizar de um boulder grande.                                                      |
| `betinha-angry.png`     | Brava: magnésio branco nas patas, pelagem, pontas da barba e um chifre, com uma nuvem baixa de pó.                                       |
| `betinha-face.png`      | Retrato aprovado para os ícones e a abertura, com cada chifre contínuo e uma única ponta.                                                |

## Origem e aprovação

As imagens foram preparadas com a ferramenta integrada **ImageGen** em modo de edição, a partir da identidade e das poses aprovadas pelo usuário em 3 de outubro de 2026. Não houve uso do CLI ou de uma chamada externa à API. O usuário escolheu pelagem natural, retirou cachecol e bochechas rosadas e aprovou a silhueta quadrúpede de lado com o rosto voltado à pessoa. Depois aprovou as cenas de escalada v2 e escolheu o nome **Betinha**.

As instruções preservam pelagem marrom, focinho e barriga claros, olhos legíveis, barba pequena, cascos escuros e dois chifres curvos segmentados, contínuos e sem ramificações, cada um com uma única ponta. O rosto corrigido é a referência de identidade. O magnésio da cena brava é uma camada irregular de pó sobre a pelagem, mantendo a cor natural visível entre as manchas.

A cena de descanso foi aprovada na primeira rodada e conservada exatamente na revisão v2, sem regeneração. As demais cenas receberam apenas os refinamentos solicitados: montanha maior; boulders maiores com mais planos de cor; pose triste perdendo os apoios; magnésio também pela pelagem, barba e chifre. O retrato mantém a correção anterior do chifre à direita de quem vê: curva contínua terminando em uma única ponta afilada, sem alterar o rosto, outro chifre, cores ou enquadramento.

## Prompts preservados

Os arquivos abaixo são cópias exatas dos prompts usados na produção, versionadas junto das fontes de imagem. Os nomes e caminhos antigos dentro dos registros identificam as referências utilizadas à época; os nomes atuais de consumo são os `betinha-*.png` da tabela.

- [Fundo do ícone: degradê cinza com textura de montanha](prompts/mountain-icon-background.txt).
- [Boas-vindas v2](prompts/v2-prompts-welcome.txt).
- [Celebração v2](prompts/v2-prompts-a.txt).
- [Tristeza v2](prompts/v2-prompts-sad.txt).
- [Magnésio ampliado na cena brava v2](prompts/v2-prompts-b.txt).
- [Descanso aprovado e primeira cena brava](prompts/v1-prompts-b.txt): o bloco `REST` registra a cena de descanso mantida sem alterações; o bloco `ANGRY` registra a base refinada na v2.

As cenas intermediárias e galerias de revisão ficam em `artifacts/brand/climbing-scenes/`, com a aprovação final em `v2/`. Os prompts acima preservam a proveniência das fontes consumidas pelo app mesmo quando as galerias locais não estão disponíveis.

## Empacotamento e movimento

Na raiz, `npm run assets:brand` usa `scripts/brand-assets.mjs` e Resvg para colocar os PNGs em contêineres SVG e redimensioná-los. O comando não gera novos desenhos nem altera as fontes aprovadas.

Os derivados são `mobile/assets/icon.png`, `android-icon-foreground.png`, `android-icon-background.png`, `android-icon-monochrome.png`, `splash-icon.png`, `favicon.png` e os `beta_streak_*.png` no diretório de recursos Android do módulo `beta-streak`. O ícone usa o retrato da Betinha sobre um degradê cinza com textura de rocha, cuja fonte é `mountain-icon-background.png`. O fundo foi gerado com o ImageGen integrado, usando a montanha da cena de boas-vindas apenas como referência de estilo. A composição preserva o retrato aprovado; o retrato do ícone adaptativo fica dentro do círculo seguro central, e a versão monocromática aplica uma cor sólida à mesma transparência. O Android recebe a mesma textura como camada de fundo adaptativa, com `#696557` de fallback. O widget usa as novas cenas de acordo com o estado da sequência e uma base de rocha quente (`#494A40`), com texto giz (`#FFFCF6`) e apoio ocre claro (`#F2E8CC`).

Os derivados de desenvolvimento são `mobile/assets/icon-dev.png`, `android-icon-foreground-dev.png` e `android-icon-monochrome-dev.png`. `scripts/dev-icon.mjs`, também chamado por `npm run assets:brand`, sobrepõe a tag **DEV** aos PNGs de produção sem alterar as fontes da Betinha. As letras são contornos SVG determinísticos, sem dependência de fontes instaladas ou ImageGen. No adaptativo, a tag cabe no círculo seguro central de 66dp sobre o canvas de 108dp; no temático, as letras vazadas e a borda transparente mantêm a identificação ao aplicar a cor do Android. `mobile/app.config.ts` seleciona esses três arquivos somente quando `APP_ENV=development`, compartilhando o fundo adaptativo de produção. Para reconstruir apenas esses derivados, execute `node scripts/dev-icon.mjs` na raiz.

As animações do app são curtas, respeitam a preferência por movimento reduzido e param quando o app deixa o primeiro plano. Cada cena entra suavemente após carregar; a conquista recebe brilhos, o descanso sinais suaves de sono, o escorregão traços descendentes e a cena brava partículas de magnésio. Os PNGs ficam imóveis: os efeitos não deslocam montanhas, rochas nem crash pad. Não há animação de membros. O widget exibe as cenas estáticas conforme a sequência e o espaço disponível; as notificações usam o retrato para manter o rosto legível.
