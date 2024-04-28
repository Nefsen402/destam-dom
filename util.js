import Observer, {shallowListener} from 'destam/Observer.js';
import {isInstance, noop} from 'destam/util.js';
export { mount, getFirst } from './dom.js';

const doc = document;
export const createElement = doc.createElement.bind(doc);
export const createTextNode = doc.createTextNode.bind(doc);

export const watch = (obs, cb) => {
	if (isInstance(obs, Observer)) {
		const l = shallowListener(obs, () => cb(obs.get()));
		cb(obs.get());
		return l;
	} else {
		cb(obs);
		return noop;
	}
};
