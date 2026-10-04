#!/usr/bin/env node

import {createHash} from 'node:crypto';
import {lstat, mkdir, mkdtemp, readFile, realpath, rename, rm, writeFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const PINNED_SKILL_CPP_SHA256 = 'aad3c2f3968e0ddf38b89aff953d77a4cae66a0aa54b539a47723dd5f25b6c04';
const SKILL_PATH = path.join('src', 'map', 'skill.cpp');
const OUTPUT_HEADER_PATH = path.join('src', 'map', 'rotest_castle_backslide.hpp');
const MANIFEST_PATH = 'rotest-castle-backslide-manifest.json';
const INCLUDE_ANCHOR = '#include "skill.hpp"\n';
const INCLUDE_REPLACEMENT = '#include "skill.hpp"\n#include "rotest_castle_backslide.hpp"\n';
const INITIALIZER_ANCHOR = '\tuint32 skill_nocast = skill_get_nocast(skill_id);';
const INITIALIZER_REPLACEMENT = '\tuint32 skill_nocast = rotest::castle_skill_nocast(skill_id, skill_get_nocast(skill_id), mapdata->name);';
const modulePath = fileURLToPath(import.meta.url);
const templatePath = path.resolve(path.dirname(modulePath), '..', 'server', 'rotest-castle-backslide.hpp');

const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');

function occurrenceCount(text, needle) {
	let count = 0;
	let offset = 0;
	while ((offset = text.indexOf(needle, offset)) !== -1) {
		count += 1;
		offset += needle.length;
	}
	return count;
}

async function pathExists(target) {
	try {
		await lstat(target);
		return true;
	} catch (error) {
		if (error.code === 'ENOENT')
			return false;
		throw error;
	}
}

function assertOutsideSource(sourceRoot, outputRoot) {
	const relative = path.relative(sourceRoot, outputRoot);
	if (relative === '' || (!relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative)))
		throw new Error('destination must be outside the source root');
}

export async function prepareCastleBackslide(sourceRootArgument, outputRootArgument) {
	if (!sourceRootArgument || !outputRootArgument)
		throw new Error('usage: prepare-castle-backslide.mjs <source-root> <output-root>');

	const sourceRoot = await realpath(sourceRootArgument);
	const outputRootRequested = path.resolve(outputRootArgument);
	const outputParent = await realpath(path.dirname(outputRootRequested));
	const outputRoot = path.join(outputParent, path.basename(outputRootRequested));
	assertOutsideSource(sourceRoot, outputRoot);
	if (await pathExists(outputRoot))
		throw new Error(`destination already exists: ${outputRoot}`);

	const sourceSkillPath = path.join(sourceRoot, SKILL_PATH);
	const sourceBytes = await readFile(sourceSkillPath);
	const sourceHash = sha256(sourceBytes);
	if (sourceHash !== PINNED_SKILL_CPP_SHA256)
		throw new Error(`skill.cpp SHA256 fingerprint mismatch: expected ${PINNED_SKILL_CPP_SHA256}, got ${sourceHash}`);

	const sourceText = sourceBytes.toString('utf8');
	if (occurrenceCount(sourceText, INCLUDE_ANCHOR) !== 1)
		throw new Error('skill.cpp include anchor must occur exactly once');
	if (occurrenceCount(sourceText, INITIALIZER_ANCHOR) !== 1)
		throw new Error('skill.cpp initializer anchor must occur exactly once');

	const headerBytes = await readFile(templatePath);
	const outputSkillBytes = Buffer.from(sourceText
		.replace(INCLUDE_ANCHOR, INCLUDE_REPLACEMENT)
		.replace(INITIALIZER_ANCHOR, INITIALIZER_REPLACEMENT));
	const manifest = {
		version: 1,
		pinned_upstream_commit: 'e985006171d2eb320ee512a653f4c83aea3d81b6',
		source: {
			'src/map/skill.cpp': {sha256: sourceHash},
		},
		outputs: {
			'src/map/skill.cpp': {sha256: sha256(outputSkillBytes)},
			'src/map/rotest_castle_backslide.hpp': {sha256: sha256(headerBytes)},
		},
	};

	const stagingRoot = await mkdtemp(path.join(outputParent, `.${path.basename(outputRoot)}.tmp-`));
	try {
		const stagingMap = path.join(stagingRoot, 'src', 'map');
		await mkdir(stagingMap, {recursive: true});
		await writeFile(path.join(stagingRoot, SKILL_PATH), outputSkillBytes);
		await writeFile(path.join(stagingRoot, OUTPUT_HEADER_PATH), headerBytes);
		await writeFile(path.join(stagingRoot, MANIFEST_PATH), `${JSON.stringify(manifest, null, 2)}\n`);
		await rename(stagingRoot, outputRoot);
	} catch (error) {
		await rm(stagingRoot, {recursive: true, force: true});
		throw error;
	}

	return manifest;
}

const invokedAsMain = process.argv[1] && await realpath(process.argv[1]) === await realpath(modulePath);
if (invokedAsMain) {
	prepareCastleBackslide(process.argv[2], process.argv[3])
		.then(manifest => process.stdout.write(`${JSON.stringify(manifest)}\n`))
		.catch(error => {
			process.stderr.write(`${error.message}\n`);
			process.exitCode = 1;
		});
}
