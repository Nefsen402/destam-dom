import {test} from 'node:test';
import assert from 'node:assert';
import './document.js';

import {mount, OArray, Observer} from '../index.js';

const createCustomNode = () => {
	let elems = [];
	let obj = {
		elems,
		insertBefore: (elem, before) => {
			const i = elems.indexOf(before);
			if (i === -1) {
				elems.push(elem);
			} else {
				elems.splice(i, 0, elem);
			}
		},
		replaceChild: (newNode, oldNode) => {
			const i = elems.indexOf(oldNode);
			elems.splice(i, 1, newNode);
			obj.replaced = true;
		},
		removeChild: (node) => {
			const i = elems.indexOf(node);
			elems.splice(i, 1);
		},
		set textContent (content) {
			elems.splice(0, elems.length);
			obj.fastClear = true;
		},
		get firstChild () {
			return elems[0];
		},
	};

	return obj;
};

test("duck type basic", () => {
	const elem = createCustomNode();

	mount(elem, "hello world");
	assert.deepEqual(elem.elems.map(e => e.tree()), ["hello world"]);
});

test("duck type basic remove", () => {
	const elem = createCustomNode();

	const remove = mount(elem, "hello world");
	remove();

	assert.deepEqual(elem.elems.map(e => e.tree()), []);
});

test("duck type replace", () => {
	const elem = createCustomNode();

	const obs = Observer.mutable("hello world");
	mount(elem, obs);
	obs.set("new");

	assert.deepEqual(elem.elems.map(e => e.tree()), ["new"]);
});

test("duck type array clear", () => {
	const elem = createCustomNode();

	const obs = OArray([1, 2, 3]);
	mount(elem, obs);
	obs.splice(0, obs.length);

	assert.deepEqual(elem.elems.map(e => e.tree()), []);
	assert(elem.fastClear === true)
});

test("duck type array nested clear", () => {
	const elem = createCustomNode();

	const obs = OArray([1, 2, 3]);
	mount(elem, OArray([obs]));
	obs.splice(0, obs.length);

	assert.deepEqual(elem.elems.map(e => e.tree()), []);
	assert(elem.fastClear === true)
});

test("duck type observer array clear", () => {
	const elem = createCustomNode();

	const obs = Observer.mutable([1, 2, 3]);
	mount(elem, obs);
	obs.set([]);

	assert.deepEqual(elem.elems.map(e => e.tree()), []);
	assert(elem.fastClear === true)
});

test("duck type replacement", () => {
	const elem = createCustomNode();
	const node1 = document.createElement('div');
	const node2 = document.createElement('div');

	const obs = Observer.mutable(node1);
	mount(elem, obs);
	obs.set(node2);

	assert.deepEqual(elem.elems, [node2]);
	assert(elem.replaced === true);
});
