import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Resvg } from '@resvg/resvg-js';
import { writeDevelopmentIcons } from './dev-icon.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const assets = resolve(root, 'mobile/assets');
const brand = resolve(assets, 'brand');
const drawable = resolve(
  root,
  'mobile/modules/beta-streak/android/src/main/res/drawable',
);
const poses = ['welcome', 'celebrate', 'rest', 'sad', 'angry', 'face'];
const sources = Object.fromEntries(
  poses.map((pose) => [
    pose,
    `data:image/png;base64,${readFileSync(resolve(brand, `betinha-${pose}.png`)).toString('base64')}`,
  ]),
);
const mountainTexture = `data:image/png;base64,${readFileSync(
  resolve(brand, 'mountain-icon-background.png'),
).toString('base64')}`;

// The approved PNGs are the source artwork. SVG is only a rendering container.
const image = (pose, size, offset = (1024 - size) / 2) =>
  `<image href="${sources[pose]}" x="${offset}" y="${offset}" width="${size}" height="${size}" preserveAspectRatio="xMidYMid meet"/>`;
const canvas = (content) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024">${content}</svg>`;
const render = (path, content, width) => {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(
    path,
    new Resvg(canvas(content), {
      fitTo: { mode: 'width', value: width },
    })
      .render()
      .asPng(),
  );
};

// A 620px source box keeps the complete horns inside Android's central
// 66dp safe circle on the 108dp adaptive canvas, including circular masks.
const foreground = image('face', 620);
const background = `<image href="${mountainTexture}" width="1024" height="1024" preserveAspectRatio="xMidYMid slice"/>`;
render(resolve(assets, 'android-icon-background.png'), background, 1024);
render(resolve(assets, 'android-icon-foreground.png'), foreground, 1024);
render(
  resolve(assets, 'android-icon-monochrome.png'),
  `<defs><filter id="silhouette" x="0" y="0" width="1" height="1" color-interpolation-filters="sRGB"><feFlood flood-color="#2E5948"/><feComposite in2="SourceAlpha" operator="in"/></filter></defs><g filter="url(#silhouette)">${foreground}</g>`,
  1024,
);
const icon = `${background}${image('face', 880)}`;
render(resolve(assets, 'icon.png'), icon, 1024);
render(resolve(assets, 'splash-icon.png'), foreground, 1024);
render(resolve(assets, 'favicon.png'), icon, 64);
writeDevelopmentIcons(assets);

for (const [name, pose] of [
  ['ibex', 'welcome'],
  ['portrait', 'face'],
  ['happy', 'celebrate'],
  ['sad', 'sad'],
  ['angry', 'angry'],
]) {
  render(resolve(drawable, `beta_streak_${name}.png`), image(pose, 1024), 424);
}

console.log(
  'Approved Betinha artwork packaged into launcher, splash, favicon and streak assets.',
);
