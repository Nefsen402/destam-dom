import parser from '@babel/parser';
import t from '@babel/types';
import generate from '@babel/generator';
import babelTraverse from '@babel/traverse';

const canAppend = Symbol();
const walked = Symbol();

const createTemporary = i => t.identifier('static_' + i + '_' + Math.random().toString().substring(2));
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

const computeNode = (rep, refs, cleanup, node) => {
	if (node[walked]) return node;
	let [name, props, ...children] = node.arguments;
	const isRef = name.type === 'Identifier' && refs.includes(name.name);

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
			temporary = createTemporary(rep.length);
			rep.push(declare(temporary, createElement(rep.importer, name)));
		}

		temporary[canAppend] = true;
		return temporary;
	};

	let canLower = true;
	if (props) for (let i = 0; i < props.properties.length && canLower; i++) {
		const prop = props.properties[i];
		if (prop.type !== 'ObjectProperty') {
			canLower = false;
			break;
		}

		const search = val => {
			if (val.type === 'ObjectExpression') {
				for (let ii = 0; ii < val.properties.length; ii++) {
					const objectProp = val.properties[ii];
					if (objectProp.type !== 'ObjectProperty') {
						canLower = false;
						break;
					}

					search(objectProp.value);
				}
			}
		};

		search(prop.value);
	}

	if (props) for (let i = 0; i < props.properties.length; i++) {
		const prop = props.properties[i];
		if (prop.type !== 'ObjectProperty') break;

		let key = prop.key;
		const isRawSetter = (key.name || key.value).charAt(0) === '$';
		if (isRawSetter) {
			if (key.type === "Identifier") {
				key = t.identifier(key.name.substring(1));
			} else if (key.type === 'StringLiteral') {
				key = t.stringLiteral(key.value.substring(1));
			}
		}

		const search = (name, val, getTemp) => {
			const binaryType = val.type === 'BinaryExpression' &&
				([
					'+', '-', '==', '===', '!=',
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
					rep.push(t.expressionStatement(create(val)));

					return true;
				} else if (rep.importer && canLower) {
					cleanup.push(createWatcher(rep, val, create));

					return true;
				}
			} else if (binaryType === 'bool' || val.type === 'BooleanLiteral') {
				rep.push(t.expressionStatement(t.callExpression(
					t.memberExpression(getTemp(), t.identifier('toggleAttribute')),
					[name.type === 'Identifier' ? t.stringLiteral(name.name) : name, val]
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
						[name.type === 'Identifier' ? t.stringLiteral(name.name) : name, val]
					)));

					return true;
				} else if (rep.importer && canLower) {
					cleanup.push(createWatcher(rep, val, val => t.callExpression(rep.importer('setAttribute'), [
						getTemp(),
						name.type === 'Identifier' ? t.stringLiteral(name.name) : name,
						val
					])));

					return true;
				}
			}

			return false;
		};

		if (key.name === 'children') {
			if (prop.value.type !== 'NullLiteral') {
				children = prop.value;
			}
		} else if (search(key, prop.value, getTemp)) {
			props.properties.splice(i--, 1);
		}
	}

	let prevChild = null;
	for (let i = children.length - 1; i >= 0; i--) {
		let child = children[i];

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
			let temporary = createTemporary(rep.length);
			rep.push(declare(temporary, t.callExpression(
				rep.importer?.("createTextNode") ||
					t.memberExpression(t.identifier("document"), t.identifier("createTextNode")),
				[child]
			)));

			child = temporary;
			child[canAppend] = true;
		} else if (child.type === 'CallExpression' &&
				child.callee.type === 'Identifier' && child.callee.name === 'h') {
			child = computeNode(rep, refs, cleanup, child);
		}

		if (child[canAppend]) {
			rep.unshift(t.expressionStatement(t.callExpression(
				t.memberExpression(getTemp(), t.identifier('append')),
				[child]
			)));

			prevChild = child;
			child = null;
		} else if (rep.importer && canLower) {
			let temporary = createTemporary(rep.length);

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

		const elem = t.identifier('elem');
		const val = t.identifier('val');
		const before = t.identifier('before');
		const arg = t.identifier('arg');
		const ret = temporary || createElement(rep.importer, name);

		const idents = cleanup.map((_, i) => _.temporary || createTemporary(rep.length + i));
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

				const temp = createTemporary(table.size);
				decls.push(t.importSpecifier(temp, t.identifier(name)));
				table.set(name, temp);
				return temp;
			};
		},
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

			const refs = [];

			// look for ref definitions
			for (const b of block.node.body) {
				if (b.type === 'VariableDeclaration' && b.kind === 'const') {
					for (let decl of b.declarations) {
						if (decl.type === 'VariableDeclarator' &&
								decl.init && decl.init.type === 'CallExpression' &&
								decl.init.callee.type === 'MemberExpression' &&
								decl.init.callee.object.type === 'Identifier' &&
								decl.init.callee.object.name === 'document')  {
							refs.push(decl.id.name)
						}
					}
				}
			}

			const rep = [];

			if (importer) {
				rep.importer = importer;
				rep.cleanup = [];
			}

			const ret = computeNode(rep, refs, null, path.node);
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

	const Comp2 = ({}, cleanup) => {
		h('div', {
			class: observer.map(e => e * 2),
			classBody: observer.map(e => {
				return 2;
			})
		})
	};
`, {util_import: 'destam-dom'}).code);
*/

export default transform;
