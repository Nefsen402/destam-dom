/*
 * Randomized stress test for dom.js mount/unmount bookkeeping.
 *
 * Builds random trees of static elements, OArrays, Observer-backed arrays and
 * custom components (whose cleanup/mounted callbacks reentrantly mutate a
 * random sibling container - including via Network.atomic, which batches
 * several mutations into a single commit dispatch, the same shape as the
 * "atomic" callsite in the real crash this was written to chase down), mounts
 * them, runs a random sequence of mutations, then tears everything down.
 *
 * dom.js is loaded once, up front, plain - no per-trial reimport. A thrown
 * assert can leave dom.js's module-level `deferred` singleton stuck, which
 * would silently no-op every operation in later trials of the SAME instance -
 * so on a trial failure the next trial reloads dom.js fresh (cache-busted
 * specifier) before continuing. A fully clean run therefore loads dom.js
 * exactly once and never grows; only a run with failures reloads (and so
 * grows a little) - acceptable since failures are the rare, already-broken
 * case, not the common one this needs to scale for.
 *
 * Usage:
 *   node tests/fuzz.js [--trials=200] [--seed=N] [--steps=40] [--maxDepth=4] [--keepGoing]
 *
 * On failure, prints the seed (for `--trials=1 --seed=N` replay) and the
 * human-readable operation log leading up to the crash.
 */

import {fileURLToPath} from 'node:url';
import path from 'node:path';

import './document.js';

import OArray from '../Array.js';
import Observer from 'destam/Observer.js';
import * as Network from 'destam/Network.js';

const domPath = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'dom.js');

let dom;
let domReloadCount = 0;
const loadDom = async () => {
	const specifier = domReloadCount === 0 ? domPath : `${domPath}?reload=${domReloadCount}`;
	domReloadCount++;
	dom = await import(specifier);
};

await loadDom();

const args = Object.fromEntries(process.argv.slice(2).map(arg => {
	const m = /^--([^=]+)(?:=(.*))?$/.exec(arg);
	if (!m) throw new Error("bad arg: " + arg);
	return [m[1], m[2] === undefined ? true : m[2]];
}));

const TRIALS = Number(args.trials ?? 200);
const STEPS = Number(args.steps ?? 40);
const MAX_DEPTH = Number(args.maxDepth ?? 4);
const KEEP_GOING = !!args.keepGoing;
const BASE_SEED = args.seed !== undefined ? Number(args.seed) : Date.now();

const mulberry32 = seed => {
	let a = seed >>> 0;
	return () => {
		a |= 0; a = (a + 0x6D2B79F5) | 0;
		let t = Math.imul(a ^ (a >>> 15), 1 | a);
		t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
};

const pick = (rng, arr) => arr[Math.floor(rng() * arr.length)];
const randInt = (rng, min, maxInclusive) =>
	maxInclusive < min ? min : min + Math.floor(rng() * (maxInclusive - min + 1));
const weightedPick = (rng, entries) => {
	const total = entries.reduce((s, [, w]) => s + w, 0);
	let r = rng() * total;
	for (const [val, w] of entries) {
		if ((r -= w) <= 0) return val;
	}
	return entries[entries.length - 1][0];
};

const TAGS = ['div', 'span', 'section', 'p'];

const buildCtx = (rng) => {
	return {
		rng,
		h: dom.h,
		mount: dom.mount,
		registry: [],
		log: [],
		idCounter: 0,
		// Ref-counts containers claimed for the remainder of the current
		// outermost Network.atomic() cascade (see claimForCascade). A commit
		// queued for a governor inside an atomic batch isn't dispatched until
		// the whole batch's callback returns, so a second touch to the same
		// container before then - whether the batch's own second pick, or a
		// reentrant touch from a cleanup/mounted callback cascading anywhere
		// within that same dispatch - merges into the same not-yet-dispatched
		// commit as a duplicate per-link event, which is degenerate (a commit
		// can carry at most one event per link). Every mutation made while
		// atomicDepth > 0 must avoid any container already claimed here.
		activeAtomicCount: new Map(),
		// How many Network.atomic() calls are currently on the stack (nested
		// reentrantAtomic counts too). Claims only release once this drops
		// back to 0 - a claim made deep in a cascade must survive until the
		// *outermost* atomic call is fully done dispatching, not just the
		// inner one that happened to make it.
		atomicDepth: 0,
		// Flat list of entries claimed anywhere during the current cascade,
		// released together when atomicDepth returns to 0.
		claimsThisCascade: [],
	};
};

const note = (ctx, msg) => ctx.log.push(msg);

const makeLeaf = ctx => {
	const kind = weightedPick(ctx.rng, [['text', 3], ['number', 1], ['null', 1]]);
	if (kind === 'null') return null;
	if (kind === 'number') return randInt(ctx.rng, 0, 999);
	return 'leaf' + randInt(ctx.rng, 0, 999);
};

const makeNode = (ctx, depth) => {
	const kind = depth <= 0
		? weightedPick(ctx.rng, [['text', 1], ['null', 1]])
		: weightedPick(ctx.rng, [
			['text', 3],
			['null', 1],
			['elem', 3],
			['array', 3],
			['component', 3],
		]);

	if (kind === 'text' || kind === 'null') return makeLeaf(ctx);

	if (kind === 'elem') {
		const n = randInt(ctx.rng, 0, 3);
		const children = [];
		for (let i = 0; i < n; i++) children.push(makeNode(ctx, depth - 1));
		return ctx.h(pick(ctx.rng, TAGS), {}, ...children);
	}

	if (kind === 'array') {
		const n = randInt(ctx.rng, 0, 3);
		const items = [];
		for (let i = 0; i < n; i++) items.push(makeNode(ctx, depth - 1));

		const id = ctx.idCounter++;
		if (ctx.rng() < 0.4) {
			const obs = Observer.mutable(items);
			ctx.registry.push({kind: 'observer', id, obs});
			note(ctx, `create observer#${id} = [${items.length} items]`);
			return obs;
		} else {
			const arr = OArray(items);
			ctx.registry.push({kind: 'oarray', id, arr});
			note(ctx, `create oarray#${id} = [${items.length} items]`);
			return arr;
		}
	}

	// component
	const id = ctx.idCounter++;
	const wantsCleanup = ctx.rng() < 0.5;
	const wantsMounted = ctx.rng() < 0.3;
	const wantsAtomicCleanup = wantsCleanup && ctx.rng() < 0.3;

	const Comp = (props, cleanup, mounted) => {
		if (wantsCleanup) {
			cleanup(() => {
				note(ctx, `component#${id} cleanup fires`);
				if (wantsAtomicCleanup) {
					reentrantAtomic(ctx, randInt(ctx.rng, 1, 3));
				} else {
					reentrantMutate(ctx);
				}
			});
		}
		if (wantsMounted) {
			mounted(() => {
				note(ctx, `component#${id} mounted fires`);
				reentrantMutate(ctx);
			});
		}
		return makeNode(ctx, depth - 1);
	};
	Object.defineProperty(Comp, 'name', {value: 'Comp' + id});

	note(ctx, `create component#${id}`);
	return ctx.h(Comp);
};

const randomMutate = (entry, ctx) => {
	if (entry.kind === 'oarray') {
		const arr = entry.arr;
		const n = arr.length;
		const op = pick(ctx.rng, ['push', 'pop', 'shift', 'unshift', 'splice', 'fill']);

		if (op === 'push') {
			arr.push(makeNode(ctx, 1));
			note(ctx, `oarray#${entry.id}.push()`);
		} else if (op === 'pop') {
			if (n) { arr.pop(); note(ctx, `oarray#${entry.id}.pop()`); }
		} else if (op === 'shift') {
			if (n) { arr.shift(); note(ctx, `oarray#${entry.id}.shift()`); }
		} else if (op === 'unshift') {
			arr.unshift(makeNode(ctx, 1));
			note(ctx, `oarray#${entry.id}.unshift()`);
		} else if (op === 'splice') {
			const start = randInt(ctx.rng, 0, n);
			const count = randInt(ctx.rng, 0, n - start);
			const insertN = randInt(ctx.rng, 0, 2);
			const items = Array.from({length: insertN}, () => makeNode(ctx, 1));
			arr.splice(start, count, ...items);
			note(ctx, `oarray#${entry.id}.splice(${start}, ${count}, +${insertN})`);
		} else if (op === 'fill') {
			// fill() repeats the SAME value at every slot - only safe with
			// primitives, since a mounted element/array/component reference
			// can't legitimately occupy more than one array slot at once.
			if (n) { arr.fill(makeLeaf(ctx)); note(ctx, `oarray#${entry.id}.fill()`); }
		}
	} else {
		const obs = entry.obs;
		const op = weightedPick(ctx.rng, [['set', 3], ['clear', 1], ['null', 1]]);

		if (op === 'null') {
			obs.set(null);
			note(ctx, `observer#${entry.id}.set(null)`);
		} else if (op === 'clear') {
			obs.set([]);
			note(ctx, `observer#${entry.id}.set([])`);
		} else {
			const n = randInt(ctx.rng, 0, 3);
			const items = Array.from({length: n}, () => makeNode(ctx, 1));
			obs.set(items);
			note(ctx, `observer#${entry.id}.set([${n} items])`);
		}
	}
};

const claimForCascade = (ctx, entry) => {
	ctx.activeAtomicCount.set(entry, (ctx.activeAtomicCount.get(entry) || 0) + 1);
	ctx.claimsThisCascade.push(entry);
};

const reentrantMutate = ctx => {
	const available = ctx.registry.filter(e => !ctx.activeAtomicCount.get(e));
	if (!available.length) return;

	const entry = pick(ctx.rng, available);
	// Only claim while an atomic cascade is actually in flight - outside of
	// one, each mutation dispatches and settles immediately, so there's no
	// "still queued" window for a later reentrant touch to collide with.
	if (ctx.atomicDepth > 0) claimForCascade(ctx, entry);
	randomMutate(entry, ctx);
};

// A single atomic commit is a minimal per-link diff: a link can't legitimately
// carry more than one event (e.g. an Insert immediately undone by a Delete)
// within the same commit, since commit order is undefined and such a commit
// is degenerate - not something any real caller produces. So each container
// touched anywhere in one atomic cascade must be distinct - including
// reentrant touches from cleanup/mounted callbacks cascading arbitrarily deep
// while the batch unwinds, not just the batch's own top-level picks.
const reentrantAtomic = (ctx, count) => {
	const available = ctx.registry.filter(e => !ctx.activeAtomicCount.get(e));
	if (!available.length) return;

	const pool = available.slice();
	const chosen = [];
	for (let i = 0; i < count && pool.length; i++) {
		const idx = randInt(ctx.rng, 0, pool.length - 1);
		chosen.push(pool[idx]);
		pool.splice(idx, 1);
	}
	if (!chosen.length) return;

	for (const entry of chosen) claimForCascade(ctx, entry);

	ctx.atomicDepth++;
	try {
		note(ctx, `atomic batch of ${chosen.length}`);
		Network.atomic(() => {
			for (const entry of chosen) randomMutate(entry, ctx);
		});
	} finally {
		ctx.atomicDepth--;

		// Only the outermost atomic call releases claims - a nested
		// reentrantAtomic (wantsAtomicCleanup) returning doesn't mean the
		// overall cascade it's nested in is done dispatching yet.
		if (ctx.atomicDepth === 0) {
			for (const entry of ctx.claimsThisCascade) {
				ctx.activeAtomicCount.set(entry, ctx.activeAtomicCount.get(entry) - 1);
			}
			ctx.claimsThisCascade = [];
		}
	}
};

const runTrial = seed => {
	const rng = mulberry32(seed);
	const ctx = buildCtx(rng);

	try {
		const elem = document.createElement('body');

		const rootItems = [];
		const rootN = randInt(rng, 1, 4);
		for (let i = 0; i < rootN; i++) rootItems.push(makeNode(ctx, MAX_DEPTH));

		const root = OArray(rootItems);
		ctx.registry.push({kind: 'oarray', id: -1, arr: root});
		note(ctx, `mount root oarray with ${rootItems.length} items`);

		const remove = ctx.mount(elem, root);

		for (let step = 0; step < STEPS; step++) {
			if (!ctx.registry.length) break;

			if (rng() < 0.15) {
				reentrantAtomic(ctx, randInt(rng, 2, 3));
			} else {
				randomMutate(pick(rng, ctx.registry), ctx);
			}

			// sanity: the fake DOM shim throws on structural inconsistency
			elem.tree();
		}

		note(ctx, 'final teardown');
		if (rng() < 0.5) {
			note(ctx, 'teardown via root.splice(0, length)');
			root.splice(0, root.length);
		} else {
			note(ctx, 'teardown via top-level remove()');
			remove();
		}

		elem.tree();
	} catch (err) {
		err.__fuzzLog = ctx.log;
		throw err;
	}
};

const main = async () => {
	let failures = 0;

	for (let i = 0; i < TRIALS; i++) {
		const seed = BASE_SEED + i;

		try {
			runTrial(seed);
			if (TRIALS <= 20 || i % 50 === 0) {
				console.log(`[ok] trial ${i} (seed ${seed})`);
			}
		} catch (err) {
			failures++;
			console.error(`\n[FAIL] trial ${i} (seed ${seed})`);
			console.error(err.stack || err.message);
			console.error(`\nReplay with: node tests/fuzz.js --trials=1 --seed=${seed}`);

			if (err.__fuzzLog) {
				console.error('\nOperation log:');
				for (const line of err.__fuzzLog) console.error('  ' + line);
			}

			if (!KEEP_GOING) {
				process.exitCode = 1;
				return;
			}

			// A thrown assert can leave dom.js's module-level `deferred`
			// singleton stuck, silently no-op-ing every operation in later
			// trials of this same instance. Reload a fresh one before
			// continuing so this failure can't mask the rest of the run.
			await loadDom();
		}
	}

	console.log(`\n${TRIALS - failures}/${TRIALS} trials passed (base seed ${BASE_SEED})`);
	if (failures) process.exitCode = 1;
};

await main();
