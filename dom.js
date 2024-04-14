import Observer, {observerGetter, shallowListener} from 'destam/Observer.js';
import {Insert, Modify, Delete} from 'destam/Events.js';
import {isInstance, len, push, callAll, assert, noop} from 'destam/util.js';

const getFirst = {};
const createElement = (type, value) => ({ident_: getFirst, type_: type, val_: value});

const mapNode = aux => {
	let bef;
	return aux.map(([func, val, handler, pbef]) => {
		return bef = func(val, handler, pbef === 0 ? noop : pbef ? () => pbef : bef);
	});
};

const nodeMounter = (elem, e, before, aux) => {
	if (aux) aux = mapNode(aux);

	assert(e.parentElement == null,
		"Cannot mount a dom node that has already been mounted elsewhere.");
	elem?.insertBefore(e, before(getFirst));

	return (val, newAux) => {
		if (!e || val === getFirst) return e;

		if (!val) {
			e.remove();
		} else {
			e.replaceWith(val);
		}

		if (aux) callAll(aux);
		if (val) aux = mapNode(newAux);

		return e = val;
	};
};

const primitiveMounter = (elem, e, before) => {
	e = document.createTextNode(e);

	assert(elem, "Trying to mount a primitive to a null mount.");
	elem.insertBefore(e, before(getFirst));

	return val => {
		if (!e || val === getFirst) return e;

		assert(e.parentElement === elem,
			"Refusing to modify node not part of the expected parent");

		if (val != null) {
			e.textContent = val;
			return 1;
		} else {
			e.remove();
			e = val;
			return 0;
		}
	};
};

let notifyMount;
const callAllSafe = list => {
	if (list === notifyMount) notifyMount = null;
	if (list) for (const c of list) {
		try {
			c();
		} catch (e) {
			console.error(e);
		}
	}
};

const insertMap = (map, item) => {
	let a = map.get(item.item_);
	if (!a) map.set(item.item_, a = []);
	push(a, item);
};

const cleanupArrayMounts = mounts => {
	for (const arr of mounts.values()) {
		for (const mount of arr) {
			mount.prev_.next_ = mount.next_;
			mount.next_.prev_ = mount.prev_;
			mount();
		}
	}
};

const destroyArrayMounts = (root, linkGetter, orphaned) => {
	for (let cur = root.prev_; cur !== root; cur = cur.prev_) {
		(orphaned ? insertMap : cur)(orphaned, cur);
	}

	if (!orphaned) root.next_ = root.prev_ = root;
};

const addArrayMount = (elem, mounter, old, item, next) => {
	let mounted = old?.get(item)?.pop();
	if (mounted === next) return mounted;

	if (!mounted) {
		mounted = mounter(
			elem, item,
			() => (mounted?.next_ || next)(getFirst),
		);

		mounted.item_ = item;
	} else {
		let mountAt, term;
		if (elem && (mountAt = next(getFirst)) !== (term = mounted.next_(getFirst))) {
			const a = document.activeElement;

			for (let cur = mounted(getFirst); cur != term;) {
				const n = cur.nextSibling;
				elem.insertBefore(cur, mountAt);
				cur = n;
			}

			if (a) a.focus();
		}

		mounted.prev_.next_ = mounted.next_;
		mounted.next_.prev_ = mounted.prev_;
	}

	mounted.prev_ = next.prev_;
	mounted.next_ = next;
	mounted.prev_.next_ = next.prev_ = mounted;
	return mounted;
};

const arrayMounter = (elem, val, before, mounter = mount) => {
	const root = () => before(getFirst);
	root.next_ = root.prev_ = root;

	const linkGetter = Symbol();
	let link, arrayListener;

	const mountList = (val, orphaned) => {
		const observer = val[observerGetter];
		const mountAll = orphaned => {
			link = observer?.linkNext_;
			let mounted = root;
			for (const item of val) {
				mounted = addArrayMount(elem, mounter, orphaned, item, mounted.next_);
				if (link) {
					link[linkGetter] = mounted;
					link = link.linkNext_;
				}
			}
		};

		mountAll(orphaned);

		arrayListener = observer && shallowListener(observer, commit => {
			// fast path when removing everything
			if (len(val) === 0) {
				if (elem && elem.firstChild === root.next_(getFirst) && !root()) {
					elem.textContent = '';
				}

				destroyArrayMounts(root, linkGetter);
				return;
			}

			let not;
			if (!notifyMount) {
				not = notifyMount = [];
			}

			// fast path when adding from an empty array
			if (root.next_ === root) {
				mountAll();
			} else {
				let orphaned = null;
				const inserts = [];

				for (const delta of commit) {
					const isModify = isInstance(delta, Modify);
					const link = delta.network_.link_;

					if (isModify || isInstance(delta, Delete)) {
						insertMap(orphaned || (orphaned = new Map()), link[linkGetter]);
						delete link[linkGetter];
					}

					if (isModify || isInstance(delta, Insert)) {
						link.dom_val_ = delta.value;
						const next = link.linkNext_;

						if (next[linkGetter] || !next.reg_) {
							inserts.push(link);
						}
					}
				}

				for (let insert of inserts) {
					let next = insert.linkNext_[linkGetter] || root;
					for (; insert.reg_ && !insert[linkGetter]; insert = insert.linkPrev_) {
						next = insert[linkGetter] = addArrayMount(elem, mounter, orphaned, insert.dom_val_, next);
						delete insert.dom_val_;
					}
				}

				if (orphaned) cleanupArrayMounts(orphaned);
			}

			callAllSafe(not);
		});
	};

	mountList(val);

	return val => {
		if (val === getFirst) return root.next_(getFirst);

		for (link = link?.linkNext_; link?.reg_; link = link.linkNext_) {
			delete link[linkGetter];
		}

		arrayListener?.();

		const orphaned = val && new Map();
		destroyArrayMounts(root, linkGetter, orphaned);
		if (orphaned) {
			mountList(val, orphaned);
			cleanupArrayMounts(orphaned);
		}

		return val;
	};
};

const customMounter = (elem, func, before, aux) => {
	let dom = null, cleanup = 0;

	try {
		dom = func(aux || {}, cb => {
			assert(typeof cb === 'function', "The cleanup function must be passed a function");
			push(cleanup || (cleanup = []), cb);
		}, cb => {
			assert(typeof cb === 'function', "The mount function must be passed a function");
			push(notifyMount, cb);
		});
	} catch (e) {
		console.error(e);
	}

	const m = mount(
		elem,
		dom,
		before,
	);

	return arg => {
		const ret = m(arg);
		if (arg !== getFirst) {
			callAllSafe(cleanup);
			cleanup = 0;
		}
		return ret;
	};
};

export const mount = (elem, item, before = noop) => {
	assert(elem === null || isInstance(elem, Node),
		"The first argument to mount must be null or an dom node");

	let lastFunc, mounted = null;
	const update = () => {
		if (mode === 2) return;

		let val = mode ? item.get() : item;
		assert(val !== undefined, "Cannot mount undefined");
		assert(!isInstance(val, Observer),
			"destam-dom does not support nested observers");

		let func, aux;
		if (val !== null) {
			if (val.ident_ === getFirst) {
				aux = val.val_;
				val = val.type_;
			}

			const type = typeof val;
			if (type === 'function') {
				func = customMounter;
			} else if (type !== 'object') {
				func = primitiveMounter;
			} else if (isInstance(val, Node)) {
				func = nodeMounter;
			} else {
				func = arrayMounter;
			}
		}

		let not;
		if (!notifyMount) {
			not = notifyMount = [];
		}

		if (!mounted?.(lastFunc === func ? val : null, aux)) {
			mounted = (lastFunc = func)?.(elem, val, before, aux);
		}

		callAllSafe(not);
	};

	let mode = isInstance(item, Observer);
	if (mode) {
		const watcher = shallowListener(item, update);
		update();

		return arg => {
			if (arg === getFirst) return (mounted || before)(getFirst);

			watcher();
			mode = 2;
			return mounted?.();
		};
	} else {
		update();
		return mounted || before;
	}
};

const propertySetter = (name, val, e) => e[name] = val ?? null;
const attributeSetter = (name, val, e) => {
	val = val ?? false;
	assert(['boolean', 'string', 'number'].includes(typeof val),
		`type ${typeof val} is used as the attribute: ${name}`);

	if (typeof val === 'boolean') {
		e.toggleAttribute(name, val);
	} else {
		e.setAttribute(name, val);
	}
};

const propertySignal = (val, handler) => {
	const remove = shallowListener(val, handler);
	handler();
	return remove;
};
const populateSignals = (signals, val, e, name, set) => {
	if (isInstance(val, Observer)) {
		push(signals, [propertySignal, val, () => {
			const v = val.get();
			assert(!isInstance(v, Observer),
				"destam-dom does not support nested observers");
			return set(name, v, e);
		}, 0]);
	} else if (typeof val !== 'object') {
		set(name, val, e);
	} else {
		for (let o in val) {
			const def = val[o];
			populateSignals(signals, val[o], e[name], o, set);
		}
	}
};

export const h = (e, props = {}, ...children) => {
	assert(e != null, "Tag name cannot be null or undefined");

	if (!len(children)) {
		assert(props.children == null || props.children.constructor === Array,
			"Children must be null or an array");
		children = props.children || children;
	} else {
		assert(!("children" in props), "Overwriting children property because element has a body");
	}

	if (typeof e === 'function') {
		if (len(children)) {
			props.children = children;
		}

		const each = props.each;
		if (!each) {
			return createElement(e, props);
		}

		const createMap = arr => createElement(
			arr,
			(elem, item, before) => {
				props.each = item;
				return customMounter(elem, e, before, props);
			},
		);

		if (isInstance(each, Observer)) {
			return each.map(createMap);
		} else {
			return createMap(each);
		}
	}

	delete props.children;

	if (!isInstance(e, Node)) {
		assert(typeof e === 'string', "Unsupported node: " + typeof e);
		e = document.createElement(e);
	}

	const signals = [];

	let bef = 0, insertLoc = null;
	for (let i = len(children); i > 0; i--) {
		let child = children[i - 1];

		assert(child !== undefined, "Cannot mount undefined");
		if (child == null) continue;

		const type = child.ident_ === getFirst ? child.type_ : child;
		if (!isInstance(type, Node)) {
			const type = typeof child;
			if (type !== 'object' && type !== 'function') {
				child = document.createTextNode(child);
			} else {
				push(signals, [mount, e, child, bef]);
				bef = child = null;
			}
		} else if (type !== child) {
			signals.push(...child.val_);
			child = type;
		}

		if (child) {
			if (!child.parentElement) e.insertBefore(child, insertLoc);
			bef = insertLoc = child;
		}
	}

	for (let o in props) {
		const def = props[o];

		let set;
		if (o[0] === '$') {
			o = o.substring(1);

			set = propertySetter;
		} else  {
			set = attributeSetter;
		}

		populateSignals(signals, def, e, o, set);
	}

	if (!len(signals)) {
		return e;
	}

	return createElement(e, signals);
};
