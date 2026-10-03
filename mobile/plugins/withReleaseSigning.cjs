const start = '// @generated babel-crux-release-signing start';
const end = '// @generated babel-crux-release-signing end';

// Credentials are read by Gradle at execution time, never interpolated into a file.
const signing = `
${start}
def babelCruxSigningNames = ['ANDROID_KEYSTORE_PATH', 'ANDROID_KEYSTORE_PASSWORD', 'ANDROID_KEY_ALIAS', 'ANDROID_KEY_PASSWORD']
def babelCruxSigning = babelCruxSigningNames.collectEntries { name -> [(name): System.getenv(name)] }
android {
    signingConfigs {
        babelCruxRelease {
            if (babelCruxSigning['ANDROID_KEYSTORE_PATH']) {
                storeFile file(babelCruxSigning['ANDROID_KEYSTORE_PATH'])
            }
            storePassword babelCruxSigning['ANDROID_KEYSTORE_PASSWORD']
            keyAlias babelCruxSigning['ANDROID_KEY_ALIAS']
            keyPassword babelCruxSigning['ANDROID_KEY_PASSWORD']
        }
    }
    buildTypes {
        release {
            signingConfig signingConfigs.babelCruxRelease
        }
    }
}
gradle.taskGraph.whenReady { graph ->
    if (graph.allTasks.any { it.project == project && it.name.toLowerCase().contains('release') }) {
        def missing = babelCruxSigningNames.findAll { !babelCruxSigning[it]?.trim() }
        if (!missing.isEmpty()) {
            throw new GradleException('Assinatura Android incompleta: ' + missing.join(', '))
        }
        def keyFile = new File(babelCruxSigning['ANDROID_KEYSTORE_PATH'])
        if (!keyFile.isAbsolute() || !keyFile.isFile()) {
            throw new GradleException('ANDROID_KEYSTORE_PATH deve ser um caminho absoluto para um keystore existente.')
        }
    }
}
${end}
`;

function addReleaseSigning(contents) {
  const startAt = contents.indexOf(start);
  const endAt = contents.indexOf(end);
  if (
    (startAt === -1) !== (endAt === -1) ||
    (startAt !== -1 && endAt < startAt)
  ) {
    throw new Error(
      'Bloco de assinatura Android incompleto; regenere o projeto Android.',
    );
  }
  const base =
    startAt === -1
      ? contents
      : contents.slice(0, startAt) + contents.slice(endAt + end.length);
  if (!/apply plugin: ["']com\.android\.application["']/.test(base)) {
    throw new Error(
      'Template Gradle Android não reconhecido; revise o plugin de assinatura.',
    );
  }
  return base.trimEnd() + '\n' + signing;
}

module.exports = function withReleaseSigning(config) {
  const { withAppBuildGradle } = require('expo/config-plugins');
  return withAppBuildGradle(config, (mod) => {
    if (mod.modResults.language !== 'groovy')
      throw new Error('O plugin de assinatura requer build.gradle Groovy.');
    mod.modResults.contents = addReleaseSigning(mod.modResults.contents);
    return mod;
  });
};
module.exports.addReleaseSigning = addReleaseSigning;
