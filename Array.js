import {Insert, Modify, Delete} from 'destam/Events.js';
import {observerGetter} from 'destam/Observer.js';
import {isEqual, len, createProxy, push, createClass, assert} from 'destam/util.js';
import * as Network from 'destam/Network.js';

const splice = (reg, start, count, arr) => {
	const init = reg.init_;
	const indexes = reg.indexes_;
	const addCount = len(arr);
	const events = [];

	start = start ?? 0;
	count = Math.min(count ?? len(init), len(init) - start);

	assert(!isNaN(start) && !isNaN(count), 'expected integers');
	assert(start >= 0 && start <= len(init), 'start out of bounds: ' + start);

	for (let i = 0; i < Math.min(count, addCount); i++){
		const old = init[start + i];
		const value = arr[i];
		const link = indexes[i + start];

		if (!isEqual(old, value)) {
			Network.relink(link, value?.[observerGetter]);
			Network.linkApply(link, events, Modify, old, value);
		}
	}

	const insertCount = addCount - count;
	if (insertCount < 0) {
		for (let i = addCount; i < count; i++) {
			const link = indexes[start + i];

			Network.unlink(link);
			Network.linkApply(link, events, Delete, init[start + i]);
		}

		indexes.splice(start, -insertCount);
	} else if (insertCount) {
		const links = [];

		let insert = indexes[start + count];
		for (let i = count; i < addCount; i++) {
			const value = arr[i];
			const link = Network.link({reg_: reg}, value?.[observerGetter], insert);

			Network.linkApply(link, events, Insert, undefined, value);
			links[i - count] = link;
		}

		indexes.splice(start, 0, ...links);
	}

	const ret = init.splice(start, count, ...arr);
	Network.callListeners(events);
	return ret;
};

const OArray = createClass(init => {
	const indexes = [];
	const reg = Network.createReg(OArray);

	if (init) {
		for (let i = 0; i < len(init); i++) {
			push(indexes, Network.link({reg_: reg}, init[i]?.[observerGetter]));
		}
	} else {
		init = [];
	}

	reg.init_ = init;
	reg.indexes_ = indexes;

	return createProxy(init, reg, {
		splice: (start, len, ...val) => splice(reg, start, len, val),
		push: (...values) => splice(reg, len(init), 0, values),
		unshift: val => splice(reg, 0, 0, [val]),
		shift: () => splice(reg, 0, 1, [])[0],
		pop: () => splice(reg, len(init) - 1, 1, [])[0],
		fill: val => splice(reg, 0, len(init), Array(len(init)).fill(val)),
		sort: undefined,
		reverse: undefined,
	}, (obj, prop, value) => {
		/* node:coverage disable */
		assert((() => {
			for (let i = 0; i < prop.length; i++){
				const code = prop.charCodeAt(i);

				if (code < 48 || code > 57){
					return false;
				}
			}
			return true;
		})(), "invalid array property: " + prop);
		/* node:coverage enable */

		const num = parseInt(prop);
		const old = init[num];
		if (!isEqual(old, value)){
			const link = indexes[num];
			assert(link, "Array write outside of bounds!");

			let events;
			Network.linkApply(link, events = [], Modify, old, value);

			Network.relink(link, value?.[observerGetter]);
			init[num] = value;
			Network.callListeners(events);
		}

		return true;
	}, Array, OArray);
});

export default OArray;
