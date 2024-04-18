import {test} from 'node:test';
import assert from 'node:assert';
import './document.js';

import {Observer, mount, h} from '../index.js';

test("mount changing text between", () => {
	const elem = document.createElement("body");
	const obs = Observer.mutable(0);

	mount(elem, h('div', {},
		'first',
		obs,
		'second',
	));

	obs.set(1);
	obs.set(2);

	assert.deepEqual(elem.tree(), {
		name: 'body',
		children: [{
			name: 'div',
			children: ["first", "2", "second"]
		}],
	});
});

test("mount changing text between in array", () => {
	const elem = document.createElement("body");
	const obs = Observer.mutable(0);

	mount(elem, [
		'first',
		obs,
		'second',
	]);

	obs.set(1);
	obs.set(2);

	assert.deepEqual(elem.tree(), {
		name: 'body',
		children: ["first", "2", "second"],
	});
});

test("mount changing node between", () => {
	const elem = document.createElement("body");
	const obs = Observer.mutable(document.createTextNode(0));

	mount(elem, h('div', {},
		'first',
		obs,
		'second',
	));

	obs.set(document.createTextNode(1));
	obs.set(document.createTextNode(2));

	assert.deepEqual(elem.tree(), {
		name: 'body',
		children: [{
			name: 'div',
			children: ["first", "2", "second"]
		}],
	});
});

test("mount changing node between in array", () => {
	const elem = document.createElement("body");
	const obs = Observer.mutable(document.createTextNode(0));

	mount(elem, [
		'first',
		obs,
		'second',
	]);

	obs.set(document.createTextNode(1));
	obs.set(document.createTextNode(2));

	assert.deepEqual(elem.tree(), {
		name: 'body',
		children: ["first", "2", "second"],
	});
});

test("mount changing custom element", () => {
	const elem = document.createElement("body");
	const custom = () => {
		return "hello";
	};

	const custom2 = () => {
		return "hello2";
	};

	const custom3 = () => {
		return "hello3";
	};

	const c = Observer.mutable(custom);

	mount(elem, c.map(h));

	c.set(custom2);
	c.set(custom3);

	assert.deepEqual(elem.tree(), {
		name: 'body',
		children: ["hello3"],
	});
});

test("mount div with changing attribute", () => {
	const elem = document.createElement("body");
	const o = Observer.mutable(1);

	mount(elem, h('div', {val: o}));
	o.set(2);

	assert.deepEqual(elem.tree(), {
		name: 'body',
		children: [{
			name: 'div',
			attributes: {val: '2'}
		}],
	});
});

test("mount div with changing property", () => {
	const elem = document.createElement("body");
	const o = Observer.mutable(1);

	mount(elem, h('div', {$val: o}));

	o.set(2);

	assert.deepEqual(elem.tree(), {
		name: 'body',
		children: [{
			name: 'div',
			val: 2,
		}],
	});
});

test("mount div with nested changing property", () => {
	const elem = document.createElement("body");
	const o = Observer.mutable(1);

	mount(elem, h('div', {$style: {hello: o}}));

	o.set(2);

	assert.deepEqual(elem.tree(), {
		name: 'body',
		children: [{
			name: 'div',
			style: {
				hello: 2,
			}
		}],
	});
});
