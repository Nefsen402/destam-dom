import parser from '@babel/parser';
import t from '@babel/types';
import generate from '@babel/generator';
import {collectVariables, createIdent, createUse, assignVariables, checkImport} from './util.js';

const canAppend = Symbol();
const traversed = Symbol();

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
	let param;
	let setter;
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

			const returns = val.arguments[0].assignment.returns;
			for (const ret of returns) {
				ret.argument = create(ret.argument || t.identifier('undefined'));
			}
		} else {
			setter = create(val.arguments[0].body);
		}

		val = val.callee.object;
	} else {
		param = createIdent();
		setter = create(createUse(param));
	}

	return t.callExpression(
		rep.importer('watch'),
		[createUse(val), t.arrowFunctionExpression([param], setter)]
	);
};

const discoverRef = init => {
	return init &&
		init.type === 'CallExpression' &&
		init.callee.type === 'MemberExpression' &&
		init.callee.object.type === 'Identifier' &&
		init.callee.object.name === 'document';
};

const checkHImport = (node) => {
	const source = node.assignment.sourceNode;
	if (!source) {
		return false;
	}

	for (const spec of source.specifiers) {
		if (spec.type === 'ImportSpecifier' &&
				spec.local.assignment === node.assignment) {
			return (spec.imported.name || spec.imported.value) === 'h';
		}
	}

	return false;
};

const computeNode = (rep, cleanup, node) => {
	node[traversed] = true;
	let [name, props, ...children] = node.arguments;
	const isRef = name.type === 'Identifier' && discoverRef(name.assignment?.assignments?.length === 1 && name.assignment.init);

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
		let temp;
		if (!temporary) {
			if (isRef) {
				temp = createUse(name);
			} else {
				temporary = createIdent(null, {thing: 'temp'});
				temporary[canAppend] = true;
				rep.push(declare(temporary, createElement(rep.importer, name)));
				temp = createUse(temporary);
			}
		} else {
			temp = createUse(temporary);
		}

		return temp;
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
			if (val.type === 'Identifier' && val.assignment?.init &&
					val.assignment.assignments.length === 1) {
				val = val.assignment.init;
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
			let temporary = createIdent();
			rep.push(declare(temporary, t.callExpression(
				rep.importer?.("createTextNode") ||
					t.memberExpression(t.identifier("document"), t.identifier("createTextNode")),
				[child]
			)));

			child = temporary;
			child[canAppend] = true;
		} else if (child.type === 'CallExpression' && child.callee.type === 'Identifier' &&
				rep.callee.assignment === node.callee.assignment) {
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
			let temporary = createIdent();

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

		const elem = createIdent();
		const val = createIdent();
		const before = createIdent();
		const arg = createIdent();
		const ret = temporary || createElement(rep.importer, name);

		const idents = cleanup.map((_, i) => _.temporary || createIdent());
		return t.arrowFunctionExpression([elem, val, before], t.blockStatement([
			...cleanup.map((cleanup, i) => declare(idents[i], cleanup)),
			t.expressionStatement(t.optionalCallExpression(
				t.optionalMemberExpression(createUse(elem), t.identifier('insertBefore'), false, true),
				[createUse(ret), t.callExpression(createUse(before), [rep.importer('getFirst')])],
				false
			)),
			t.returnStatement(t.arrowFunctionExpression([arg], t.blockStatement([
				t.ifStatement(
					t.binaryExpression('===', createUse(arg), rep.importer('getFirst')),
					t.returnStatement(createUse(ret))
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
		return t.callExpression(createUse(rep.callee), [temporary || name, props, ...children]);
	}
}

export const transformBabelAST = (ast, options = {}) => {
	let importer;

	const found = [];

	const scope = collectVariables(ast, (node, lets) => {
		if (node.type === 'Program') {
			if (!('util_import' in options)) return;

			const table = new Map();
			const decls = [];

			importer = name => {
				if (table.has(name)) {
					return createUse(table.get(name));
				}

				if (table.size === 0)  {
					node.body.unshift(t.importDeclaration(decls, t.stringLiteral(`${options.util_import}/util.js`)));
				}

				const temp = createIdent(lets);
				decls.push(t.importSpecifier(temp, t.identifier(name)));
				table.set(name, temp);

				return createUse(temp);
			};
		} else if (node.type === 'CallExpression') {
			if (node.callee.type !== 'Identifier') return;

			let body;
			let current = lets;
			while (current) {
				body = current.body?.();
				if (body) break;

				current = current.parent;
			}

			found.push([node, lets, body]);
		}
	});

	for (const [node, lets, body] of found) {
		if (node[traversed]) continue;
		if (!checkHImport(node.callee)) continue;
		if (!checkImport(node.callee, options.assure_import)) continue;

		const rep = [];
		rep.callee = node.callee;
		if (importer) {
			rep.importer = importer;
			rep.cleanup = [];
		}

		const ret = computeNode(rep, null, node);

		// reorder all variable declarations to the top
		const decls = [];
		for (let i = 0; i < rep.length; i++) {
			if (rep[i].type !== 'VariableDeclaration') continue;
			decls.push(rep[i]);
			rep.splice(i--, 1);
		}
		rep.unshift(...decls);

		if (ret !== node || rep.length > 0 || rep.cleanup?.length > 0) {
			for (let o in node) {
				delete node[o];
			}

			for (let o in ret) {
				node[o] = ret[o];
			}

			for (let e of rep) {
				collectVariables(e, null, body.scope);
			}

			collectVariables(node, null, lets);
			body.placeBefore(...rep);
		}
	}

	assignVariables(scope);
};

const transform = (source, options = {}) => {
	const ast = parser.parse(source, {sourceType: 'module', ...options, code: false, ast: true});

	transformBabelAST(ast, options);

	return generate.default(ast, {
		sourceMaps: true,
		...options,
	}, source);
};

export default transform;
