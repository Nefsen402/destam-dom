import parser from '@babel/parser';
import generate from '@babel/generator';
import t from '@babel/types';
import util from 'util';
import htm, {validTags} from '../htm.js';
import {collectVariables, createIdent, createUse, assignVariables, checkImport} from './util.js';

const traversed = Symbol();
const spreadKeys = Symbol();

const createTag = (args, tag, lets) => {
	const expr = t.callExpression(createUse(tag, lets), args);
	return expr;
};

const jsxName = (name, check, lets) => {
	const ident = name => {
		let v = lets.search(name);
		if (v) {
			return createUse(v, lets);
		}

		return t.identifier(name);
	};

	if (name.type === 'JSXIdentifier') {
		name = name.name;
		if (name[0].toLowerCase() !== name[0]) {
			return ident(name);
		} else {
			if (check && !validTags.includes(name.toUpperCase()) && !name.includes('-')) {
				throw new Error("Invalid tag name: " + name);
			}

			return t.stringLiteral(name);
		}
	} else if (name.type === 'JSXMemberExpression') {
		const parse = node => {
			if (node.type === 'JSXIdentifier') {
				return ident(node.name);
			} else {
				return t.memberExpression(parse(node.object), parse(node.property));
			}
		};

		return parse(name);
	} else {
		throw new Error("Unknown JSX name type: " + name.type);
	}
};

const parse = (node, importer, lets) => {
	node[traversed] = true;

	const transformChildren = node => {
		if (node.type !== 'JSXFragment' && !node.closingElement) {
			if (node.children.length) throw new Error("Expected no children if there is no closing element");
			return null;
		}

		const children = [];
		let canExclude = true, newline = false, whitespace = false, cur = '';

		const flush = () => {
			if (whitespace) {
				if (!newline) cur += ' ';

				newline = false;
				whitespace = false;
			}

			if (cur) children.push(t.stringLiteral(cur));
			canExclude = true;
			cur = '';
		};

		for (const child of node.children) {
			if (child.type === 'JSXText') {
				for (let i = 0; i < child.value.length; i++) {
					const char = child.value[i];

					if ("\n\r \t".includes(char)) {
						if (char === '\n') {
							newline = true;
						}

						whitespace = true;
					} else {
						if (whitespace) {
							if (!canExclude || !newline) cur += ' ';
							whitespace = false;
							newline = false;
							canExclude = false;
						}

						cur += char;
					}
				}

				continue;
			}

			flush();

			if (child.type === 'JSXElement') {
				children.push(parse(child, importer, lets));
			} else if (child.type === 'JSXExpressionContainer') {
				if (child.expression.type !== 'JSXEmptyExpression') {
					children.push(child.expression);
				}
			} else if (child.type === 'JSXFragment') {
				child[traversed] = true;

				children.push(...transformChildren(child));
			} else if (child.type === 'JSXSpreadChild') {
				children.push(t.spreadElement(child.expression));
			} else {
				throw new Error("Unknown AST type for JSX child: " + child.type);
			}
		}

		flush();
		return children;
	};

	if (node.type === 'JSXFragment') {
		return t.arrayExpression(transformChildren(node));
	}

	let impl = 'h';
	let check = true;
	let name = node.openingElement.name;
	if (name.type === 'JSXNamespacedName') {
		impl = name.namespace.name;
		name = name.name;
		check = false;
	}

	impl = importer(impl);
	if (!impl) {
		return node;
	}

	const args = [
		jsxName(name, check, lets),
	];

	const children = transformChildren(node);
	if (children || node.openingElement.attributes.length) {
		args.push(t.objectExpression(node.openingElement.attributes.map(attr => {
			if (attr.type === 'JSXSpreadAttribute') {
				return t.spreadElement(attr.argument);
			}

			let {name, value} = attr;
			if (!value) {
				value = t.booleanLiteral(true);
			} else if (value.type === 'JSXExpressionContainer') {
				value = value.expression;
			}

			return t.objectProperty(t.stringLiteral(name.name), value);
		})));
	}

	if (children) {
		if (!children.length) {
			args.push(t.identifier('null'));
		} else {
			args.push(...children);
		}
	}

	return createTag(args, impl, importer.scope);
};

const replace = (node, replace) => {
	if (node === replace) return;

	for (let o in node) {
		delete node[o];
	}

	for (let o in replace) {
		node[o] = replace[o];
	}
};

export const transformBabelAST = (ast, options = {}) => {
	const globalTags = options.tags || {
		'html': 'h',
	};

	let templates = [];
	let imports = new Map();
	let jsx = [];
	let program;
	const scope = collectVariables(ast, (node, lets) => {
		if (node.type === 'Program') {
			program = {node, lets};
		} else if (node.type === 'ImportDeclaration') {
			imports.set(node, lets);
		} else if (node.type === 'TaggedTemplateExpression') {
			templates.push([node, lets]);
		} else if (node.type === 'JSXElement' || node.type === 'JSXFragment') {
			jsx.push([node, lets]);
		}
	});

	for (const [node, lets] of templates) {
		let currentTag;
		if (node.tag.assignment.sourceNode && checkImport(node.tag, options.assure_import)) {
			const name = globalTags[node.tag.name];
			const specs = node.tag.assignment.sourceNode.specifiers;

			for (const spec of specs) {
				if (spec.imported.name === name || spec.imported.value === name) {
					currentTag = spec.local;
				}
			}

			if (!currentTag) {
				currentTag = createIdent(imports.get(node.tag.assignment.sourceNode));
				specs.push(t.importSpecifier(currentTag, t.identifier(name)));
			}
		} else {
			const init = node.tag.assignment.assignments.length === 1 &&
				node.tag.assignment.init;

			if (init && init.type === 'CallExpression' &&
					init.callee.type === 'Identifier' &&
					init.callee.name === 'htm' &&
					init.arguments.length === 1 &&
					init.arguments[0].type === 'Identifier') {
				currentTag = init.arguments[0];
			}
		}

		if (!currentTag) {
			return;
		}

		const html = htm((name, props, ...children) => {
			const args = [
				typeof name === 'string' ? t.stringLiteral(name) : name,
			];

			if (Object.keys(props).length || children.length) {
				args.push(t.objectExpression(Object.entries(props).map(([key, val]) => {
					if (props[spreadKeys]?.includes(key)) {
						return t.spreadElement(val);
					}

					if (val === true) {
						val = t.booleanLiteral(val);
					}

					if (typeof key === 'string') {
						key = t.stringLiteral(key);
					}

					if (typeof val === 'string') {
						val = t.stringLiteral(val);
					}

					return t.objectProperty(key, val);
				})));
			}

			args.push(...children.map(child => {
				if (typeof child === 'string') {
					return t.stringLiteral(child);
				} else if (child === null) {
					return t.nullLiteral();
				} else {
					return child;
				}
			}));

			return createTag(args, currentTag, lets);
		}, (props, obj) => {
			const key = '~spread-' + Math.random();

			if (!props[spreadKeys]) props[spreadKeys] = [];
			props[spreadKeys].push(key);

			props[key] = obj;
		}, strings => {
			if (strings.length === 1) {
				return strings[0];
			}

			return t.callExpression(
				t.memberExpression(t.arrayExpression(strings.map(string => {
					if (typeof string === 'string') {
						string = t.stringLiteral(string);
					}

					return string;
				})), t.identifier('join')),
				[t.stringLiteral("")],
			);
		});

		const {expressions, quasis} = node.quasi;
		const out = html(quasis.map(node => node.value.raw), ...expressions).map(node => {
			if (typeof node === 'string') {
				node = t.stringLiteral(node);
			}

			return node;
		});

		if (out.length === 0) {
			replace(node, t.nullLiteral());
		} else if (out.length === 1) {
			replace(node, out[0]);
		} else {
			replace(node, t.arrayExpression(out));
		}
	}

	let jsxAutoImport = new Map();
	for (const [node, lets] of jsx) {
		if (node[traversed]) continue;

		if (options.assure_no_import) {
			const found = lets.search(options.assure_no_import);

			if (found?.type === 'import') {
				continue;
			}
		}

		const importer = name => {
			const found = lets.search(name);

			if (found && checkImport(found, options.assure_import)) {
				return found;
			}

			if (!options.jsx_auto_import?.[name]) {
				return null;
			}

			if (jsxAutoImport.has(name)) {
				return jsxAutoImport.get(name);
			}

			const decls = [];
			program.node.body.unshift(
				t.importDeclaration(decls, t.stringLiteral(options.jsx_auto_import[name])));

			const temp = createIdent(program.lets);
			decls.push(t.importSpecifier(temp, t.identifier(name)));
			jsxAutoImport.set(name, temp);
			return temp;
		};

		importer.scope = lets;
		replace(node, parse(node, importer, lets));
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
