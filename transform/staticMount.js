import parser from '@babel/parser';
import t from '@babel/types';
import generate from '@babel/generator';
import babelTraverse from '@babel/traverse';

const canAppend = Symbol();
const walked = Symbol();

const allowedTempChars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ$_123456789';
let tempCounter = 0;
const createTemporary = () => {
	let str = "$$";

	let c = tempCounter++;
	for (let i = 0; i < 2; i++) {
		str += allowedTempChars[c % allowedTempChars.length];
		c = Math.floor(c / allowedTempChars.length);
	}

	for (let i = 0; i < 8; i++) {
		str += allowedTempChars[Math.floor(Math.random() * allowedTempChars.length)];
	}

	return t.identifier(str);
};
const declare = (ident, val) => t.variableDeclaration('const', [t.variableDeclarator(ident, val)]);
const createElement = (importer, name) => {
	let elem;
	if (importer) {
		elem = t.callExpression(importer('createElement'), [name]);
	} else {
		elem = t.callExpression(t.memberExpression(t.identifier("document"), t.identifier("createElement")), [name]);
	}
	elem[canAppend] = true;
	return elem;
};

const createWatcher = (rep, val, create) => {
	let param = t.identifier('_');
	let setter = param;

	if (val.type === 'CallExpression' &&
			val.callee.type === 'MemberExpression' &&
			val.callee.property.type === 'Identifier' &&
			val.callee.property.name === 'map' &&
			val.arguments.length === 1 &&
			val.arguments[0].type === 'ArrowFunctionExpression' &&
			val.arguments[0].params.length === 1) {
		param = val.arguments[0].params[0];

		if (val.arguments[0].body.type === 'BlockStatement') {
			setter = val.arguments[0].body;

			const traverse = node => {
				if (node.type === 'ReturnStatement') {
					node.argument = create(node.argument || t.identifier('undefined'));
				} else if (Array.isArray(node.body) && !node.type.includes("Function")) {
					for (let thing of node.body) {
						traverse(thing);
					}
				}
			};

			traverse(setter);
		} else {
			setter = create(val.arguments[0].body);
		}

		val = val.callee.object;
	} else {
		setter = create(setter);
	}

	return t.callExpression(
		rep.importer('watch'),
		[val, t.arrowFunctionExpression([param], setter)]
	);
};

const discoverRef = init => {
	return init &&
		init.type === 'CallExpression' &&
		init.callee.type === 'MemberExpression' &&
		init.callee.object.type === 'Identifier' &&
		init.callee.object.name === 'document';
}

const computeNode = (rep, cleanup, node) => {
	if (node[walked]) return node;
	let [name, props, ...children] = node.arguments;
	const isRef = name.type === 'Identifier' && discoverRef(rep.constants.get(name.name));

	node[walked] = true;

	if (name.type !== 'StringLiteral' && !isRef) {
		return node;
	}

	if (props && props.type !== 'ObjectExpression') {
		return node;
	}

	const isBase = !cleanup;
	cleanup = cleanup || [];

	let temporary = null;
	const getTemp = () => {
		if (temporary) return temporary;

		if (isRef) {
			temporary = name;
		} else {
			temporary = createTemporary();
			rep.push(declare(temporary, createElement(rep.importer, name)));
		}

		temporary[canAppend] = true;
		return temporary;
	};

	let canLower = true;
	let lowerChildren = true;

	if (props) for (let i = 0; i < props.properties.length && canLower; i++) {
		const prop = props.properties[i];
		if (prop.type !== 'ObjectProperty') {
			canLower = false;
			break;
		}

		if (prop.computed) {
			canLower = false;
			break;
		}

		if ((prop.key.name || prop.key.value) === 'children') {
			if (prop.value.type !== 'NullLiteral') {
				if (prop.value.type !== 'ArrayExpression') {
					lowerChildren = false;
					canLower = false;
				} else {
					children = prop.value.elements;
				}
			}
		}

		const search = (val, key) => {
			if (val.type === 'ObjectExpression') {
				for (let ii = 0; ii < val.properties.length; ii++) {
					const objectProp = val.properties[ii];
					if (objectProp.type !== 'ObjectProperty') {
						canLower = false;
						break;
					}

					if (objectProp.computed) {
						canLower = false;
						break;
					}

					search(objectProp.value);
				}
			} else if ((key?.name || key?.value) === '$style') {
				canLower = false;
			}
		};

		search(prop.value, prop.key);
	}

	if (props) for (let i = 0; i < props.properties.length; i++) {
		const prop = props.properties[i];
		if (prop.type !== 'ObjectProperty') break;
		if (prop.computed) break;

		let key = prop.key;
		if (key.name === 'children') {
			if (lowerChildren) props.properties.splice(i--, 1);
			continue;
		}

		const isRawSetter = (key.name || key.value).charAt(0) === '$';
		if (isRawSetter) {
			if (key.type === "Identifier") {
				key = t.identifier(key.name.substring(1));
			} else if (key.type === 'StringLiteral') {
				key = t.stringLiteral(key.value.substring(1));
			}
		}

		const search = (name, orig, getTemp) => {
			let val = orig;
			if (val.type === 'Identifier' && rep.constants.has(val.name)) {
				val = rep.constants.get(val.name);
			}

			const binaryType = val.type === 'BinaryExpression' &&
				([
					'==', '===', '!=',
					'!==', 'in', 'instanceof',
					'>', '<', "<=", ">="
				].includes(val.operator) ? 'bool' : 'other');

			const isJoinPattern = val.type === 'CallExpression' &&
				val.callee.type === 'MemberExpression' &&
				val.callee.property.type === 'Identifier' &&
				val.callee.property.name === 'join' &&
				val.callee.object.type === 'ArrayExpression';

			if (val.type === 'ObjectExpression') {
				for (let ii = 0; ii < val.properties.length; ii++) {
					const objectProp = val.properties[ii];
					if (objectProp.type !== 'ObjectProperty') break;
					if (objectProp.computed) break;

					if (search(objectProp.key, objectProp.value,
							() => t.memberExpression(getTemp(), name, name.type === 'StringLiteral'))) {
						val.properties.splice(ii--, 1);
					}
				}

				if (val.properties.length === 0) {
					return true;
				}
			} else if (isRawSetter) {
				const create = val => t.assignmentExpression('=',
					t.memberExpression(getTemp(), name, name.type === 'StringLiteral'),
					val
				);

				if (isJoinPattern || [
					'BooleanLiteral', 'StringLiteral',
					'NumericLiteral', 'ArrowFunctionExpression',
					'FunctionExpression', 'BinaryExpression',
					'TemplateLiteral', 'UpdateExpression',
					'NullLiteral', 'BigIntLiteral',
				].includes(val.type)) {
					rep.push(t.expressionStatement(create(orig)));

					return true;
				} else if (rep.importer && canLower) {
					cleanup.push(createWatcher(rep, orig, create));

					return true;
				}
			} else if (binaryType === 'bool' || val.type === 'BooleanLiteral') {
				rep.push(t.expressionStatement(t.callExpression(
					t.memberExpression(getTemp(), t.identifier('toggleAttribute')),
					[name.type === 'Identifier' ? t.stringLiteral(name.name) : name, orig]
				)));

				return true;
			} else {
				if (binaryType === 'other' || isJoinPattern || [
					'StringLiteral', 'NumericLiteral',
					'TemplateLiteral', 'UpdateExpression',
					'NullLiteral', 'BigIntLiteral',
				].includes(val.type)) {
					rep.push(t.expressionStatement(t.callExpression(
						t.memberExpression(getTemp(), t.identifier('setAttribute')),
						[name.type === 'Identifier' ? t.stringLiteral(name.name) : name, orig]
					)));

					return true;
				} else if (rep.importer && canLower) {
					cleanup.push(createWatcher(rep, orig, val => t.callExpression(rep.importer('setAttribute'), [
						getTemp(),
						name.type === 'Identifier' ? t.stringLiteral(name.name) : name,
						val
					])));

					return true;
				}
			}

			return false;
		};

		if (search(key, prop.value, getTemp)) {
			props.properties.splice(i--, 1);
		}
	}

	let prevChild = null;
	if (lowerChildren) for (let i = children.length - 1; i >= 0; i--) {
		let child = children[i];

		if (child.type === 'SpreadElement') {
			child = t.arrayExpression([child]);
		}

		if (child.type === 'ArrayExpression' && child.elements.find(e => e.type !== 'SpreadElement')) {
			const elms = child.elements.map(e => {
				if (e.type === 'SpreadElement') {
					return t.arrayExpression([e]);
				}

				return e;
			});

			children.splice(i, 1, ...elms);
			i += elms.length;
			continue;
		}

		if (child.type === 'NullLiteral') {
			children.splice(i, 1);
			continue;
		}

		if ([
			'StringLiteral', 'BooleanLiteral',
			'NumericLiteral', 'BigIntLiteral'
		].includes(child.type)) {
			let temporary = createTemporary();
			rep.push(declare(temporary, t.callExpression(
				rep.importer?.("createTextNode") ||
					t.memberExpression(t.identifier("document"), t.identifier("createTextNode")),
				[child]
			)));

			child = temporary;
			child[canAppend] = true;
		} else if (child.type === 'CallExpression' &&
				child.callee.type === 'Identifier' && child.callee.name === 'h') {
			child = computeNode(rep, cleanup, child);
		}

		if (child[canAppend]) {
			rep.unshift(t.expressionStatement(t.callExpression(
				t.memberExpression(getTemp(), t.identifier('append')),
				[child]
			)));

			prevChild = child;
			child = null;
		} else if (rep.importer && canLower) {
			let temporary = createTemporary();

			const mountArguments = [getTemp(), child];

			if (prevChild) {
				mountArguments.push(prevChild[canAppend] ? t.arrowFunctionExpression([], prevChild) : prevChild);
			}

			const mount = t.callExpression(rep.importer('mount'), mountArguments);
			mount.temporary = temporary;
			cleanup.push(mount);

			prevChild = temporary;
			child = null;
		} else if (prevChild) {
			children.splice(i + 1, 0, prevChild);
		}

		if (!child) {
			children.splice(i, 1);
		} else {
			children[i] = child;
		}
	}

	if (rep.importer && cleanup.length && isBase) {
		if (children.length) throw new Error("Run into an impossible state");

		const elem = createTemporary();
		const val = createTemporary();
		const before = createTemporary();
		const arg = createTemporary();
		const ret = temporary || createElement(rep.importer, name);

		const idents = cleanup.map((_, i) => _.temporary || createTemporary());
		return t.arrowFunctionExpression([elem, val, before], t.blockStatement([
			...cleanup.map((cleanup, i) => declare(idents[i], cleanup)),
			t.expressionStatement(t.optionalCallExpression(
				t.optionalMemberExpression(elem, t.identifier('insertBefore'), false, true),
				[ret, t.callExpression(before, [rep.importer('getFirst')])],
				false
			)),
			t.returnStatement(t.arrowFunctionExpression([arg], t.blockStatement([
				t.ifStatement(
					t.binaryExpression('===', arg, rep.importer('getFirst')),
					t.returnStatement(ret)
				),
				t.expressionStatement(t.callExpression(t.memberExpression(ret, t.identifier('remove')), [])),
				...idents.map(ident => t.expressionStatement(t.callExpression(ident, [])))
			])))
		]));
	} else if (children.length === 0 && (!props || props.properties.length === 0)) {
		if (temporary) return temporary;
		if (name.type === 'Identifier') return name;
		return createElement(rep.importer, name);
	} else {
		const node = t.callExpression(t.identifier('h'), [temporary || name, props, ...children]);
		node[walked] = true;
		return node;
	}
}

const recordConstants = path => {
	const constants = new Map();

	for (const b of path.node.body) {
		if (b.type === 'VariableDeclaration' && b.kind === 'const') {
			for (const decl of b.declarations) {
				if (decl.type === 'VariableDeclarator')  {
					constants.set(decl.id.name, decl.init);
				}
			}
		}
	}

	path._constants = constants;
};

export const transformBabelAST = (ast, options = {}) => {
	let importer;

	babelTraverse.default(ast, {
		Program: path => {
			if (!('util_import' in options)) return;

			const table = new Map();
			const decls = [];

			importer = name => {
				if (table.has(name)) {
					return table.get(name);
				}

				if (table.size === 0)  {
					path.node.body.unshift(t.importDeclaration(decls, t.stringLiteral(`${options.util_import}/util.js`)));
				}

				const temp = createTemporary();
				decls.push(t.importSpecifier(temp, t.identifier(name)));
				table.set(name, temp);
				return temp;
			};

			recordConstants(path);
		},
		BlockStatement: recordConstants,
		CallExpression: path => {
			if (path.node[walked]) return;
			if (path.node.callee.type !== 'Identifier' || path.node.callee.name !== 'h') return;

			let block = path;
			let child;
			while (!block.node.body) {
				if (block.parentPath.node.body) {
					if (!Array.isArray(block.parentPath.node.body)) {
						block.replaceWith(t.blockStatement([t.returnStatement(block.node)]));
						return;
					} else {
						child = block.node;
					}
				}

				block = block.parentPath;
			}

			const constants = new Map();
			const searchParams = node => {
				if (node.type === 'Identifier') {
					constants.delete(node.name);
				} else if (node.type === 'ObjectPattern') {
					for (const prop of node.properties) {
						searchParams(prop.value);
					}
				} else if (node.type === 'RestElement') {
					if (node.argument.type === 'Identifier') {
						constants.delete(node.argument.name);
					}
				} else if (node.params) {
					for (let param of node.params) {
						searchParams(param);
					}
				}
			};

			let stack = [];
			let constSearch = path;
			while (constSearch) {
				stack.push(constSearch);
				constSearch = constSearch.parentPath;
			}

			for (const constSearch of stack.reverse()) {
				if (constSearch._constants) {
					for (const [key, value] of constSearch._constants.entries()) {
						constants.set(key, value);
					}
				}

				searchParams(constSearch.node);
			}

			const rep = [];
			rep.constants = constants;

			if (importer) {
				rep.importer = importer;
				rep.cleanup = [];
			}

			const ret = computeNode(rep, null, path.node);
			if (ret !== path.node || rep.length > 0 || rep.cleanup?.length > 0) {
				path.replaceWith(ret);
			}

			// reorder all variable declarations to the top
			const decls = [];
			for (let i = 0; i < rep.length; i++) {
				if (rep[i].type !== 'VariableDeclaration') continue;
				decls.push(rep[i]);
				rep.splice(i--, 1);
			}
			rep.unshift(...decls);

			block.node.body.splice(block.node.body.indexOf(child), 0, ...rep);
		}
	});
};

const transform = (source, options = {}) => {
	const ast = parser.parse(source, {sourceType: 'module', ...options, code: false, ast: true});

	transformBabelAST(ast, options);

	return generate.default(ast, {
		sourceMaps: true,
		...options,
	}, source);
};

/*
console.log(transform(`
	let $thing = 0;
	const Button = ({ id, text, fn }) =>
	  mount(h('div', {"class": 'col-sm-6 smallpad'},
	    h('button', {id, "class": 'btn btn-primary btn-block', type: 'button', $onclick: fn}, text)
	  ))

	let a = () => h('a', {hello: world < 0, thing: value * 2});

	const div = document.createElement('div');

	mount(h(div, {hello: 'world', $value: 10, num: 10.5, bool: true, $style: {
		"hello with a space": "world",
		val: 10n,
		func: (a) => lol,
		func2: function () {},
		class: ["hello"].join('')
	}}, "hello", 0, h('br'), h('br')));

	h('div', {}, h('div'), stuff)

	const Component = ({}, cleanup) => h('div', {hello}, null, one, two, three, "hello");

	const constant = "hello world";

	const Comp2 = ({}, cleanup, ...constant) => {
		h('div', {
			class: observer.map(e => e * 2),
			classBody: observer.map(e => {
				return 2;
			}),
			constant
		})
	};
`, {util_import: 'destam-dom'}).code);
*/


export default transform;
