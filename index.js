export * from 'destam/Events.js';
export {default as Observer} from 'destam/Observer.js';
export {default as OObject} from 'destam/Object.js';
export {default as OArray} from './Array.js';

export * from './dom.js';

import {h} from './dom.js';
import htm from './htm.js';
export const html = htm(h);
