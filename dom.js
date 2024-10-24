import Observer, {observerGetter, shallowListener} from 'destam/Observer.js';
import {Insert, Modify, Delete} from 'destam/Events.js';
import {isInstance, len, push, callAll, assert, noop, isSymbol} from 'destam/util.js';

export const getFirst = Symbol();

const mapNode = elem => {
	let bef;
	return elem[getFirst]?.map(({func_: func, val_: val, handler_: handler, pbef_: pbef}) => {
		return bef = func(val, handler, pbef === 0 ? noop : pbef ? () => pbef : bef);
	});
};

const nodeMounter = (elem, e, before) => {
	assert(e.parentElement == null,
		"Cannot mount a dom node that has already been mounted elsewhere.");

	let remove = mapNode(e);
	if (remove) e = e.elem_;
	elem?.insertBefore(e, before(getFirst));

	return val => {
		if (!e || val === getFirst) return e;

		assert(!elem || e.bulkRemoved || e.parentElement === elem,
			"Refusing to modify node not part of the expected parent");

		if (!val) {
			e.remove();
			if (remove) callAll(remove);
		} else {
			const old = remove;
			remove = mapNode(val);
			if (remove) val = val.elem_;
			e.replaceWith(val);
			if (old) callAll(old);
		}

		return e = val;
	};
};

const primitiveMounter = (elem, e, before) => {
	assert(elem, "Trying to mount a primitive to a null mount.");
	elem.insertBefore(e = document.createTextNode(e), before(getFirst));

	return val => {
		if (!e || val === getFirst) return e;

		assert(e.bulkRemoved || e.parentElement === elem,
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
	if (!list) return;

	if (list === notifyMount) {
		while (list.deferred_) {
			const def = list.deferred_;
			def();
			list.deferred_ = def.deferred_;
		}

		notifyMount = 0;
	}

	for (const c of list) {
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
	if (mounts) for (const arr of mounts.values()) {
		for (const mount of arr) {
			mount.prev_.next_ = mount.next_;
			mount.next_.prev_ = mount.prev_;
			mount();
		}
	}
};

const arrayMounter = (elem, val, before, mounter = mount) => {
	const root = () => before(getFirst);
	root.next_ = root.prev_ = root;

	const linkGetter = Symbol();
	let link, arrayListener;

	const destroy = orphaned => {
		if (!orphaned && elem.firstChild === root.next_(getFirst) && !root()) {
			assert((() => {
				for (const child of elem.childNodes) {
					child.bulkRemoved = true;
				}

				return true;
			})());

			elem.textContent = '';
		}

		for (let cur = root.prev_; cur !== root; cur = cur.prev_) {
			(orphaned ? insertMap : cur)(orphaned, cur);
		}

		if (!orphaned) root.next_ = root.prev_ = root;
	};

	const mountList = (val, orphaned) => {
		const observer = val[observerGetter];

		const addMount = (old, item, next, pending) => {
			let mounted = old?.get(item)?.pop();
			if (mounted === next) return mounted;

			if (!mounted) {
				mounted = mounter(
					elem, item,
					() => (next || mounted.next_)(getFirst)
				);

				mounted.item_ = item;
			} else {
				assert(elem, "Cannot move mount on an empty mount");

				let mountAt, term, cur;
				if ((mountAt = next(getFirst)) !== (term = mounted.next_(getFirst)) &&
						mountAt !== (cur = mounted(getFirst))) {
					const a = document.activeElement;

					while (cur != term) {
						const n = cur.nextSibling;
						elem.insertBefore(cur, mountAt);
						cur = n;
					}

					a?.focus();
				}

				mounted.prev_.next_ = mounted.next_;
				mounted.next_.prev_ = mounted.prev_;
			}

			mounted.prev_ = next.prev_;
			mounted.next_ = next;
			mounted.prev_.next_ = next.prev_ = mounted;
			next = 0;
			return mounted;
		};

		const mountAll = orphaned => {
			link = observer?.linkNext_;
			let mounted = root;

			assert(val[Symbol.iterator],
				"Objects passed to destam-dom must be iterable (like arrays). " +
				"Maybe you passed in a raw object?");

			let not;
			if (!notifyMount) {
				not = notifyMount = [];
			}

			for (const item of val) {
				mounted = addMount(orphaned, item, mounted.next_);
				if (link) {
					link[linkGetter] = mounted;
					link = link.linkNext_;
				}
			}

			callAllSafe(not);
		};

		arrayListener = observer?.register_(commit => {
			assert(elem, "Cannot move mount on an empty mount");

			// fast path when removing everything
			if (len(val) === 0) {
				destroy();
				return;
			}

			// fast path when adding from an empty array
			if (root.next_ === root) {
				mountAll();
			} else {
				let orphaned = null;
				const inserts = [];

				let not;
				if (!notifyMount) {
					not = notifyMount = [];
				}

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
							push(inserts, link);
						}
					}
				}

				for (let insert of inserts) {
					let next = insert.linkNext_[linkGetter] || root;
					for (; insert.reg_ && !insert[linkGetter]; insert = insert.linkPrev_) {
						next = insert[linkGetter] = addMount(orphaned, insert.dom_val_, next);
						delete insert.dom_val_;
					}
				}
				cleanupArrayMounts(orphaned);

				callAllSafe(not);
			}

		}, isSymbol);

		mountAll(orphaned);
	};

	mountList(val);

	return val => {
		if (val === getFirst) return root.next_(getFirst);

		for (link = link?.linkNext_; link?.reg_; link = link.linkNext_) {
			delete link[linkGetter];
		}

		arrayListener?.();

		const orphaned = val && len(val) !== 0 ? new Map() : null;
		destroy(orphaned);
		if (val) mountList(val, orphaned);
		cleanupArrayMounts(orphaned);

		return val;
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

		if (val == null) {
			mounted?.();
			mounted = lastFunc = val;
		} else {
			let func;
			const type = typeof val;
			if (type === 'function') {
				func = val;
			} else if (type !== 'object') {
				func = primitiveMounter;
			} else if (val[getFirst] || isInstance(val, Node)) {
				func = nodeMounter;
			} else {
				func = arrayMounter;
			}

			let not;
			if (!notifyMount) {
				not = notifyMount = [];
			}

			if (!mounted?.(lastFunc === func ? val : null)) {
				mounted = (lastFunc = func)(elem, val, before);
				assert(typeof mounted === 'function',
					"Mount function must return a higher order destroy callback");
			}

			callAllSafe(not);
		}
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
	const remove = val(handler, isSymbol);
	handler();
	return remove;
};
const populateSignals = (signals, val, e, name, set) => {
	if (isInstance(val, Observer)) {
		push(signals, {func_: propertySignal, val_: val.register_, handler_: () => {
			const v = val();
			assert(!isInstance(v, Observer),
				"destam-dom does not support nested observers");
			return set(name, v, e);
		}, pbef_: 0})

		val = val.get;
	} else if (typeof val !== 'object' || Array.isArray(val)) {
		set(name, val, e);
	} else {
		assert(set !== attributeSetter, "Node attribute cannot be an object: " + name);

		for (let o in val) {
			populateSignals(signals, val[o], e[name], o, set);
		}
	}
};

let currentErrorContext;
export const h = (e, props = {}, ...children) => {
	assert(e != null, "Tag name cannot be null or undefined");

	if (!len(children)) {
		assert(!(children in props) ||  props.children === null || Array.isArray(props.children),
			"Children must be null or an array");
		children = props.children || children;
	} else {
		assert(!("children" in props) || (Array.isArray(props.children) && props.children.length === 0),
			"Overwriting children property because element has a body");
	}

	if (typeof e === 'function') {
		props.children = children;

		let errorContext;
		assert(errorContext = {
			prev: currentErrorContext,
			func: e,
			err: new Error(),
		});

		const each = props.each;
		const mounter = (elem, item, before) => {
			let cleanup = null, m = noop;
			const func = arg => {
				if (!m) return;
				if (arg === getFirst) return m(getFirst);

				m();
				callAllSafe(cleanup);
				return m = cleanup = 0;
			};

			const defer = () => {
				if (!m) return;

				assert(m === noop);
				assert(currentErrorContext = errorContext);

				const save = notifyMount;
				notifyMount = 0;

				try {
					if (each) props.each = item;

					const dom = e(props, (...cb) => {
						assert(!cb.find(cb => typeof cb !== 'function'),
							"The cleanup function must be passed a function");

						if (!m) {
							callAllSafe(cb);
						} else {
							cleanup = cleanup?.concat(cb) || cb;
						}
					}, (...cb) => {
						assert(!cb.find(cb => typeof cb !== 'function'),
							"The mount function must be passed a function");
						save.push(...cb);
					});

					if (m) m = mount(elem, dom, before);
				} catch (err) {
					assert(true, (() => {
						let str;

						if (e.name) {
							str = "An error occurred in the " + e.name + " component";
						} else {
							str = "An error occurred in an annonymous component";
						}

						let cur = errorContext;
						while (cur) {
							str += '\n\t' + (cur.func.name || '<annonymous>');

							const s = cur.err.stack.split('\n').slice(1).filter(e => e);
							for (let i = 0; i < s.length; i++) {
								let l = s[i].trim();
								if (l.startsWith('at ')) l = l.substring(3);

								if (l[0].toLowerCase() !== l[0] || i === s.length - 1) {
									str += ': ' + l;
									break;
								}
							}

							cur = cur.prev;
						}

						err = new Error(str, {cause: err});
					})());

					console.error(err);
				}

				notifyMount = save;
				assert((currentErrorContext = errorContext.prev) || true);
			};

			defer.deferred_ = notifyMount.deferred_;
			notifyMount.deferred_ = defer;

			return func;
		};

		if (!each) {
			return mounter;
		} else if (isInstance(each, Observer)) {
			return (elem, val, before) => {
				const listener = shallowListener(each, () => mount(each.get()));
				const mount = arrayMounter(elem, each.get(), before, mounter);
				return arg => {
					if (arg === getFirst) return mount(getFirst);

					listener();
					return mount();
				};
			};
		} else {
			return (elem, val, before) => arrayMounter(elem, each, before, mounter);
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

		if (child[getFirst]) {
			signals.push(...child[getFirst]);
			child = child.elem_;
		} else if (!isInstance(child, Node)) {
			const type = typeof child;
			if (type !== 'object' && type !== 'function') {
				child = document.createTextNode(child);
			} else {
				push(signals, {func_: mount, val_: e, handler_: child, pbef_: bef});
				bef = child = null;
			}
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

	return {[getFirst]: signals, elem_: e};
};
