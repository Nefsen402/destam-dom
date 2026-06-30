import {test} from 'node:test';
import assert from 'node:assert';
import './document.js';

import {Observer, OArray, mount, h} from '../index.js';
import {atomic} from 'destam/Network.js';
import OObject from 'destam/Object.js';

test("array item swap", () => {
	const elem = document.createElement("body");
	const items = OArray();

	mount(elem, items);

	items.push(1, 2, 3, 4, 5);
	atomic(() => {
		let tmp = items[1];
		items[1] = items[3];
		items[3] = tmp;
	});

	assert.deepEqual(elem.tree(), {
		name: 'body',
		children: "1 4 3 2 5".split(" "),
	});
});

test("array item swap custom element", () => {
	const elem = document.createElement("body");
	const items = OArray();

	let count = 0;
	mount(elem, h(({each}) => {
		count++;
		return each;
	}, {each: items}));

	items.push(1, 2, 3, 4, 5);
	atomic(() => {
		let tmp = items[1];
		items[1] = items[3];
		items[3] = tmp;
	});

	assert.deepEqual(elem.tree(), {
		name: 'body',
		children: "1 4 3 2 5".split(" "),
	});
	assert.equal(count, 5);
});

test("contiguous atomic modifies preserve order", () => {
	const elem = document.createElement("body");
	const items = OArray([0, 1, 2, 3, 4, 5]);

	mount(elem, items);

	// a run of adjacent modifies, batched into one commit
	atomic(() => {
		items[0] = 10;
		items[1] = 11;
		items[2] = 12;
	});

	assert.deepEqual(elem.tree(), {
		name: 'body',
		children: ["10", "11", "12", "3", "4", "5"],
	});
});

test("array splice bigger array listen items", () => {
	const obj = OArray([OObject()]);

	const special = OObject();
	obj.splice(0, 1, special, OObject());

	const events = [];
	const stop = obj.observer.watch(delta => {
		events.push(delta.value);
	});

	obj.pop();
	special.value = 'val';
	obj.pop();

	assert.deepStrictEqual(events, [undefined, 'val', undefined]);

	stop();
});

test("array splice smaller array listen items", () => {
	const special = OObject();
	const obj = OArray([OObject(), special, OObject()]);

	obj.splice(0, 2, OObject());

	const events = [];
	const stop = obj.observer.watch(delta => {
		events.push(delta.value);
	});

	obj.pop();
	special.value = 'val';
	obj.pop();

	assert.deepStrictEqual(events, [undefined, undefined]);

	stop();
});

test("OArray splice while watched", () => {
	const items = OArray([OObject(), OObject(), OObject()]);
	const stop = items.observer.watch(() => {});

	items.splice(0, 2, OObject());
	items.pop();
	items.pop();

	stop();
});

test("OArray fuzz", () => {
	let s = 1234 >>> 0;
	const rng = () => {
		s = (s * 1664525 + 1013904223) >>> 0;
		return s / 0x100000000;
	};

	const pick = (rng, arr) => arr[Math.floor(rng() * arr.length)];

	const items = OArray([
		OObject({ label: 'a' }),
		OObject({ label: 'b' }),
		OObject({ label: 'c' }),
		OObject({ label: 'd' }),
	]);

	const ops = ['push', 'pop', 'shift', 'unshift', 'splice', 'swap', 'replace'];
	for (let i = 0; i < 5000; i++) {
		const len = items.length;
		switch (pick(rng, ops)) {
			case 'push': items.push(OObject({ label: `p${i}` })); break;
			case 'pop': if (len) items.pop(); break;
			case 'shift': if (len) items.shift(); break;
			case 'unshift': items.unshift(OObject({ label: `u${i}` })); break;
			case 'splice': {
				const start = len ? Math.floor(rng() * len) : 0;
				const del = len ? Math.floor(rng() * Math.min(3, len - start)) : 0;
				const adds = Math.floor(rng() * 5);
				const vals = [];
				for (let j = 0; j < adds; j++) vals.push(OObject({ label: `s${i}-${j}` }));
				items.splice(start, del, ...vals);
				break;
			}
			case 'swap': {
				// reuses existing element instances -> same observable briefly at two indices
				if (len < 2) break;
				const a = Math.floor(rng() * len);
				let b = Math.floor(rng() * len);
				if (b === a) b = (b + 1) % len;
				const va = items[a];
				const vb = items[b];
				items[b] = va;
				items[a] = vb;
				break;
			}
			case 'replace': {
				if (!len) break;
				items[Math.floor(rng() * len)] = OObject({ label: `r${i}` });
				break;
			}
		}
	}

	for (let i = 0; i < items.length; i++) {
		assert.strictEqual(items.observer.indexes_[i].observer_, items[i].observer);
	}
});

test("mounting does not pollute destam link objects", () => {
	// Mounting must not stash transient state as (string-keyed) properties on
	// destam's link objects -- that belongs in mounter-local maps. The property
	// names destam itself uses get mangled by the build passes, so the approved
	// set is learned empirically at runtime from an unmounted reference array
	// driven through the same operations. (linkGetter is a Symbol, so it sits
	// outside string-keyed enumeration and is intentionally not counted.)
	const exercise = (arr, visit) => {
		visit(arr);
		arr.push(4, 5);       visit(arr);   // insert
		arr.unshift(0);       visit(arr);   // insert at front
		arr.splice(2, 0, 99); visit(arr);   // insert in the middle
		arr[1] = 42;          visit(arr);   // modify
		arr.splice(0, 2);     visit(arr);   // delete
	};

	const allowed = new Set();
	exercise(OArray([1, 2, 3]), arr => {
		for (const link of arr.observer.indexes_)
			for (const prop of Object.getOwnPropertyNames(link)) allowed.add(prop);
	});

	const elem = document.createElement("body");
	const items = OArray([1, 2, 3]);
	mount(elem, items);
	exercise(items, arr => {
		for (const link of arr.observer.indexes_)
			for (const prop of Object.getOwnPropertyNames(link))
				assert.ok(allowed.has(prop),
					`link polluted with property "${prop}" after mounting`);
	});
});

test("atomic reverse a contiguous block", () => {
	const elem = document.createElement("body");
	const items = OArray([0, 1, 2, 3, 4]);
	mount(elem, items);

	atomic(() => {
		const snap = [...items];
		for (let i = 0; i < snap.length; i++) items[i] = snap[snap.length - 1 - i];
	});

	assert.deepEqual(elem.tree(), {
		name: 'body',
		children: ["4", "3", "2", "1", "0"],
	});
});

test("atomic rotate a contiguous block left", () => {
	const elem = document.createElement("body");
	const items = OArray([0, 1, 2, 3, 4]);
	mount(elem, items);

	atomic(() => {
		const snap = [...items];
		for (let i = 0; i < snap.length; i++) items[i] = snap[(i + 1) % snap.length];
	});

	assert.deepEqual(elem.tree(), {
		name: 'body',
		children: ["1", "2", "3", "4", "0"],
	});
});

test("atomic swap adjacent pairs", () => {
	const elem = document.createElement("body");
	const items = OArray([0, 1, 2, 3, 4, 5]);
	mount(elem, items);

	atomic(() => {
		for (let i = 0; i < items.length; i += 2) {
			const t = items[i];
			items[i] = items[i + 1];
			items[i + 1] = t;
		}
	});

	assert.deepEqual(elem.tree(), {
		name: 'body',
		children: ["1", "0", "3", "2", "5", "4"],
	});
});

test("atomic reverse adjacent dom nodes preserves identity", () => {
	const elem = document.createElement("body");
	const a = document.createElement("a");
	const b = document.createElement("b");
	const c = document.createElement("c");
	const items = OArray([a, b, c]);
	mount(elem, items);

	atomic(() => { items[0] = c; items[2] = a; });

	assert.deepEqual(elem.tree(), {
		name: 'body',
		children: [{name: 'c'}, {name: 'b'}, {name: 'a'}],
	});
	// the very same nodes were moved, not recreated
	assert.equal(elem.childNodes[0], c);
	assert.equal(elem.childNodes[1], b);
	assert.equal(elem.childNodes[2], a);
});

test("atomic mixed modify/insert/delete on adjacent indices", () => {
	const elem = document.createElement("body");
	const items = OArray([0, 1, 2, 3, 4]);
	mount(elem, items);

	atomic(() => {
		items[1] = 11;          // [0,11,2,3,4]
		items.splice(2, 0, 99); // [0,11,99,2,3,4]
		items[0] = 10;          // [10,11,99,2,3,4]
		items.splice(4, 2);     // [10,11,99,2]
	});

	assert.deepEqual(elem.tree(), {
		name: 'body',
		children: ["10", "11", "99", "2"],
	});
});

test("atomic adjacent operations fuzz", () => {
	const elem = document.createElement("body");
	let seed = 0x1234567;
	const rng = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
	const randint = n => Math.floor(rng() * n);

	const items = OArray(Array.from({length: 8}, (_, i) => i));
	const ref = Array.from({length: 8}, (_, i) => i);
	mount(elem, items);

	const check = iter => assert.deepEqual(elem.tree().children || [], ref.map(String),
		`mismatch at iter ${iter}`);

	let v = 100;
	for (let iter = 0; iter < 400; iter++) {
		const len = ref.length;
		const choice = randint(3);

		if (choice === 0 && len > 0) {
			// A batch of modifies on DISTINCT links, each to a distinct value.
			// Deltas in a commit are unordered, so a link may be touched at most
			// once per atomic() -- pick indices without replacement.
			const pool = Array.from({length: len}, (_, i) => i);
			const count = 1 + randint(Math.min(len, 6));
			const picks = [];
			for (let k = 0; k < count; k++) picks.push(pool.splice(randint(pool.length), 1)[0]);

			atomic(() => {
				for (const i of picks) {
					const val = v++;
					items[i] = val;
					ref[i] = val;
				}
			});
		} else if (choice === 1) {
			// insert an adjacent block (a single splice is one commit of all-new links)
			const i = randint(len + 1);
			const vals = Array.from({length: 1 + randint(3)}, () => v++);
			items.splice(i, 0, ...vals);
			ref.splice(i, 0, ...vals);
		} else if (len > 0) {
			// delete an adjacent block (a single splice is one commit)
			const i = randint(len);
			const c = 1 + randint(Math.min(3, len - i));
			items.splice(i, c);
			ref.splice(i, c);
		}

		check(iter);
	}
});
