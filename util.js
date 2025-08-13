import Observer, {shallowListener} from 'destam/Observer.js';
import {isInstance, noop} from 'destam/util.js';
export { mount, getFirst, cleared } from './dom.js';

export const createElement = (elem, ns) => {
	if (ns) {
		return document.createElementNS(ns, elem);
	} else {
		return document.createElement(elem);
	}
};

export const createTextNode = text => document.createTextNode(text);

const update = (cb, obs) => {
	cb(obs.get());
};

export const watch = (obs, cb) => {
	if (isInstance(obs, Observer)) {
		const l = shallowListener(obs, update.bind(null, cb, obs));
		update(cb, obs);
		return l;
	} else {
		cb(obs);
		return noop;
	}
};

export const setAttribute = (e, name, val) => {
	if (val == null) val = false;
	if (typeof val === 'boolean') {
		e.toggleAttribute(name, val);
	} else {
		e.setAttribute(name, val);
	}
};
