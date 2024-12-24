import {test} from 'node:test';
import assert from 'node:assert';
import './document.js';

import {Observer, OArray, mount, h} from '../index.js';

test("array", () => {
	const elem = document.createElement("body");
	const items = OArray([1, 2]);

	mount(elem, items);

	assert.deepEqual(elem.tree(), {
		name: 'body',
		children: ["1", "2"],
	});
});

test("array push", () => {
	const elem = document.createElement("body");
	const items = OArray();

	mount(elem, items);

	items.push(1);
	items.push(2);

	assert.deepEqual(elem.tree(), {
		name: 'body',
		children: ["1", "2"],
	});
});

test("array unshift", () => {
	const elem = document.createElement("body");
	const items = OArray();

	mount(elem, items);

	items.push(1);
	items.unshift(2);

	assert.deepEqual(elem.tree(), {
		name: 'body',
		children: ["2", "1"],
	});
});

test("array modify", () => {
	const elem = document.createElement("body");
	const items = OArray();

	mount(elem, items);

	items.push(1);
	items[0] = 2;

	assert.deepEqual(elem.tree(), {
		name: 'body',
		children: ["2"],
	});
});

test("array splice modify", () => {
	const elem = document.createElement("body");
	const items = OArray();

	mount(elem, items);

	items.push(1);
	items.splice(0, 1, [2]);

	assert.deepEqual(elem.tree(), {
		name: 'body',
		children: ["2"],
	});
});

test("array fill", () => {
	const elem = document.createElement("body");
	const items = OArray();

	mount(elem, items);

	items.push(1, 2, 3);
	items.fill('a');

	assert.deepEqual(elem.tree(), {
		name: 'body',
		children: ['a', 'a', 'a'],
	});
});

test("array pop", () => {
	const elem = document.createElement("body");
	const items = OArray();

	mount(elem, items);

	items.push(1, 2, 3);
	items.pop();

	assert.deepEqual(elem.tree(), {
		name: 'body',
		children: ['1', '2'],
	});
});

test("array shift", () => {
	const elem = document.createElement("body");
	const items = OArray();

	mount(elem, items);

	items.push(1, 2, 3);
	items.shift();

	assert.deepEqual(elem.tree(), {
		name: 'body',
		children: ['2', '3'],
	});
});

test("array removal", () => {
	const elem = document.createElement("body");
	const items = OArray();

	const remove = mount(elem, items);

	items.push(1, 2);
	remove();

	assert.deepEqual(elem.tree(), {
		name: 'body',
	});
});

test("array add and remove", () => {
	const elem = document.createElement("body");
	const items = OArray();

	mount(elem, items);

	items.push(1, 2);
	items.splice(0, 1);

	assert.deepEqual(elem.tree(), {
		name: 'body',
		children: ["2"],
	});
});

test("array clear", () => {
	const elem = document.createElement("body");
	const items = OArray();

	mount(elem, items);

	items.push(1, 2);
	items.splice(0, 2);

	assert.deepEqual(elem.tree(), {
		name: 'body',
	});
});

test("array clear with trailer", () => {
	const elem = document.createElement("body");
	const items = OArray();

	mount(elem, [items, h('div')]);

	items.push(1, 2);
	items.splice(0, 2);

	assert.deepEqual(elem.tree(), {
		name: 'body',
		children: [{name: 'div'}]
	});
});

test("array clear with header", () => {
	const elem = document.createElement("body");
	const items = OArray();

	mount(elem, [h('div'), items]);

	items.push(1, 2);
	items.splice(0, 2);

	assert.deepEqual(elem.tree(), {
		name: 'body',
		children: [{name: 'div'}]
	});
});

test("array item replace", () => {
	const elem = document.createElement("body");
	const items = OArray();

	mount(elem, items);

	items.push(1, 2);
	items[0] = 3;

	assert.deepEqual(elem.tree(), {
		name: 'body',
		children: ["3", "2"],
	});
});

test("array mount order consistency", () => {
	const elem = document.createElement("body");
	const items = OArray();

	const before = Observer.mutable(null);
	const after = Observer.mutable(null);

	mount(elem, [
		before,
		items,
		after,
	]);

	items.push(1, 2, 3, 4, 5);
	before.set(0);
	after.set(0)

	assert.deepEqual(elem.tree(), {
		name: 'body',
		children: "0 1 2 3 4 5 0".split(" "),
	});
});

test("array modify from mount", () => {
	const elem = document.createElement("body");

	const items = OArray();
	let count = 0;

	mount(elem, [
		h(({}, _, mounted) => {
			mounted(() => count++);

			return items;
		}),
		h(({}, _, mounted) => {
			mounted(() => count++);

			items.push(1, 2, 3);
			return null;
		})
	]);

	assert.deepEqual(elem.tree(), {
		name: 'body',
		children: ['1', '2', '3']
	});
	assert(count === 2);
});

test("replace empty oarray", () => {
	const elem = document.createElement("body");
	const arr = Observer.mutable([]);
	mount(elem, arr);

	let oarr = OArray();
	arr.set(oarr);

	oarr.push(document.createElement("div"));

	assert.deepEqual(elem.tree(), {
		name: 'body',
		children: [{
			name: 'div',
		}]
	});
});

test("replace empty oarray each", () => {
	const elem = document.createElement("body");
	const arr = Observer.mutable([]);
	mount(elem, h(({each}) => each, {each: arr}));

	let oarr = OArray();
	arr.set(oarr);

	oarr.push(document.createElement("div"));

	assert.deepEqual(elem.tree(), {
		name: 'body',
		children: [{
			name: 'div',
		}]
	});
});

test("each double up", () => {
	const elem = document.createElement("body");
	const arr = Observer.mutable([]);
	mount(elem, [h(({each}) => each, {each: arr}), h(({each}) => each, {each: arr})]);

	let oarr = OArray();
	arr.set(oarr);

	oarr.push('content');

	assert.deepEqual(elem.tree(), {
		name: 'body',
		children: ['content', 'content']
	});
});

test("unmount from custom component", () => {
	const elem = document.createElement("body");
	const arr = OArray();

	mount(elem, arr);

	const Comp = () => {
		arr.splice(0);

		return "hello world";
	};

	arr.push(h(Comp));

	assert.deepEqual(elem.tree(), {
		name: 'body',
	});
});

test("unmount from custom component indirection", () => {
	const elem = document.createElement("body");
	const arr = OArray();
	mount(elem, arr);

	const Comp = () => {
		arr.splice(0);

		return "hello world";
	};

	const content = Observer.mutable(h(Comp));
	arr.push(content);

	assert.deepEqual(elem.tree(), {
		name: 'body',
	});
});

test("unmount two custom elements", () => {
	const elem = document.createElement("body");
	const arr = OArray();
	mount(elem, arr);

	const Comp = () => {
		arr.splice(0);

		return "hello world";
	};

	const Comp2 = () => {
		return "hello world";
	};

	arr.push(h(Comp), h(Comp2));

	assert.deepEqual(elem.tree(), {
		name: 'body',
	});
});

test("unmount two custom elements inverted", () => {
	const elem = document.createElement("body");
	const arr = OArray();
	mount(elem, arr);

	const Comp = () => {
		return "hello world";
	};

	const Comp2 = () => {
		arr.splice(0);

		return "hello world";
	};

	arr.push(h(Comp), h(Comp2));

	assert.deepEqual(elem.tree(), {
		name: 'body',
	});
});

test("custom component insert order", () => {
	const elem = document.createElement("body");

	const Comp = ({text}) => {
		return text;
	};

	mount(elem, [
		h(Comp, {text: 1}),
		h(Comp, {text: 2}),
		h(Comp, {text: 3}),
		h(Comp, {text: 4}),
	]);

	assert.deepEqual(elem.tree(), {
		name: 'body',
		children: ["1", "2", "3", "4"]
	});
});

test("custom component insert order nested", () => {
	const elem = document.createElement("body");

	const Comp2 = ({text}) => {
		return text;
	};

	const Comp = (props) => {
		return h(Comp2, props);
	};

	mount(elem, h('div', {},
		h(Comp, {text: 1}),
		h(Comp, {text: 2}),
		h(Comp, {text: 3}),
		h(Comp, {text: 4}),
	));

	assert.deepEqual(elem.tree(), {
		name: 'body',
		children: [{
			name: 'div',
			children: ["1", "2", "3", "4"],
		}]
	});
});

test("custom component insert order array nested", () => {
	const elem = document.createElement("body");

	const Comp2 = ({text}) => {
		return text;
	};

	const Comp = (props) => {
		return h(Comp2, props);
	};

	mount(elem, [
		h(Comp, {text: 1}),
		[
			h(Comp, {text: 2}),
			[
				h(Comp, {text: 3}),
				h(Comp, {text: 4}),
			]
		]
	]);

	assert.deepEqual(elem.tree(), {
		name: 'body',
		children: ["1", "2", "3", "4"],
	});
});

test("custom component insert order array nested inverted", () => {
	const elem = document.createElement("body");

	const Comp2 = ({text}) => {
		return text;
	};

	const Comp = (props) => {
		return h(Comp2, props);
	};

	mount(elem, [
		[
			[
				h(Comp, {text: 1}),
				h(Comp, {text: 2}),
			],
			h(Comp, {text: 3}),
		],
		h(Comp, {text: 4}),
	]);

	assert.deepEqual(elem.tree(), {
		name: 'body',
		children: ["1", "2", "3", "4"],
	});
});

test("custom component insert order array nested deffered", () => {
	const elem = document.createElement("body");

	const Comp2 = ({text}) => {
		return text;
	};

	const Comp = (props) => {
		return h(Comp2, props);
	};

	const cont = OArray();

	mount(elem, [
		h(Comp, {text: 1}),
		cont
	]);

	cont.push(
		h(props => {
			cont.splice(0, 0,
				h(Comp, {text: 2}),
				h(Comp, {text: 3}),
			);

			return Comp(props);
		}, {text: 4}),
	);

	assert.deepEqual(elem.tree(), {
		name: 'body',
		children: ["1", "2", "3", "4"],
	});
});

test("custom component insert order array nested deferred inverted", () => {
	const elem = document.createElement("body");

	const Comp2 = ({text}) => {
		return text;
	};

	const Comp = (props) => {
		return h(Comp2, props);
	};

	const cont = OArray();

	mount(elem, [
		cont,
		h(Comp, {text: 4}),
	]);

	cont.push(
		h(props => {
			cont.push(
				h(Comp, {text: 2}),
				h(Comp, {text: 3}),
			);
			return Comp(props)
		}, {text: 1}),
	);

	assert.deepEqual(elem.tree(), {
		name: 'body',
		children: ["1", "2", "3", "4"],
	});
});

test("custom component mixed with text insert order", () => {
	const elem = document.createElement("body");

	const Comp = ({text}) => {
		return text;
	};

	mount(elem, [
		h('div'),
		h(Comp, {text: 2}),
		h('div'),
		h(Comp, {text: 4}),
	]);

	assert.deepEqual(elem.tree(), {
		name: 'body',
		children: [{name: 'div'}, "2", {name: 'div'}, "4"]
	});
});

test("custom component insert order in oarray", () => {
	const elem = document.createElement("body");

	const Comp = ({text}) => {
		return text;
	};

	const arr = OArray();

	mount(elem, arr);

	arr.push(
		h(Comp, {text: 1}),
		h(Comp, {text: 2}),
		h(Comp, {text: 3}),
		h(Comp, {text: 4})
	);

	assert.deepEqual(elem.tree(), {
		name: 'body',
		children: ["1", "2", "3", "4"]
	});
});

test("array clear then partial clear", () => {
	const body = document.createElement('body');

	const arr = OArray([1, 2, 3]);
	mount(body, arr);

	arr.splice(0, arr.length);
	arr.push('1', '2', '3');
	arr.pop();

	assert.deepEqual(body.tree(), {
		name: 'body',
		children: ['1', '2'],
	});
});

test("observer array clear then partial clear", () => {
	const body = document.createElement('body');

	const arr = Observer.mutable([1, 2, 3]);
	mount(body, arr);

	arr.set([]);
	arr.set([1, 2, 3]);
	arr.set([1, 2]);

	assert.deepEqual(body.tree(), {
		name: 'body',
		children: ['1', '2'],
	});
});
