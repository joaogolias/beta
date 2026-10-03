import { access, lstat, mkdir, symlink } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Convex 1.45 looks for ./node_modules/typescript/bin/tsc instead of resolving
// the package. npm workspaces hoists our compiler to the root node_modules.
// Keep Convex's typecheck enabled by making that installed package visible here.
const backendDirectory = fileURLToPath(new URL('../', import.meta.url));
const localTypeScript = path.join(
  backendDirectory,
  'node_modules',
  'typescript',
);
const require = createRequire(import.meta.url);

try {
  await lstat(localTypeScript);
} catch (error) {
  if (error.code !== 'ENOENT') throw error;

  const installedTypeScript = path.dirname(
    require.resolve('typescript/package.json'),
  );
  await mkdir(path.dirname(localTypeScript), { recursive: true });
  const target =
    process.platform === 'win32'
      ? installedTypeScript
      : path.relative(path.dirname(localTypeScript), installedTypeScript);

  try {
    await symlink(
      target,
      localTypeScript,
      process.platform === 'win32' ? 'junction' : 'dir',
    );
  } catch (linkError) {
    // Concurrent npm lifecycle hooks can prepare the same link. Never replace
    // an existing local package or link; validate whichever one is present.
    if (linkError.code !== 'EEXIST') throw linkError;
  }
}

try {
  await access(path.join(localTypeScript, 'bin', 'tsc'));
} catch (error) {
  throw new Error(
    "The backend's local TypeScript package is incomplete. Reinstall dependencies before running Convex; the existing package was left unchanged.",
    { cause: error },
  );
}
