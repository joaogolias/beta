import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { Resvg } from '@resvg/resvg-js';

// Letter outlines avoid platform font substitution in this small launcher tag.
const letters =
  'M0 0H27Q60 0 60 37Q60 74 27 74H0Z M16 15V59H26Q44 59 44 37Q44 15 26 15Z ' +
  'M80 0H133V15H96V29H128V44H96V59H133V74H80Z ' +
  'M150 0H168L188 53L208 0H226L197 74H179Z';
const badgeShape = '<rect x="340" y="623" width="344" height="132" rx="36"';
const badgeLetters = `<path d="${letters}" fill-rule="evenodd" transform="translate(399 652)"`;
const colorBadge = `${badgeShape} fill="#9B4E32" stroke="#FFFCF6" stroke-width="5"/>${badgeLetters} fill="#FFFCF6"/>`;
const canvas = (content) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024">${content}</svg>`;
const embedded = (png, extra = '') =>
  `<image href="data:image/png;base64,${png.toString('base64')}" width="1024" height="1024" ${extra}/>`;
const render = (content) => new Resvg(canvas(content)).render().asPng();

export function createDevelopmentIcons({ icon, foreground, monochrome }) {
  // The badge, including its border, fits inside Android's central 66dp safe
  // circle on the 108dp adaptive canvas. Production layers are never resized.
  const developmentForeground = render(embedded(foreground) + colorBadge);
  // A larger version sits lower on the legacy launcher image, below the face.
  const developmentIcon = render(
    embedded(icon) +
      `<g transform="translate(512 832) scale(1.35) translate(-512 -689)">${colorBadge}</g>`,
  );
  // Android themed icons use alpha, not RGB. Separate the tag from the existing
  // silhouette with a transparent rim and cut DEV out of the tag itself.
  const developmentMonochrome = render(
    `<defs><mask id="face"><rect width="1024" height="1024" fill="white"/><rect x="330" y="613" width="364" height="152" rx="46" fill="black"/></mask><mask id="tag">${badgeShape} fill="white"/>${badgeLetters} fill="black"/></mask></defs>` +
      embedded(monochrome, 'mask="url(#face)"') +
      '<rect width="1024" height="1024" fill="#2E5948" mask="url(#tag)"/>',
  );
  return {
    'icon-dev.png': developmentIcon,
    'android-icon-foreground-dev.png': developmentForeground,
    'android-icon-monochrome-dev.png': developmentMonochrome,
  };
}

export function writeDevelopmentIcons(assets) {
  const icons = createDevelopmentIcons({
    icon: readFileSync(resolve(assets, 'icon.png')),
    foreground: readFileSync(resolve(assets, 'android-icon-foreground.png')),
    monochrome: readFileSync(resolve(assets, 'android-icon-monochrome.png')),
  });
  for (const [name, png] of Object.entries(icons))
    writeFileSync(resolve(assets, name), png);
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
  writeDevelopmentIcons(resolve(root, 'mobile/assets'));
  console.log('Development launcher icons generated from production artwork.');
}
