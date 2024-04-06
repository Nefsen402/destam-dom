import Observer, {observerGetter, shallowListener} from 'destam/Observer.js';
import {Insert, Modify, Delete} from 'destam/Events.js';
import {isInstance, len, push, callAll, assert, noop} from 'destam/util.js';

const elementIdentifier = Symbol();
const createElement = (type, value) => ({ident_: elementIdentifier, type_: type, val_: value});

const assignFirst = (remove, first) => {
	remove.first_ = first;
	return remove;
};

const nodeMounter = (elem, e, before, aux) => {
	let bef;
	aux = aux?.map(([func, val, handler, pbef]) => {
		const listener = func(val, handler, pbef === 0 ? noop : pbef ? () => pbef : bef);
		if (func !== mount) {
			handler();
		} else {
			bef = listener.first_;
		}
		return listener;
	});

	assert(e.parentElement == null,
		"Cannot mount a dom node that has already been mounted elsewhere.");
	elem?.insertBefore(e, before());

	return assignFirst(val => {
		if (!e) return val;
		assert(elem && e.parentElement === elem,
			"Refusing to modify node not part of the expected parent");

		if (!val) {
			e.remove();
			if (aux) callAll(aux);
		} else {
			e.replaceWith(val);
		}

		return e = val;
	}, () => e);
};

const primitiveMounter = (elem, e, before) => {
	e = document.createTextNode(e);

	assert(elem, "Trying to mount a primitive to a null mount.");
	elem.insertBefore(e, before());

	return assignFirst(val => {
		const isReplacement = val != null;
		if (e) {
			assert(e.parentElement === elem,
				"Refusing to modify node not part of the expected parent");

			if (isReplacement) {
				e.textContent = val;
			} else {
				e.remove();
				e = val;
			}
		}

		return isReplacement;
	}, () => e);
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
			() => (mounted?.next_ || next).first_(),
		);

		mounted.item_ = item;
	} else {
		let mountAt, term;
		if (elem && (mountAt = next.first_()) !== (term = mounted.next_.first_())) {
			const a = document.activeElement;

			for (let cur = mounted.first_(); cur != term;) {
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
	const root = {first_: before};
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

	return assignFirst(val => {
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
	}, () => root.next_.first_());
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

	return assignFirst(() => {
		m();
		callAllSafe(cleanup);
	}, m.first_);
};

export const mount = (elem, item, before = noop) => {
	assert(elem === null || isInstance(elem, Node),
		"The first argument to mount must be null or an dom node");

	let lastFunc, mounted = null;
	const update = () => {
		let val = isObserver ? item.get() : item;
		assert(val !== undefined, "Cannot mount undefined");
		assert(!isInstance(val, Observer),
			"destam-dom does not support nested observers");

		let func, aux;
		if (val !== null) {
			if (val.ident_ === elementIdentifier) {
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

		if (!mounted?.(lastFunc === func ? val : null)) {
			mounted = (lastFunc = func)?.(elem, val, before, aux);
		}

		callAllSafe(not);
	};

	const isObserver = isInstance(item, Observer);
	if (isObserver) {
		const watcher = shallowListener(item, update);
		update();

		return assignFirst(() => {
			watcher();
			mounted?.();
		}, () => (mounted?.first_ || before)());
	} else {
		update();
		return mounted || assignFirst(() => {}, before);
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

const populateSignals = (signals, val, e, name, set) => {
	if (isInstance(val, Observer)) {
		push(signals, [shallowListener, val, () => {
			const v = val.get();
			assert(!isInstance(v, Observer),
				"destam-dom does not support nested observers");
			set(name, v, e)
		}]);
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

	if (len(children)) {
		assert(!("children" in props), "Overwriting children property because element has a body");
		props.children = children;
	} else {
		assert(props.children == null || props.children.constructor === Array,
			"Children must be null or an array");
	}

	if (typeof e === 'function') {
		const each = props.each;

		if (!each) {
			return createElement(e, props);
		} else {
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
	} else {
		if (!isInstance(e, Node)) {
			assert(typeof e === 'string', "Unsupported node: " + typeof e);
			e = document.createElement(e);
		}

		children = [];
		for (let o in props) {
			const def = props[o];

			if (o === 'children') {
				let bef = 0, insertLoc = null;
				if (def) for (let i = len(def); i > 0; i--) {
					let child = def[i - 1];

					assert(child !== undefined, "Cannot mount undefined");
					if (child == null) continue;

					const type = child.ident_ === elementIdentifier ? child.type_ : child;
					if (!isInstance(type, Node)) {
						const type = typeof child;
						if (type !== 'object' && type !== 'function') {
							child = document.createTextNode(child);
						} else {
							push(children, [mount, e, child, bef]);
							bef = child = null;
						}
					} else if (type !== child) {
						children.unshift(...child.val_);
						child = type;
					}

					if (child) {
						if (!child.parentElement) e.insertBefore(child, insertLoc);
						bef = insertLoc = child;
					}
				}

				continue;
			}

			let set;
			if (o[0] === '$') {
				o = o.substring(1);

				set = propertySetter;
			} else  {
				set = attributeSetter;
			}

			populateSignals(children, def, e, o, set);
		}

		return createElement(e, children);
	}
};
