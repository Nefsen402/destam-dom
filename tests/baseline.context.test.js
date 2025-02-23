import {test as nodetest} from 'node:test';
import assert from 'node:assert';
import './document.js';

import {mount, h} from '../index.js';

const test = (name, cb) => {
	nodetest(name, () => {
		const context = Symbol();

		let failed = false;

		const Comp = () => {
			return (elem, item, before, c) => (c !== context && (failed = true), () => {})
		};

		mount(document.dummy, cb(Comp), undefined, context);

		assert(!failed);
	});
};

test('context', Comp => {
	return h(Comp);
});

test('context nested', Comp => {
	return h('div', {}, h(Comp));
});

test('context nested twice', Comp => {
	return h('div', {}, h('div', {}, h(Comp)));
});

test('context nested components', Comp => {
	const Comp2 = () => {
		return h(Comp);
	};

	return h(Comp2);
});

test('context nested components array', Comp => {
	const Comp2 = () => {
		return [h(Comp), h(Comp), h(Comp)];
	};

	return h(Comp2);
});

test('context nested components array and div', Comp => {
	const Comp2 = () => {
		return [h('div', {}, h(Comp)), h('div', {}, h(Comp)), h('div', {}, h(Comp))];
	};

	return h(Comp2);
});

test('context nested arrays', Comp => {
	return [
		[h(Comp), h(Comp)],
		[h(Comp), h(Comp)],
	];
});

nodetest('context array', () => {
	const context = Symbol();

	let failed = false;

	const Comp = () => {
		return [
			(elem, item, before, c) => (c !== context && (failed = true), () => {}),
			(elem, item, before, c) => (c !== context && (failed = true), () => {}),
		];
	};

	mount(document.dummy, h(Comp), undefined, context);

	assert(!failed);
});
