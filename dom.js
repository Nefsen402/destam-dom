import Observer, {observerGetter, shallowListener} from 'destam/Observer.js';
import {Insert, Modify, Delete} from 'destam/Events.js';
import {isInstance, len, push, callAll, assert, noop} from 'destam/util.js';

const assignFirst = (remove, first) => {
	remove.first_ = first;
	return remove;
};

const nodeMounter = (elem, e, before) => {
	if (!isInstance(e, Node)) {
		e = document.createTextNode(e);
	}

	let remove = null;
	if (e[mounterGetter]) {
		const [signals, children] = e[mounterGetter];

		remove = signals.map(([val, handler]) => {
			const listener = shallowListener(val, handler);
			handler();
			return listener;
		});

		let bef;
		for (let [el, child, pbef] of children) {
			const m = mount(el, child, pbef || bef);
			bef = m.first_;
			push(remove, m);
		}
	}

	elem?.insertBefore(e, before());

	return assignFirst(val => {
		if (val == null) {
			assert(e.parentElement === elem, "Trying to remove a dom node that has an unexpected parent");
			e?.remove();
			if (remove) callAll(remove);
			e = remove = val;
		} else if (isInstance(val, Node)) {
			elem?.replaceChild(val, e);
			e = val;
		} else {
			e.textContent = val;
		}

		return val;
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

const destroyArrayMounts = (link, root, linkGetter, orphaned) => {
	for (link = link?.linkNext_; link?.reg_; link = link.linkNext_) {
		delete link[linkGetter];
	}

	for (let cur = root.prev_; cur !== root; cur = cur.prev_) {
		(orphaned ? insertMap : cur)(orphaned, cur);
	}

	if (!orphaned) root.next_ = root.prev_ = root;
};

const addArrayMount = (elem, map, old, item, next) => {
	let mounted = old?.get(item)?.pop();
	if (mounted === next) return mounted;

	if (!mounted) {
		let not;
		if (!notifyMount) {
			not = notifyMount = [];
		}

		mounted = mount(
			elem, map(item),
			() => (mounted?.next_ || next).first_(),
		);

		callAllSafe(not);
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

const identity = x => x;

const mounterGetter = Symbol();
const arrayMounter = (elem, val, before) => {
	const root = {first_: before};
	root.next_ = root.prev_ = root;

	const linkGetter = Symbol();
	let link, arrayListener;

	const mountList = (val, orphaned) => {
		const map = val[mounterGetter] || identity;
		if (map !== identity) {
			val = val.arr_;
		}

		const observer = val[observerGetter];
		const mountAll = orphaned => {
			link = observer?.linkNext_;
			let mounted = root;
			for (const item of val) {
				mounted = addArrayMount(elem, map, orphaned, item, mounted.next_);
				if (link) {
					link[linkGetter] = mounted;
					link = link.linkNext_;
				}
			}
		};

		mountAll(orphaned);

		arrayListener?.();
		arrayListener = observer && shallowListener(observer, commit => {
			// fast path when removing everything
			if (len(val) === 0) {
				destroyArrayMounts(link, root, linkGetter);
				return;
			}

			// fast path when adding from an empty array
			if (root.next_ === root) {
				mountAll();
				return;
			}

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
					next = insert[linkGetter] = addArrayMount(elem, map, orphaned, insert.dom_val_, next);
					delete insert.dom_val_;
				}
			}

			if (orphaned) cleanupArrayMounts(orphaned);
		});
	};

	mountList(val);

	return assignFirst(val => {
		if (val) {
			const orphaned = new Map();
			destroyArrayMounts(link, root, linkGetter, orphaned);
			mountList(val, orphaned);
			cleanupArrayMounts(orphaned);
		} else {
			arrayListener?.();
			destroyArrayMounts(link, root, linkGetter);
		}

		return val;
	}, () => root.next_.first_());
};

const customMounter = (elem, func, before) => {
	let dom = null, cleanup = 0;

	try {
		dom = func(func[mounterGetter] || {}, cb => {
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
	let lastFunc, mounted = null;
	const update = () => {
		const val = isObserver ? item.get() : item;
		assert(val !== undefined, "Cannot mount undefined");

		let type = typeof val;
		let func;
		if (val == null) {
			// fallthrough
		} else if (type === 'function') {
			func = customMounter;
		} else if (isInstance(val, Node) || type !== 'object') {
			func = nodeMounter;
		} else {
			func = arrayMounter;
		}

		let not;
		if (!notifyMount) {
			not = notifyMount = [];
		}

		if (!mounted?.(lastFunc === func ? val : null)) {
			mounted = (lastFunc = func)?.(elem, val, before);
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
			mounted = null;
		}, () => (mounted?.first_ || before)());
	} else {
		update();
		return mounted || assignFirst(() => {}, before);
	}
};

const forEachProp = (p, e, opt) => {
	for (let o in p) {
		e(o, p[o], opt);
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

		let item;
		const func = (props, cleanup, mounted) => {
			if (item) props.each = item;
			return e(props, cleanup, mounted);
		};
		func[mounterGetter] = props;

		if (!each) {
			return func;
		} else {
			const createMap = arr => ({
				arr_: arr,
				[mounterGetter]: item_ => {
					item = item_
					return func;
				},
			});

			if (isInstance(each, Observer)) {
				return each.map(createMap);
			} else {
				return createMap(each);
			}
		}
	} else {
		assert(isInstance(e, Node) || typeof e === 'string',
			"Unsupported node type: " + typeof e);

		if (!isInstance(e, Node)) {
			e = document.createElement(e);
		}

		const signals = [];
		let bef = noop, insertLoc = null;

		children = [];
		props.children?.findLast(child => {
			assert(child !== undefined, "Cannot mount undefined");
			if (child == null) return;

			if (!isInstance(child, Node)) {
				const type = typeof child;
				if (type !== 'object' && type !== 'function') {
					child = document.createTextNode(child);
				} else {
					push(children, [e, child, bef]);
					bef = child = 0;
				}
			} else if (child[mounterGetter]) {
				const [sigs, c] = child[mounterGetter];
				signals.push(...sigs);
				children.unshift(...c);
			}

			if (child) {
				if (!child.parentElement) e.insertBefore(child, insertLoc);
				bef = () => child;
				insertLoc = child;
			}
		});
		delete props.children;

		forEachProp(props, (name, val) => {
			let set;
			if (name[0] === '$') {
				name = name.substring(1);

				set = (name, val, e) => e[name] = val ?? null;
			} else {
				set = (name, val, e) => {
					val = val ?? false;
					assert(['boolean', 'string', 'number'].includes(typeof val),
						`type ${typeof val} is used as the attribute: ${name}`);

					if (typeof val === 'boolean') {
						e.toggleAttribute(name, val);
					} else {
						e.setAttribute(name, val);
					}
				};
			}

			const search = (name, val, e) => {
				if (isInstance(val, Observer)) {
					push(signals, [val, () => set(name, val.get(), e)]);
				} else if (typeof val === 'object') {
					forEachProp(val, search, e[name]);
				} else {
					set(name, val, e);
				}
			};

			search(name, val, e);
		});

		e[mounterGetter] = [signals, children];
		return e;
	}
};
