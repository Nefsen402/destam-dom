import {test} from 'node:test';
import assert from 'node:assert';
import './document.js';

import {mount, h} from '../index.js';

test("mount text", () => {
	const elem = document.createElement("body");

	mount(elem, "Hello World");

	assert.deepEqual(elem.tree(), {
		name: 'body',
		children: ["Hello World"],
	});
});

test("mount number", () => {
	const elem = document.createElement("body");

	mount(elem, 1);

	assert.deepEqual(elem.tree(), {
		name: 'body',
		children: ["1"],
	});
});

test("mount boolean", () => {
	const elem = document.createElement("body");

	mount(elem, false);
	mount(elem, true);

	assert.deepEqual(elem.tree(), {
		name: 'body',
		children: ["false", "true"],
	});
});

test("mount array", () => {
	const elem = document.createElement("body");

	mount(elem, [1, 2, 3]);

	assert.deepEqual(elem.tree(), {
		name: 'body',
		children: ["1", "2", "3"],
	});
});

test("mount node", () => {
	const elem = document.createElement("body");
	const node = document.createElement('div');

	mount(elem, h(node));

	assert.deepEqual(elem.tree(), {
		name: 'body',
		children: [{
			name: 'div',
		}],
	});
});

test("mount iterable", () => {
	const elem = document.createElement("body");

	const set = new Set([1, 2, 3]);
	mount(elem, set.keys());

	assert.deepEqual(elem.tree(), {
		name: 'body',
		children: ["1", "2", "3"],
	});
});

test("mount div", () => {
	const elem = document.createElement("body");

	mount(elem, h('div'));

	assert.deepEqual(elem.tree(), {
		name: 'body',
		children: [{
			name: 'div',
		}],
	});
});

test("mount div with attribute", () => {
	const elem = document.createElement("body");

	mount(elem, h('div', {val: 'hello'}));

	assert.deepEqual(elem.tree(), {
		name: 'body',
		children: [{
			name: 'div',
			attributes: {val: 'hello'}
		}],
	});
});

test("mount div with property", () => {
	const elem = document.createElement("body");

	mount(elem, h('div', {$val: 'hello'}));

	assert.deepEqual(elem.tree(), {
		name: 'body',
		children: [{
			name: 'div',
			val: 'hello',
		}],
	});
});

test ("mount custom element", () => {
	const elem = document.createElement("body");

	const custom = () => {
		return "hello";
	};

	mount(elem, h(custom));

	assert.deepEqual(elem.tree(), {
		name: 'body',
		children: ["hello"],
	});
});
