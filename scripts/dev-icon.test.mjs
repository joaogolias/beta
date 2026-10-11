import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import { Resvg } from '@resvg/resvg-js';

const assets = new URL('../mobile/assets/', import.meta.url);
function png(name) {
  const data = readFileSync(new URL(name, assets));
  assert.equal(data.readUInt32BE(16), 1024);
  assert.equal(data.readUInt32BE(20), 1024);
  assert.equal(data[25], 6, 'launcher images must retain an RGBA channel');
  return new Resvg(
    `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024"><image href="data:image/png;base64,${data.toString('base64')}" width="1024" height="1024"/></svg>`,
  ).render().pixels;
}
const pixel = (image, x, y) =>
  image.subarray((y * 1024 + x) * 4, (y * 1024 + x) * 4 + 4);

test('development and production select distinct launcher layers with the same app identity and background', async () => {
  const previous = process.env.APP_ENV;
  try {
    process.env.APP_ENV = 'development';
    const { default: development } =
      await import('../mobile/app.config.ts?icons=development');
    process.env.APP_ENV = 'production';
    const { default: production } =
      await import('../mobile/app.config.ts?icons=production');
    assert.equal(development.name, 'beta');
    assert.equal(production.name, 'beta');
    assert.equal(development.icon, './assets/icon-dev.png');
    assert.equal(production.icon, './assets/icon.png');
    assert.equal(
      development.android.adaptiveIcon.foregroundImage,
      './assets/android-icon-foreground-dev.png',
    );
    assert.equal(
      development.android.adaptiveIcon.monochromeImage,
      './assets/android-icon-monochrome-dev.png',
    );
    assert.equal(
      production.android.adaptiveIcon.foregroundImage,
      './assets/android-icon-foreground.png',
    );
    assert.equal(
      production.android.adaptiveIcon.monochromeImage,
      './assets/android-icon-monochrome.png',
    );
    assert.equal(
      development.android.adaptiveIcon.backgroundImage,
      production.android.adaptiveIcon.backgroundImage,
    );
    for (const config of [development, production])
      for (const path of [
        config.icon,
        config.android.adaptiveIcon.foregroundImage,
        config.android.adaptiveIcon.monochromeImage,
      ])
        assert.ok(
          readFileSync(
            fileURLToPath(
              new URL(path, new URL('../mobile/', import.meta.url)),
            ),
          ).length > 0,
        );
  } finally {
    if (previous === undefined) delete process.env.APP_ENV;
    else process.env.APP_ENV = previous;
  }
});

test('the adaptive DEV badge fits the safe circle and preserves the surrounding mascot pixels', () => {
  const original = png('android-icon-foreground.png');
  const development = png('android-icon-foreground-dev.png');
  const safeRadius = (1024 * 66) / 108 / 2;
  let differences = 0;
  for (let y = 0; y < 1024; y += 1) {
    for (let x = 0; x < 1024; x += 1) {
      const at = (y * 1024 + x) * 4;
      if (
        ![0, 1, 2, 3].some(
          (channel) =>
            Math.abs(original[at + channel] - development[at + channel]) > 4,
        )
      )
        continue;
      differences += 1;
      assert.ok(
        Math.hypot(x - 512, y - 512) <= safeRadius,
        `badge pixel outside safe circle: ${x},${y}`,
      );
      assert.ok(
        y >= 620 && y <= 758,
        'changes stay confined to the badge, below the eyes',
      );
    }
  }
  assert.ok(differences > 20_000, 'the DEV badge must be present');
  assert.equal(pixel(development, 0, 0)[3], 0);
  assert.deepEqual([...pixel(development, 405, 670)], [255, 252, 246, 255]);
});

test('the themed DEV tag uses transparent letters and a clear rim, and the legacy icon stays opaque', () => {
  const monochrome = png('android-icon-monochrome-dev.png');
  assert.equal(
    pixel(monochrome, 405, 670)[3],
    0,
    'DEV lettering must be cut out of alpha for Android tinting',
  );
  assert.equal(
    pixel(monochrome, 360, 690)[3],
    255,
    'tag background remains opaque',
  );
  assert.equal(
    pixel(monochrome, 512, 618)[3],
    0,
    'transparent rim separates the tag from the face',
  );
  assert.equal(pixel(monochrome, 0, 0)[3], 0);
  const legacy = png('icon-dev.png');
  for (let at = 3; at < legacy.length; at += 4)
    assert.equal(legacy[at], 255, 'legacy launcher icon remains fully opaque');
});
