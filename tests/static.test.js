import {test} from 'node:test';
import assert from 'node:assert';
import './document.js';

import {mount, h} from '../index.js';

test("mount null", () => {
	const elem = document.createElement("body");

	mount(elem, null);

	assert.deepEqual(elem.tree(), {
		name: 'body',
	});
});

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

test("mount null in node", () => {
	const elem = document.createElement("body");

	mount(elem, h('div', {}, null));

	assert.deepEqual(elem.tree(), {
		name: 'body',
		children: [{name: 'div'}]
	});
});

test("mount node null children", () => {
	const elem = document.createElement("body");

	mount(elem, h('div', {children: null}));

	assert.deepEqual(elem.tree(), {
		name: 'body',
		children: [{name: 'div'}]
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

test("mount div with nested property", () => {
	const elem = document.createElement("body");

	mount(elem, h('div', {$style: {hello: 'world'}}));

	assert.deepEqual(elem.tree(), {
		name: 'body',
		children: [{
			name: 'div',
			style: {
				hello: 'world',
			}
		}],
	});
});

test("mount div with nested property removal", () => {
	const elem = document.createElement("body");

	const remove = mount(elem, h('div', {$style: {hello: 'world'}}));
	remove();

	assert.deepEqual(elem.tree(), {
		name: 'body',
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

test ("mount to null", () => {
	const div = document.createElement("div");

	mount(null, h(div, {prop: 'prop'}));

	assert.deepEqual(div.tree(), {
		name: 'div',
		attributes: {prop: 'prop'},
	});
});

test ("mount to null and remove", () => {
	const div = document.createElement("div");

	const remove = mount(null, h(div, {prop: 'prop'}));
	remove();

	assert.deepEqual(div.tree(), {
		name: 'div',
		attributes: {prop: 'prop'},
	});
});

test ("mount node as child", () => {
	const div = document.createElement("div");

	const remove = mount(null, h(div, {}, document.createTextNode(0)));
	remove();

	assert.deepEqual(div.tree(), {
		name: 'div',
		children: ["0"],
	});
});

test ("static h tag returns node", () => {
	assert(h('div') instanceof Node);
});

test ("static h tag returns node with attribute", () => {
	assert(h('div', {class: 'test'}) instanceof Node);
});
