import { createHash } from 'node:crypto';
import { mkdir, rename, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SOURCE_BASE =
  'https://storage.googleapis.com/tfjs-models/tfjs/mobilenet_v1_0.25_224/';
const EXPECTED_MODEL_SHA256 =
  'd14c680e069d74143e3771c291cf3fd153ee88b6ea9ee44bfaf84e2008ded44e';
const EXPECTED_SHARDS_SHA256 =
  'f0e7b9a4d91a16ad8aca45a9d57a7bdd56cc44858efad27f6b2ae48864275df6';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const destination = path.resolve(projectRoot, 'public/assets/models/mobilenet');
const temporary = path.resolve(projectRoot, 'public/assets/models/.mobilenet-download');

function assertInsideProject(target) {
  const relative = path.relative(projectRoot, target);
  if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new Error(`Refusing to write outside the project: ${target}`);
  }
}

function digest(buffer) {
  return createHash('sha256').update(buffer).digest('hex');
}

async function download(name) {
  const response = await fetch(`${SOURCE_BASE}${name}`);
  if (!response.ok) throw new Error(`Download failed for ${name}: ${response.status}`);
  return Buffer.from(await response.arrayBuffer());
}

assertInsideProject(destination);
assertInsideProject(temporary);
await rm(temporary, { recursive: true, force: true });
await mkdir(temporary, { recursive: true });

try {
  const modelBuffer = await download('model.json');
  if (digest(modelBuffer) !== EXPECTED_MODEL_SHA256) {
    throw new Error('MobileNet model.json checksum mismatch.');
  }
  const model = JSON.parse(modelBuffer.toString('utf8'));
  const shardNames = model.weightsManifest.flatMap((group) => group.paths);
  const shardDigest = createHash('sha256');
  const shards = [];
  for (const name of shardNames) {
    const buffer = await download(name);
    shardDigest.update(name);
    shardDigest.update(buffer);
    shards.push([name, buffer]);
  }
  if (shardDigest.digest('hex') !== EXPECTED_SHARDS_SHA256) {
    throw new Error('MobileNet weight-shard checksum mismatch.');
  }

  await writeFile(path.join(temporary, 'model.json'), modelBuffer);
  for (const [name, buffer] of shards) {
    await writeFile(path.join(temporary, name), buffer);
  }
  await writeFile(
    path.join(temporary, 'LICENSE.txt'),
    'MobileNet model assets are distributed under the Apache License 2.0.\n' +
      'Copyright 2017 The TensorFlow Authors. All rights reserved.\n' +
      'License: https://www.apache.org/licenses/LICENSE-2.0\n',
  );
  await rm(destination, { recursive: true, force: true });
  await rename(temporary, destination);
  console.log(`Vendored ${shards.length} checked MobileNet shards to ${destination}`);
} catch (error) {
  await rm(temporary, { recursive: true, force: true });
  throw error;
}
