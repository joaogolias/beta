import { spawnSync } from 'node:child_process';
import { existsSync, statSync } from 'node:fs';
import { resolve } from 'node:path';

const [apkArgument, serial, ...extra] = process.argv.slice(2);
if (
  !apkArgument ||
  extra.length ||
  !apkArgument.toLowerCase().endsWith('.apk')
) {
  console.error(
    'Uso: npm run android:install -- /caminho/app.apk [serial-do-celular]',
  );
  process.exitCode = 1;
} else {
  const apk = resolve(apkArgument);
  if (!existsSync(apk) || !statSync(apk).isFile()) {
    console.error('APK não encontrado.');
    process.exitCode = 1;
  } else {
    // -d requires one physical USB device; a serial selects a particular device.
    // -r preserves app data. Never uninstall or downgrade automatically.
    const result = spawnSync(
      'adb',
      [...(serial ? ['-s', serial] : ['-d']), 'install', '-r', apk],
      { stdio: 'inherit' },
    );
    if (result.error)
      console.error(
        'adb não encontrado. Instale Android SDK Platform-Tools e adicione-o ao PATH.',
      );
    process.exitCode = result.status ?? 1;
  }
}
