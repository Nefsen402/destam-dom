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

test("replacement reuse node", () => {
	const elem = document.createElement("body");
	let Elem = document.createElement('div');

	mount(document.dummy, h(Elem, {},
		Observer.immutable("Hello world"),
	));

	mount(elem, Elem);

	assert.deepEqual(elem.tree(), {
		name: 'body',
		children: [{
			name: 'div',
			children: ["Hello world"]
		}],
	});
});

test("replacement clear nested node", () => {
	const elem = document.createElement("body");
	const elem2 = document.createElement("div");

	const rem = mount(elem, h('div', {},
		h(elem2, {}, Observer.immutable("Hello world")),
	));

	rem();

	assert.deepEqual(elem.tree(), {
		name: 'body',
	});

	assert.deepEqual(elem2.tree(), {
		name: 'div',
	});
});

test("map nested node", () => {
	const elem = document.createElement("body");

	const content = Observer.mutable(null);
	const remove = mount(elem, content.map(content => {
		if (!content) {
			return null;
		}

		return h('div', {id: 'content'}, content);
	}));

	content.set(h('div'));

	assert.deepEqual(elem.tree(), {
		name: 'body',
		children: [{
			name: 'div',
			attributes: {
				id: 'content',
			},
			children: [{
				name: 'div'
			}]
		}]
	});

	remove();

	assert.deepEqual(elem.tree(), {
		name: 'body',
	});
});

test("shadow constant", () => {
	const elem = document.createElement("body");

	const constant = "hello world";
	const create = (constant) => {
		mount(elem, h('div', {constant}));
	};

	const mutable = Observer.mutable(0);
	create(mutable);
	mutable.set(1);

	assert.deepEqual(elem.tree(), {
		name: 'body',
		children: [{
			name: 'div',
			attributes: {
				constant: 1,
			}
		}],
	});
});

test("shadow with destructure", () => {
	const elem = document.createElement("body");

	const constant = "hello world";
	const create = ({mutable: constant}) => {
		mount(elem, h('div', {constant}));
	};

	const mutable = Observer.mutable(0);
	create({mutable});
	mutable.set(1);

	assert.deepEqual(elem.tree(), {
		name: 'body',
		children: [{
			name: 'div',
			attributes: {
				constant: 1,
			}
		}],
	});
});

test("shadow with spread", () => {
	const elem = document.createElement("body");

	const $constant = "hello world";
	const create = (...$constant) => {
		mount(elem, h('div', {$constant}));
	};

	const mutable = Observer.mutable(0);
	create(mutable);
	mutable.set(1);

	assert.deepEqual(elem.tree(), {
		name: 'body',
		children: [{
			name: 'div',
			constant: [mutable],
		}],
	});
});

test("static reuse", () => {
	const reuse = h('div');

	const thing = Observer.mutable(null);

	const elem = document.createElement("body");
	mount(elem, thing);

	thing.set(h('div', {}, reuse));
	thing.set(h('div', {}, reuse));

	assert.deepEqual(elem.tree(), {
		name: 'body',
		children: [{
			name: 'div',
			children: [{
				name: 'div'
			}]
		}],
	});
});

test("mount out of order", () => {
	const stuff = Array(4).fill(null).map(() => Observer.mutable(null));

	const elem = document.createElement("body");
	mount(elem, stuff);

	stuff[3].set('4');
	stuff[0].set('1');
	stuff[2].set('3');
	stuff[1].set('2');

	assert.deepEqual(elem.tree(), {
		name: 'body',
		children: ['1', '2', '3', '4'],
	});
});

test("mount out of order in div children", () => {
	const stuff = Array(4).fill(null).map(() => Observer.mutable(null));

	const elem = document.createElement("body");
	mount(elem, h('div', {}, ...stuff));

	stuff[3].set('4');
	stuff[0].set('1');
	stuff[2].set('3');
	stuff[1].set('2');

	assert.deepEqual(elem.tree(), {
		name: 'body',
		children: [{
			name: 'div',
			children: ['1', '2', '3', '4'],
		}],
	});
});

test("swap to null attribute", () => {
	const elem = document.createElement("body");

	const attr = Observer.mutable('hello');
	mount(elem, h('div', {attrib: attr}));

	attr.set(undefined);

	assert.deepEqual(elem.tree(), {
		name: 'body',
		children: [{
			name: 'div',
		}],
	});
});

test("swap to null attribute", () => {
	const elem = document.createElement("body");

	const attr = Observer.mutable('hello');
	mount(elem, h('div', {attrib: attr}));

	attr.set(null);

	assert.deepEqual(elem.tree(), {
		name: 'body',
		children: [{
			name: 'div',
		}],
	});
});
