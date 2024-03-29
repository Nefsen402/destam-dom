import {push, len, assert, isInstance} from 'destam/util.js';
import Observer from 'destam/Observer.js';

export const validTags = ['BASE', 'LINK', 'META', 'STYLE', 'TITLE', 'ADDRESS', 'ARTICLE',
	'ASIDE', 'FOOTER', 'HEADER', 'H1', 'H2', 'H3', 'HGROUP', 'MAIN',
	'NAV', 'SECTION', 'SEARCH', 'BLOCKQUOTE', 'DD', 'DIV', 'DL', 'DT',
	'FIGCAPTION', 'FIGURE', 'HR', 'LI', 'OL', 'P', 'PRE', 'UL', 'A',
	'ABBR', 'B', 'BDI', 'BDO', 'BR', 'CITE', 'CODE', 'DATA', 'DFN',
	'EM', 'I', 'KBD', 'MARK', 'Q', 'RP', 'RT', 'RUBY', 'S', 'SAMP',
	'SMALL', 'SPAN', 'STRONG', 'SUB', 'SUP', 'TIME', 'U', 'VAR',
	'WBR', 'AREA', 'AUDIO', 'IMG', 'MAP', 'TRACK', 'VIDEO', 'EMBED',
	'IFRAME', 'OBJECT', 'PICTURE', 'PORTAL', 'SOURCE', 'SVG', 'MATH',
	'CANVAS', 'NOSCRIPT', 'DEL', 'INS', 'CAPTION', 'COL', 'COLGROUP',
	'TABLE', 'TBODY', 'TD', 'TFOOT', 'TH', 'THEAD', 'TR', 'BUTTON',
	'DATALIST', 'FIELDSET', 'FORM', 'INPUT', 'LABEL', 'LEGEND', 'METER',
	'OPTGROUP', 'OPTION', 'OUTPUT', 'PROGRESS', 'SELECT', 'TEXTAREA',
	'DETAILS', 'DIALOG', 'SUMMARY', 'SLOT', 'TEMPLATE'];

export default (h, assign = Object.assign, concatinator = strings => {
	if (len(strings) === 1) {
		return strings[0]
	} else {
		return Observer.all(strings.map(Observer.immutable)).map(s => s.join(''))
	}
}) => (segments, ...args) => {
	const special = {'<': {}, '>': {}, '=': {}, '/': {}};
	const tokens = [];
	let tag = 1, inString, cur = '';

	for (let i = 0; i < len(segments); i++) {
		const str = segments[i];
		let parsingWhitespace;

		const flush = () => {
			if (tag) {
				if ((tag & 2) && !(tag & 4)) cur += ' ';
				tag = 9;
			}

			if (cur) push(inString || tokens, cur);
			cur = '';
		};

		// when scanning the string, extract special characters and simplify whitespace
		for (let ii = 0; ii < len(str); ii++) {
			if (str.startsWith('<!--', ii)) {
				const iii = str.indexOf('-->', ii);
				assert(iii !== -1, "Comment does not terminate");

				ii = iii + 2;
				continue;
			}

			const char = str[ii];
			if (inString) {
				if (char == inString.char) {
					flush();
					push(tokens, concatinator(inString));
					inString = 0;
				} else {
					cur += char;
				}
				continue;
			}

			const whitespace = "\n\r\t ".indexOf(char);

			if (char === '<') {
				flush();
				tag = 0;
			}

			if (!tag) {
				if (whitespace >= 0) {
					flush();
				} else if (special[char]) {
					flush();
					if (char === '>') tag = 9;
					push(tokens, special[char]);
				} else if (char === '"' || char === "'") {
					flush();
					inString = [];
					inString.char = char;
				} else {
					cur += char;
				}

				continue;
			}

			if (whitespace >= 0) {
				tag |= whitespace == 0 ? 4 : 2;
			} else {
				if ((tag & 6) && (tag & 12) != 12) cur += ' ';
				tag = 1;

				cur += char;
			}
		}

		if (i < len(args)) {
			flush();
			push(inString || tokens, args[i]);
		}
	}

	if (cur) push(tokens, cur);

	let i = 0;
	const parse = (tagName) => {
		let tags = [], term = 0;

		for (; !term && i < len(tokens);) {
			if (tokens[i] !== special['<']) {
				push(tags, tokens[i++]);
				continue;
			}

			let name = tokens[++i];
			assert(name !== special['>'], "Empty tag");

			if (name === special['/']) {
				name = 0;
			} else {
				assert(!Object.values(special).includes(name), "Unexpected special char near tag opening");
				i++;
			}

			const props = {};
			let prevTag;
			for (; tokens[i] !== special['>']; i++) {
				assert(i < len(tokens), "Unexpected end of input");

				let token = tokens[i];
				if (token === special['/']) {
					assert(tokens[i + 1] === special['>'] || tokens[i + 2] === special['>'], "Tag not terminated properly");

					term = tokens[i + 1];
				} else if (token === special['=']) {
					token = tokens[++i];
					if (prevTag) {
						assert(!Object.values(special).includes(token), "Unexpected special char near attribute value");
						props[prevTag] = token;
						prevTag = 0;
					} else {
						assign(props, token);
					}
				} else {
					assert(!Object.values(special).includes(token), "Unexpected special char near attribute name");
					props[prevTag = token] = true;
				}
			}

			i++;

			if (name) {
				assert((() => {
					const strHasOnly = (chars, str) => {
						for (let ii = 0; ii < len(str); ii++) {
							if (chars.indexOf(str.charAt(ii)) == -1) {
								return 0;
							}
						}
						return 1;
					};

					for (const prop in props) {
						if (!isInstance(prop, Array)) {
							continue;
						}

						const name = prop[0];

						if (typeof name === 'string' &&
								!strHasOnly("abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ_-$", name)) {
							return false;
						}
					}

					return true;
				})(), "Invalid attribute name: " + Object.keys(props).join(", "));

				assert(typeof name !== 'string' || validTags.includes(name.toUpperCase()) || name.includes('-'),
					"Invalid tag name: " + name);

				let ch;
				push(tags, h(name, props, ...(term ? [] : (ch = parse(name),len(ch) ? ch : [null]))));
				term = 0;
			}
		}

		assert(!tagName || term, `Tag not terminated properly: <${tagName}>`);
		assert(!tagName || term === special[">"] || term === tagName, `Tag not terminated properly: <${tagName}></${term}>`);
		assert(!term || tagName || term === special[">"], `Tag termination at top level: </${term}>`);
		assert(!term || tagName, `Annonymous tag termination at top level`);

		return tags;
	};

	return parse();
};
