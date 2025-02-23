import {test as nodetest} from 'node:test';
import assert from 'node:assert';
import './document.js';

import {mount, h} from '../index.js';

const test = (name, cb) => {
	nodetest(name, () => {
		const context = Symbol();

		let failed = false;

		const checker = (elem, item, before, c) => (c !== context && (failed = true), () => {});

		mount(document.dummy, cb(checker), undefined, context);

		assert(!failed);
	});
};

test('context', comp => {
	return comp;
});

test('context nested', comp => {
	return h('div', {}, comp);
});

test('context nested twice', comp => {
	return h('div', {}, h('div', {}, comp));
});

test('context array', comp => {
	return [comp, comp];
});

test('context nested arrays', comp => {
	return [
		[comp, comp],
		[comp, comp],
	];
});

test('context component', comp => {
	const Comp = () => {
		return comp;
	};

	return h(Comp);
});

test('context nested components', comp => {
	const Comp = () => {
		return comp;
	};

	const Comp2 = () => {
		return h(Comp);
	};

	return h(Comp2);
});

test('context component array', comp => {
	const Comp2 = () => {
		return [comp, comp, comp];
	};

	return h(Comp2);
});

test('context nested components array', comp => {
	const Comp = () => {
		return comp;
	};

	const Comp2 = () => {
		return [h(Comp), h(Comp), h(Comp)];
	};

	return h(Comp2);
});

test('context component array and div', comp => {
	const Comp2 = () => {
		return [h('div', {}, comp), h('div', {}, comp), h('div', {}, comp)];
	};

	return h(Comp2);
});
