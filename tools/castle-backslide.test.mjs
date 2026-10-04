import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {mkdtemp, mkdir, readFile, readdir, stat, writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {test} from 'node:test';
import assert from 'node:assert/strict';

const toolsDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.dirname(toolsDir);
const adapterPath = path.join(toolsDir, 'prepare-castle-backslide.mjs');
const headerPath = path.join(repoRoot, 'server', 'rotest-castle-backslide.hpp');
const pinnedHash = 'aad3c2f3968e0ddf38b89aff953d77a4cae66a0aa54b539a47723dd5f25b6c04';
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');

const helperProgram = String.raw`
#include <cstdint>
#include <cstdio>
#include "rotest-castle-backslide.hpp"

struct Case { const char* name; uint32_t want; };

int main() {
  const Case allowed[] = {
    {"prtg_cas01", 0xfffffffbu}, {"prtg_cas02", 0xfffffffbu},
    {"prtg_cas03", 0xfffffffbu}, {"prtg_cas04", 0xfffffffbu},
    {"prtg_cas05", 0xfffffffbu}, {"aldeg_cas01", 0xfffffffbu},
    {"aldeg_cas02", 0xfffffffbu}, {"aldeg_cas03", 0xfffffffbu},
    {"aldeg_cas04", 0xfffffffbu}, {"aldeg_cas05", 0xfffffffbu},
    {"gefg_cas01", 0xfffffffbu}, {"gefg_cas02", 0xfffffffbu},
    {"gefg_cas03", 0xfffffffbu}, {"gefg_cas04", 0xfffffffbu},
    {"gefg_cas05", 0xfffffffbu}, {"payg_cas01", 0xfffffffbu},
    {"payg_cas02", 0xfffffffbu}, {"payg_cas03", 0xfffffffbu},
    {"payg_cas04", 0xfffffffbu}, {"payg_cas05", 0xfffffffbu},
  };
  for (const auto& item : allowed) {
    const uint32_t got = rotest::castle_skill_nocast(150, 0xffffffffu, item.name);
    if (got != item.want) {
      std::fprintf(stderr, "%s: got 0x%08x want 0x%08x\n", item.name, got, item.want);
      return 1;
    }
  }

  const Case blocked[] = {
    {"guild_vs2", 0xffffffffu}, {"morocc", 0xffffffffu},
    {"gvgtest", 0xffffffffu}, {"prtg_cas00", 0xffffffffu},
    {"prtg_cas06", 0xffffffffu}, {"prtg_cas010", 0xffffffffu},
    {"PRTG_CAS01", 0xffffffffu}, {"prtg_cas01_extra", 0xffffffffu},
    {"", 0xffffffffu}, {nullptr, 0xffffffffu},
  };
  for (const auto& item : blocked) {
    const uint32_t got = rotest::castle_skill_nocast(150, 0xffffffffu, item.name);
    if (got != item.want) return 2;
  }

  if (rotest::castle_skill_nocast(150, 4u, "prtg_cas01") != 0u) return 3;
  if (rotest::castle_skill_nocast(150, 0xfffffffbu, "prtg_cas01") != 0xfffffffbu) return 4;
  if (rotest::castle_skill_nocast(149, 0xffffffffu, "prtg_cas01") != 0xffffffffu) return 5;
  if (rotest::castle_skill_nocast(151, 4u, "prtg_cas01") != 4u) return 6;
  if (rotest::castle_skill_nocast(0, 4u, "prtg_cas01") != 4u) return 7;
  if (rotest::castle_skill_nocast(65535u, 4u, "prtg_cas01") != 4u) return 8;
  return 0;
}
`;

async function exists(target) {
  try { await stat(target); return true; } catch (error) {
    if (error.code === 'ENOENT') return false;
    throw error;
  }
}

async function makeSource(root, skillCpp) {
  const mapDir = path.join(root, 'src', 'map');
  await mkdir(mapDir, {recursive: true});
  await writeFile(path.join(mapDir, 'skill.cpp'), skillCpp);
}

async function makeFixtureAdapter(root, allowedHash) {
  const source = await readFile(adapterPath, 'utf8');
  const from = `const PINNED_SKILL_CPP_SHA256 = '${pinnedHash}';`;
  const to = `const PINNED_SKILL_CPP_SHA256 = '${allowedHash}';`;
  assert.equal(source.split(from).length - 1, 1, 'test harness fingerprint marker drifted');
  const testTools = path.join(root, 'tools');
  const testServer = path.join(root, 'server');
  await mkdir(testTools, {recursive: true});
  await mkdir(testServer, {recursive: true});
  await writeFile(path.join(testTools, 'prepare-castle-backslide.mjs'), source.replace(from, to));
  await writeFile(path.join(testServer, 'rotest-castle-backslide.hpp'), await readFile(headerPath));
  return path.join(testTools, 'prepare-castle-backslide.mjs');
}

function runAdapter(script, sourceRoot, outputRoot) {
  return spawnSync(process.execPath, [script, sourceRoot, outputRoot], {encoding: 'utf8'});
}

test('compiled helper allows Backslide only on the twenty exact castle names', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'castle-helper-'));
  const source = path.join(root, 'helper-test.cpp');
  const binary = path.join(root, 'helper-test');
  await writeFile(source, helperProgram);
  const compile = spawnSync('clang++', ['-std=c++17', '-Wall', '-Wextra', '-Werror', '-I', path.dirname(headerPath), source, '-o', binary], {encoding: 'utf8'});
  assert.equal(compile.status, 0, `${compile.stdout}${compile.stderr}`);
  const run = spawnSync(binary, [], {encoding: 'utf8'});
  assert.equal(run.status, 0, `${run.stdout}${run.stderr}`);
});

test('adapter stages only the patched source, helper, and verified hash manifest', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'castle-adapter-'));
  const sourceRoot = path.join(root, 'source');
  const outputRoot = path.join(root, 'output');
  const fixture = '#include "skill.hpp"\n\nvoid check() {\n\tuint32 skill_nocast = skill_get_nocast(skill_id);\n}\n';
  await makeSource(sourceRoot, fixture);
  const sourceBytes = await readFile(path.join(sourceRoot, 'src', 'map', 'skill.cpp'));
  const fixtureAdapter = await makeFixtureAdapter(path.join(root, 'fixture-tool'), sha256(sourceBytes));
  const run = runAdapter(fixtureAdapter, sourceRoot, outputRoot);
  assert.equal(run.status, 0, `${run.stdout}${run.stderr}`);
  assert.deepEqual(await readFile(path.join(sourceRoot, 'src', 'map', 'skill.cpp')), sourceBytes);

  const stagedSkill = await readFile(path.join(outputRoot, 'src', 'map', 'skill.cpp'), 'utf8');
  assert.match(stagedSkill, /#include "skill\.hpp"\n#include "rotest_castle_backslide\.hpp"/);
  assert.match(stagedSkill, /uint32 skill_nocast = rotest::castle_skill_nocast\(skill_id, skill_get_nocast\(skill_id\), mapdata->name\);/);
  assert.deepEqual(await readFile(path.join(outputRoot, 'src', 'map', 'rotest_castle_backslide.hpp')), await readFile(headerPath));

  const manifestPath = path.join(outputRoot, 'rotest-castle-backslide-manifest.json');
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
  assert.equal(manifest.source['src/map/skill.cpp'].sha256, sha256(sourceBytes));
  assert.equal(manifest.outputs['src/map/skill.cpp'].sha256, sha256(await readFile(path.join(outputRoot, 'src', 'map', 'skill.cpp'))));
  assert.equal(manifest.outputs['src/map/rotest_castle_backslide.hpp'].sha256, sha256(await readFile(path.join(outputRoot, 'src', 'map', 'rotest_castle_backslide.hpp'))));
  assert.deepEqual((await readdir(outputRoot, {recursive: true})).sort(), [
    'rotest-castle-backslide-manifest.json',
    'src',
    'src/map',
    'src/map/rotest_castle_backslide.hpp',
    'src/map/skill.cpp',
  ]);
});

test('adapter rejects pinned-source drift and leaves source and destination untouched', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'castle-drift-'));
  const sourceRoot = path.join(root, 'source');
  const outputRoot = path.join(root, 'output');
  const fixture = '#include "skill.hpp"\nuint32 skill_nocast = skill_get_nocast(skill_id);\n';
  await makeSource(sourceRoot, fixture);
  const before = await readFile(path.join(sourceRoot, 'src', 'map', 'skill.cpp'));
  const run = runAdapter(adapterPath, sourceRoot, outputRoot);
  assert.notEqual(run.status, 0);
  assert.match(run.stderr, /SHA256|fingerprint/i);
  assert.deepEqual(await readFile(path.join(sourceRoot, 'src', 'map', 'skill.cpp')), before);
  assert.equal(await exists(outputRoot), false);
});

test('adapter rejects missing or duplicate anchors before creating output', async () => {
  for (const [label, fixture] of [
    ['missing', '#include "skill.hpp"\nvoid check() {}\n'],
    ['duplicate', '#include "skill.hpp"\n#include "skill.hpp"\nuint32 skill_nocast = skill_get_nocast(skill_id);\n'],
  ]) {
    const root = await mkdtemp(path.join(tmpdir(), `castle-${label}-`));
    const sourceRoot = path.join(root, 'source');
    const outputRoot = path.join(root, 'output');
    await makeSource(sourceRoot, fixture);
    const before = await readFile(path.join(sourceRoot, 'src', 'map', 'skill.cpp'));
    const fixtureAdapter = await makeFixtureAdapter(path.join(root, 'fixture-tool'), sha256(before));
    const run = runAdapter(fixtureAdapter, sourceRoot, outputRoot);
    assert.notEqual(run.status, 0);
    assert.match(run.stderr, /anchor/i);
    assert.deepEqual(await readFile(path.join(sourceRoot, 'src', 'map', 'skill.cpp')), before);
    assert.equal(await exists(outputRoot), false);
  }
});

test('adapter refuses to overwrite an existing destination', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'castle-existing-'));
  const sourceRoot = path.join(root, 'source');
  const outputRoot = path.join(root, 'output');
  const fixture = '#include "skill.hpp"\nuint32 skill_nocast = skill_get_nocast(skill_id);\n';
  await makeSource(sourceRoot, fixture);
  await mkdir(outputRoot);
  await writeFile(path.join(outputRoot, 'keep'), 'preserve');
  const before = await readFile(path.join(sourceRoot, 'src', 'map', 'skill.cpp'));
  const fixtureAdapter = await makeFixtureAdapter(path.join(root, 'fixture-tool'), sha256(before));
  const run = runAdapter(fixtureAdapter, sourceRoot, outputRoot);
  assert.notEqual(run.status, 0);
  assert.match(run.stderr, /destination.*exist/i);
  assert.equal(await readFile(path.join(outputRoot, 'keep'), 'utf8'), 'preserve');
  assert.deepEqual(await readFile(path.join(sourceRoot, 'src', 'map', 'skill.cpp')), before);
});
