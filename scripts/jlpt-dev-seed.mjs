import { execFileSync } from 'node:child_process';
import { Buffer } from 'node:buffer';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createClerkClient } from '@clerk/backend';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const deployment = 'kindhearted-hare-87';
const email = 'joaovgolias@gmail.com';
const issuer = 'https://genuine-lark-146.clerk.accounts.dev';
const data = JSON.parse(
  readFileSync(join(root, 'docs/data/jlpt-n5-authorial.json'), 'utf8'),
);
const working = join(root, '.tools/jlpt-n5-seed');
const audioDirectory = join(working, 'audio');
const manifestPath = join(working, 'uploads.json');
const runtime = join(root, '.tools/jlpt-tts/runtime');
// The development storage API returns its SHA256 metadata as base64.
const sha256 = (bytes) => createHash('sha256').update(bytes).digest('base64');
const skills = ['vocabulary', 'grammar', 'reading', 'listening'];

function ensure(condition, message) {
  if (!condition) throw new Error(message);
}

function cli(args, parse = true) {
  const text = execFileSync(
    process.execPath,
    [
      join(root, 'node_modules/convex/dist/cli.bundle.cjs'),
      ...args,
      '--deployment',
      deployment,
    ],
    {
      cwd: join(root, 'backend'),
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      maxBuffer: 4 * 1024 * 1024,
    },
  ).trim();
  return parse ? JSON.parse(text) : text;
}

function run(name, args) {
  return cli([
    'run',
    `jlptDevSeed:${name}`,
    JSON.stringify(args),
    '--typecheck',
    'disable',
    '--codegen',
    'disable',
  ]);
}

function validateDataset() {
  ensure(
    data.seedId === 'beta:dev:jlpt-n5-authorial-v1',
    'Unexpected seed identifier.',
  );
  ensure(
    data.paper.level === 'N5' && data.paper.questions.length === 20,
    'Expected 20 N5 questions.',
  );
  ensure(
    new Set(data.paper.questions.map((question) => question.id)).size === 20,
    'Question IDs must be unique.',
  );
  for (const skill of skills)
    ensure(
      data.paper.questions.filter((question) => question.skill === skill)
        .length === 5,
      `Expected five ${skill} questions.`,
    );
  for (const question of data.paper.questions) {
    ensure(
      question.choices.length === 4 ||
        (question.skill === 'listening' && question.choices.length === 3),
      `Invalid choices: ${question.id}`,
    );
    ensure(
      new Set(question.choices).size === question.choices.length,
      `Duplicate choices: ${question.id}`,
    );
    ensure(
      Number.isInteger(question.correctChoice) &&
        question.correctChoice >= 0 &&
        question.correctChoice < question.choices.length,
      `Invalid answer: ${question.id}`,
    );
    ensure(
      question.prompt && question.explanation,
      `Missing content: ${question.id}`,
    );
    if (question.skill === 'listening')
      ensure(
        data.listeningScripts[question.id],
        `Missing audio script: ${question.id}`,
      );
  }
  ensure(
    Object.keys(data.listeningScripts).length === 5,
    'Expected five listening scripts.',
  );
}

function inspectWav(bytes) {
  ensure(
    bytes.subarray(0, 4).toString() === 'RIFF' &&
      bytes.subarray(8, 12).toString() === 'WAVE',
    'Expected a RIFF/WAVE file.',
  );
  let format;
  let samples;
  for (let offset = 12; offset + 8 <= bytes.length;) {
    const kind = bytes.subarray(offset, offset + 4).toString();
    const size = bytes.readUInt32LE(offset + 4);
    ensure(offset + 8 + size <= bytes.length, 'Truncated audio file.');
    if (kind === 'fmt ') format = bytes.subarray(offset + 8, offset + 8 + size);
    if (kind === 'data')
      samples = bytes.subarray(offset + 8, offset + 8 + size);
    offset += 8 + size + (size % 2);
  }
  ensure(format && samples, 'Missing WAVE format or samples.');
  ensure(
    format.readUInt16LE(0) === 1 &&
      format.readUInt16LE(2) === 1 &&
      format.readUInt16LE(14) === 16,
    'Expected mono PCM16 speech.',
  );
  const duration = samples.length / format.readUInt32LE(8);
  ensure(duration >= 5 && duration < 120, 'Speech must be 5–120 seconds long.');
  let peak = 0;
  for (let index = 0; index + 1 < samples.length; index += 2)
    peak = Math.max(peak, Math.abs(samples.readInt16LE(index)));
  ensure(peak > 100, 'Speech audio is silent.');
  return {
    durationSeconds: Math.round(duration * 100) / 100,
    bytes: bytes.length,
    sha256: sha256(bytes),
  };
}

function prepare() {
  ensure(
    process.platform === 'linux',
    'Run audio preparation in the Linux/WSL repository.',
  );
  ensure(
    existsSync(join(runtime, 'usr/bin/open_jtalk')),
    'The isolated Open JTalk runtime is missing from .tools/jlpt-tts/runtime.',
  );
  mkdirSync(audioDirectory, { recursive: true });
  const summary = [];
  for (const [questionId, transcript] of Object.entries(
    data.listeningScripts,
  )) {
    const inputPath = join(audioDirectory, `${questionId}.txt`);
    const wavPath = join(audioDirectory, `${questionId}.wav`);
    const sameScript =
      existsSync(inputPath) &&
      readFileSync(inputPath, 'utf8') === `${transcript}\n`;
    if (!sameScript || !existsSync(wavPath)) {
      writeFileSync(inputPath, `${transcript}\n`);
      execFileSync(
        join(runtime, 'usr/bin/open_jtalk'),
        [
          '-x',
          join(runtime, 'var/lib/mecab/dic/open-jtalk/naist-jdic'),
          '-m',
          join(
            runtime,
            'usr/share/hts-voice/nitech-jp-atr503-m001/nitech_jp_atr503_m001.htsvoice',
          ),
          '-r',
          '0.9',
          '-ow',
          wavPath,
          inputPath,
        ],
        {
          env: {
            ...process.env,
            LD_LIBRARY_PATH: join(runtime, 'usr/lib/x86_64-linux-gnu'),
          },
          stdio: ['ignore', 'pipe', 'pipe'],
        },
      );
    }
    summary.push({ questionId, ...inspectWav(readFileSync(wavPath)) });
  }
  writeFileSync(
    join(working, 'audio-report.json'),
    `${JSON.stringify(summary, null, 2)}\n`,
  );
  return summary;
}

async function resolveTarget() {
  // Keep secrets in memory and out of logs or the resumable upload manifest.
  const secretKey = cli(['env', 'get', 'CLERK_SECRET_KEY'], false);
  ensure(
    secretKey.startsWith('sk_test_'),
    'Expected a development Clerk secret.',
  );
  ensure(
    cli(['env', 'get', 'CLERK_JWT_ISSUER_DOMAIN'], false).replace(/\/$/, '') ===
      issuer,
    'Unexpected development Clerk issuer.',
  );
  const result = await createClerkClient({ secretKey }).users.getUserList({
    emailAddress: [email],
    limit: 2,
  });
  ensure(
    result.totalCount === 1 && result.data.length === 1,
    'Expected exactly one matching Clerk user.',
  );
  ensure(
    result.data[0].emailAddresses.some(
      (address) => address.emailAddress.toLowerCase() === email,
    ),
    'Clerk user email mismatch.',
  );
  return { email, tokenIdentifier: `${issuer}|${result.data[0].id}` };
}

async function apply() {
  const audio = prepare();
  const target = await resolveTarget();
  const before = run('inspect', target);
  console.log(
    JSON.stringify({
      deployment,
      email,
      ownerId: before.ownerId,
      existing: before.existing?.id ?? null,
    }),
  );
  const uploads = existsSync(manifestPath)
    ? JSON.parse(readFileSync(manifestPath, 'utf8'))
    : { deployment, seedId: data.seedId, ownerId: before.ownerId, files: [] };
  ensure(
    uploads.deployment === deployment &&
      typeof uploads.seedId === 'string' &&
      uploads.seedId.endsWith(':dev:jlpt-n5-authorial-v1') &&
      uploads.ownerId === before.ownerId,
    'Upload manifest belongs to a different seed or user.',
  );
  // Keep uploaded audio across brand changes; deployment and owner stay exact.
  uploads.seedId = data.seedId;
  // Resume manifests created before verifying the live API's checksum encoding.
  for (const file of uploads.files)
    if (/^[a-f0-9]{64}$/.test(file.sha256))
      file.sha256 = Buffer.from(file.sha256, 'hex').toString('base64');
  writeFileSync(manifestPath, `${JSON.stringify(uploads, null, 2)}\n`, {
    mode: 0o600,
  });
  if (before.existing && uploads.files.length !== 5)
    throw new Error(
      'The seed already exists but this checkout has no complete upload manifest. Inspect it instead of uploading duplicate audio.',
    );
  for (const item of audio) {
    const prior = uploads.files.find(
      (file) => file.questionId === item.questionId,
    );
    if (prior) {
      ensure(
        prior.sha256 === item.sha256,
        `Audio changed since upload: ${item.questionId}. Preserve the existing seed and review manually.`,
      );
      continue;
    }
    const { uploadUrl } = run('prepareUpload', target);
    ensure(
      new URL(uploadUrl).origin === `https://${deployment}.convex.cloud`,
      'Unexpected upload destination.',
    );
    const response = await fetch(uploadUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'audio/wav' },
      body: readFileSync(join(audioDirectory, `${item.questionId}.wav`)),
    });
    ensure(response.ok, `Audio upload failed (${response.status}).`);
    const { storageId } = await response.json();
    ensure(
      typeof storageId === 'string' && storageId,
      'Upload response did not contain a storage ID.',
    );
    uploads.files.push({
      questionId: item.questionId,
      storageId,
      sha256: item.sha256,
    });
    writeFileSync(manifestPath, `${JSON.stringify(uploads, null, 2)}\n`, {
      mode: 0o600,
    });
    console.log(`Áudio enviado: ${item.questionId} (${item.durationSeconds}s)`);
  }
  const media = run('inspectMedia', { ...target, files: uploads.files });
  for (const item of media) {
    ensure(
      new URL(item.url).origin === `https://${deployment}.convex.cloud`,
      'Unexpected audio URL.',
    );
    const response = await fetch(item.url);
    ensure(response.ok, `Stored audio is unavailable (${response.status}).`);
    const bytes = Buffer.from(await response.arrayBuffer());
    ensure(
      inspectWav(bytes).sha256 === item.sha256,
      'Downloaded audio checksum differs.',
    );
  }
  const paper = structuredClone(data.paper);
  for (const question of paper.questions) {
    if (question.skill === 'listening')
      question.explanation += `\n\nTranscrição do áudio:\n${data.listeningScripts[question.id]}`;
  }
  const result = run('seed', { ...target, paper, files: uploads.files });
  const after = run('inspect', target);
  ensure(
    after.ownerId === before.ownerId && after.existing?.id === result.id,
    'Final ownership verification failed.',
  );
  ensure(
    after.existing.questionCount === 20 &&
      skills.every((skill) => after.existing.counts[skill] === 5),
    'Final question counts differ.',
  );
  const report = {
    deployment,
    email,
    verifiedAt: new Date().toISOString(),
    ...result,
    verifiedAudioCount: media.length,
  };
  writeFileSync(
    join(working, 'seed-report.json'),
    `${JSON.stringify(report, null, 2)}\n`,
    { mode: 0o600 },
  );
  console.log(JSON.stringify(report, null, 2));
}

try {
  validateDataset();
  const mode = process.argv[2] ?? '--prepare';
  if (mode === '--prepare')
    console.log(
      JSON.stringify(
        {
          questions: 20,
          counts: Object.fromEntries(skills.map((skill) => [skill, 5])),
          audio: prepare(),
        },
        null,
        2,
      ),
    );
  else if (mode === '--inspect')
    console.log(JSON.stringify(run('inspect', await resolveTarget()), null, 2));
  else if (mode === '--apply') await apply();
  else
    throw new Error(
      'Use --prepare (local only), --inspect (read only) or --apply (upload and seed DEV).',
    );
} catch (error) {
  // A failed child command can contain sensitive arguments or auth responses.
  if (
    error &&
    typeof error === 'object' &&
    ('stderr' in error || 'stdout' in error)
  )
    console.error(
      'Convex/Open JTalk operation failed. No credentials were logged; inspect the relevant operation locally.',
    );
  else console.error(error instanceof Error ? error.message : 'Seed failed.');
  process.exitCode = 1;
}
