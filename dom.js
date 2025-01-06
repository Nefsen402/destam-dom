import Observer, {observerGetter, shallowListener} from 'destam/Observer.js';
import {Insert, Modify, Delete} from 'destam/Events.js';
import {isInstance, len, push, callAll, assert, noop, isSymbol} from 'destam/util.js';

export const getFirst = Symbol();

const nodeRegister = (elem, context) => {
	const arr = elem[getFirst];
	if (arr) {
		let bef;
		for (let obj of arr) {
			bef = obj.func_(bef, context);
		}
	}

	return arr;
};

const nodeRemove = (arr) => {
	for (let obj of arr) {
		obj.remove_();
		obj.remove_ = 0;
	}
};

const nodeMounter = (elem, e, before, context) => {
	assert((e[getFirst] ? e.elem_ : e).parentElement == null,
		"Cannot mount a dom node that has already been mounted elsewhere.");

	let remove = nodeRegister(e, context);
	if (remove) e = e.elem_;
	elem.insertBefore(e, before(getFirst));

	return val => {
		if (!e || val === getFirst) return e;

		if (!val) {
			elem.removeChild(e);
			if (remove) nodeRemove(remove);
		} else {
			const old = remove;
			remove = nodeRegister(val, context);
			if (remove) val = val.elem_;
			elem.replaceChild(val, e);
			if (old) nodeRemove(old);
		}

		return e = val;
	};
};

const primitiveMounter = (elem, e, before) => {
	elem.insertBefore(e = document.createTextNode(e), before(getFirst));

	return val => {
		if (!e || val === getFirst) return e;

		if (val != null) {
			e.textContent = val;
			return 1;
		} else {
			elem.removeChild(e);
			e = val;
			return 0;
		}
	};
};

let deferred;
const callLinked = list => {
	let callable;
	while (callable = list.next_) {
		list.next_ = callable.next_;
		try {
			callable();
		} catch (e) {
			console.error(e);
		}
	}

	if (list === deferred) deferred = 0;
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

const arrayMounterElem = {
	removeChild (child) {
		if (!this.remove_) this.parent_.removeChild(child);
	},
	replaceChild (newNode, oldNode) {
		this.parent_.replaceChild(newNode, oldNode);
	},
	insertBefore (newNode, before) {
		this.parent_.insertBefore(newNode, before);
	},
	set textContent (content) {
		this.parent_.textContent = content;
	},
	get firstChild () {
		return this.parent_.firstChild;
	},
};

const arrayMounter = (elem, val, before, context, mounter = mount) => {
	const root = () => before(getFirst);
	root.next_ = root.prev_ = root;

	const linkGetter = Symbol();
	let link, arrayListener;

	const mountElem = Object.create(arrayMounterElem);
	mountElem.parent_ = elem;

	const destroy = orphaned => {
		if (!orphaned && elem.firstChild === root.next_(getFirst) && !root()) {
			elem.textContent = '';
			mountElem.remove_ = 1;
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
					mountElem,
					item,
					() => (next || mounted.next_)(getFirst),
					context,
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
			if (!deferred) {
				not = deferred = {};
			}

			try {
				mountElem.remove_ = 0;
				for (const item of val) {
					mounted = addMount(orphaned, item, mounted.next_);
					if (link) {
						link[linkGetter] = mounted;
						link = link.linkNext_;
					}
				}
			} finally {
				if (not) callLinked(not);
			}
		};

		arrayListener = observer?.register_(commit => {
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
				if (!deferred) {
					not = deferred = {};
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

				try {
					for (let insert of inserts) {
						let next = insert.linkNext_[linkGetter] || root;
						for (; insert.reg_ && !insert[linkGetter]; insert = insert.linkPrev_) {
							next = insert[linkGetter] = addMount(orphaned, insert.dom_val_, next);
							delete insert.dom_val_;
						}
					}
				} finally {
					cleanupArrayMounts(orphaned);
					if (not) callLinked(not);
				}
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

export const mount = (elem, item, before = noop, context) => {
	assert(elem.insertBefore && elem.replaceChild && elem.removeChild,
		"The first argument to mount must be a ducked type node");

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
			if (!deferred) {
				not = deferred = {};
			}

			try {
				if (!mounted?.(lastFunc === func ? val : null)) {
					mounted = (lastFunc = func)(elem, val, before, context);
					assert(typeof mounted === 'function',
						"Mount function must return a higher order destroy callback");
				}
			} finally {
				if (not) callLinked(not);
			}
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

const registerSetter = (set) => {
	const handler = (self) => {
		const v = self.handler_.get();
		assert(!isInstance(v, Observer),
			"destam-dom does not support nested observers");
		set(v, self.name_, self.val_);
	};

	set.dyn_ = function () {
		this.remove_ = this.handler_.register_(handler.bind(null, this), isSymbol);
		handler(this);
	};
	return set;
};

const propertySetter = registerSetter((val, name, e) => e[name] = val ?? null);
const attributeSetter = registerSetter((val, name, e) => {
	val = val ?? false;
	assert(['boolean', 'string', 'number'].includes(typeof val),
		`type ${typeof val} is used as the attribute: ${name}`);

	if (typeof val === 'boolean') {
		e.toggleAttribute(name, val);
	} else {
		e.setAttribute(name, val);
	}
});

const populateSignals = (signals, val, e, name, set) => {
	if (isInstance(val, Observer)) {
		push(signals, {func_: set.dyn_, val_: e, handler_: val, pbef_: 0, name_: name, remove_: 0});
	} else if (typeof val !== 'object' || Array.isArray(val)) {
		set(val, name, e);
	} else {
		assert(set !== attributeSetter, "Node attribute cannot be an object: " + name);

		for (let o in val) {
			populateSignals(signals, val[o], e[name], o, set);
		}
	}
};

const signalMount = function (bef, context) {
	const pbef = this.pbef_;
	return this.remove_ = mount(this.val_, this.handler_, pbef === 0 ? noop : pbef ? () => pbef : bef, context);
};

const populate = (arr, ...cb) => {
	assert(!cb.find(cb => typeof cb !== 'function'),
		"When calling either cleanup/mounted all passed parameters must be functions");

	for (const c of cb) {
		if (arr.done_) {
			c();
		} else {
			c.next_ = arr.next_;
			arr.next_ = c;
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
		const mounter = (elem, item, before, context) => {
			let cleanup = {}, m = noop;

			const defer = () => {
				if (!m) return;

				assert(m === noop);
				assert(currentErrorContext = errorContext);

				try {
					if (each) props.each = item;

					const mounted = {};

					const dom = e(
						props,
						populate.bind(null, cleanup),
						populate.bind(null, mounted));
					if (m) {
						m = mount(elem, dom, before, context);
						callLinked(mounted);
					}
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

								if (i === s.length - 1) {
									str += ': ' + l;
									break;
								} else if (l.startsWith('(')) {
									const path = l.substring(1, l.indexOf(')'));
									const name = path.substring(path.lastIndexOf('/') + 1);

									if (name[0].toLowerCase() !== name[0]) {
										str += ': ' + path;
										break;
									}
								} else if (l[0].toLowerCase() !== l[0]) {
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

				assert((currentErrorContext = errorContext.prev) || true);
			};

			defer.next_ = deferred.next_;
			deferred.next_ = defer;

			return arg => {
				if (!m) return 0;
				if (arg === getFirst) return (m === noop ? before : m)(getFirst);

				m();
				callLinked(cleanup);
				cleanup.done_ = 1;
				return m = 0;
			};
		};

		if (!each) {
			return mounter;
		} else if (isInstance(each, Observer)) {
			return (elem, val, before, context) => {
				const listener = shallowListener(each, () => mount(each.get()));
				const mount = arrayMounter(elem, each.get(), before, context, mounter);
				return arg => {
					if (arg === getFirst) return mount(getFirst);

					listener();
					return mount();
				};
			};
		} else {
			return (elem, val, before, context) => arrayMounter(elem, each, before, context, mounter);
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
				push(signals, {func_: signalMount, val_: e, handler_: child, pbef_: bef, name_: 0, remove_: 0});
				bef = child = null;
			}
		}

		if (child) {
			e.insertBefore(child, insertLoc);
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
