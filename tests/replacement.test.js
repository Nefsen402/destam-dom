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

test("mount changing text between with map", () => {
	const elem = document.createElement("body");
	const obs = Observer.mutable(0);

	mount(elem, h('div', {},
		'first',
		obs.map(x => x * 2),
		'second',
	));

	obs.set(1);
	obs.set(2);

	assert.deepEqual(elem.tree(), {
		name: 'body',
		children: [{
			name: 'div',
			children: ["first", "4", "second"]
		}],
	});
});

test("mount changing type", () => {
	const elem = document.createElement("body");
	const obs = Observer.mutable(0);

	mount(elem, h('div', {},
		'first',
		obs,
		'second',
	));

	obs.set(h('div'));

	assert.deepEqual(elem.tree(), {
		name: 'body',
		children: [{
			name: 'div',
			children: ["first", {name: 'div'}, "second"]
		}],
	});
});

test("mount changing text between removal", () => {
	const elem = document.createElement("body");
	const obs = Observer.mutable(0);

	const remove = mount(elem, h('div', {},
		'first',
		obs,
		'second',
	));

	obs.set(1);
	obs.set(2);
	remove();

	assert.deepEqual(elem.tree(), {
		name: 'body',
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

test("mount changing node between nested", () => {
	const elem = document.createElement("body");
	const obs = Observer.mutable(document.createTextNode(0));

	mount(elem, h('div', {},
		'first',
		h('div', {}, obs),
		'second',
	));

	obs.set(document.createTextNode(1));
	obs.set(document.createTextNode(2));

	assert.deepEqual(elem.tree(), {
		name: 'body',
		children: [{
			name: 'div',
			children: ["first", {
				name: 'div',
				children: ["2"]
			}, "second"]
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

test("mount div with changing attribute with map", () => {
	const elem = document.createElement("body");
	const o = Observer.mutable(1);

	mount(elem, h('div', {val: o.map(o => o * 2)}));
	o.set(2);

	assert.deepEqual(elem.tree(), {
		name: 'body',
		children: [{
			name: 'div',
			attributes: {val: '4'}
		}],
	});
});

test("mount div with changing attribute with block map", () => {
	const elem = document.createElement("body");
	const o = Observer.mutable(1);

	mount(elem, h('div', {val: o.map(o => {
		return o * 2;
	})}));
	o.set(2);

	assert.deepEqual(elem.tree(), {
		name: 'body',
		children: [{
			name: 'div',
			attributes: {val: '4'}
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

test("mount div with changing property with map", () => {
	const elem = document.createElement("body");
	const o = Observer.mutable(1);

	mount(elem, h('div', {$val: o.map(o => o * 2)}));

	o.set(2);

	assert.deepEqual(elem.tree(), {
		name: 'body',
		children: [{
			name: 'div',
			val: 4,
		}],
	});
});

test("mount div with toggle attribute", () => {
	const elem = document.createElement("body");
	const o = Observer.mutable(true);

	mount(elem, h('div', {val: o}));

	assert.deepEqual(elem.tree(), {
		name: 'body',
		children: [{
			name: 'div',
			attributes: {val: ""},
		}],
	});

	o.set(false);

	assert.deepEqual(elem.tree(), {
		name: 'body',
		children: [{
			name: 'div',
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

test("replacement remove", () => {
	const elem = document.createElement("body");
	const o = Observer.mutable(1);

	const remove = mount(elem, o);

	remove();
	o.set(2);

	assert.deepEqual(elem.tree(), {
		name: 'body',
	});
});

test("replacement array impl", () => {
	const elem = document.createElement("body");
	const arr = [1, 2, 3];

	const o = Observer.mutable(({each}) => each);
	mount(elem, o.map(o => h(o, {each: arr})));

	assert.deepEqual(elem.tree(), {
		name: 'body',
		children: ['1', '2', '3']
	});

	o.set(({each}) => each + 1);

	assert.deepEqual(elem.tree(), {
		name: 'body',
		children: ['2', '3', '4']
	});
});

test("replacement node with deps", () => {
	const elem = document.createElement("body");

	const prop = Observer.mutable(1);
	const o = Observer.mutable({
		val: prop
	});
	mount(elem, o.map(o => h('div', o)));

	assert.deepEqual(elem.tree(), {
		name: 'body',
		children: [{name: 'div', attributes: {val: 1}}]
	});

	o.set({val2: prop});
	prop.set(2);

	assert.deepEqual(elem.tree(), {
		name: 'body',
		children: [{name: 'div', attributes: {val2: 2}}]
	});
});

test("replacement of array as each", () => {
	const elem = document.createElement("body");
	let each = [1, 2, 3];

	const custom1 = ({each}) => {
		return each;
	};

	const custom2 = ({each}) => {
		return -each;
	};

	const val = Observer.mutable(h(custom1, {each}));
	mount(elem, val);
	val.set(h(custom2, {each}));

	assert.deepEqual(elem.tree(), {
		name: 'body',
		children: ["-1", "-2", "-3"]
	});
});

test("replacement of array as each observer", () => {
	const elem = document.createElement("body");
	let each = Observer.mutable([1, 2, 3]);

	const custom1 = ({each}) => {
		return each;
	};
	const val = Observer.mutable(h(custom1, {each}));
	mount(elem, val);

	assert.deepEqual(elem.tree(), {
		name: 'body',
		children: ["1", "2", "3"]
	});
});

test("replacement of array as each observer remove", () => {
	const elem = document.createElement("body");
	let each = Observer.mutable([1, 2, 3]);

	const custom1 = ({each}) => {
		return each;
	};
	const val = Observer.mutable(h(custom1, {each}));
	const remove = mount(elem, val);
	remove();

	assert.deepEqual(elem.tree(), {
		name: 'body',
	});
});
