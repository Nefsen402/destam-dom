import parser from '@babel/parser';
import generate from '@babel/generator';
import babelTraverse from '@babel/traverse';
import t from '@babel/types';
import util from 'util';

const createSequence = idents => {
	if (idents.length === 1) return idents[0];
	return t.sequenceExpression(idents);
};

const log = stuff => console.log(util.inspect(stuff, {colors: true, depth: null}));

const transform = (source, options) => {
	const ast = parser.parse(source, {code: false, ast: true, sourceType: 'module'});

	babelTraverse.default(ast, {
		VariableDeclaration: path => {
			path.node.kind = 'var';
		},
		BinaryExpression: path => {
			if (path.node.operator === '===') {
				path.node.operator = '==';
			} else if (path.node.operator === '!==') {
				path.node.operator = '!=';
			}
		},
		CallExpression: path => {
			if (path.node.callee.type === 'Identifier' && path.node.callee.name === 'assert') {
				path.replaceWithMultiple([]);
			}
		}
	});

	const traverse = (node, vars, context, remove) => {
		if (node.type === 'BlockStatement') {
			for (const ast of node.body.slice()) {
				traverse(ast, vars, context.concat(node), (things) => {
					let i = node.body.indexOf(ast);
					node.body.splice(i, 1, ...things);
				});
			}
		} else if (node.type === 'VariableDeclaration') {
			const decls = [];
			const unsafe = [];
			for (const dec of node.declarations) {
				if (dec.id.type === 'Identifier') {
					if (dec.init) {
						decls.push(t.assignmentExpression('=', dec.id, dec.init));
					}

					vars.push({context, id: dec.id});
				} else {
					if (dec.id.type === 'ArrayPattern') {
						const record = thing => {
							if (thing.type === 'Identifier') {
								vars.push({context, id: thing});
							} else if (thing.type === 'ArrayPattern') {
								for (const element of thing.elements) {
									record(element)
								}
							}
						};

						record(dec.id);

						if (dec.init) {
							unsafe.push(t.assignmentExpression('=', dec.id, dec.init));
						} else {
							unsafe.push(dec.id);
						}
					} else {
						unsafe.push(t.variableDeclaration('var', [dec]));
					}
				}
			}

			remove([
				...decls,
				...unsafe,
			].filter(e => e));
		} else if (node.type === 'IfStatement') {
			traverse(node.consequent, vars, context);
			if (node.alternate) traverse(node.alternate, vars, context);
		} else if (node.type === 'ForStatement') {
			let nc = [...context, node];
			if (node.init) traverse(node.init, vars, nc, stuff => node.init = createSequence(stuff));
			traverse(node.body, vars, nc);
		} else if (node.type === 'ForOfStatement') {
			let nc = [...context, node];
			let ident = [];
			traverse(node.left, ident, nc, stuff => node.left = stuff[0] || ident[0].id);
			vars.push(...ident);
			traverse(node.body, vars, nc);
		} else if (node.type === 'ForInStatement') {
			let nc = [...context, node];
			let ident = [];
			traverse(node.left, ident, nc, stuff => node.left = stuff.length ? createSequence(stuff) : ident[0].id);
			vars.push(...ident);
			traverse(node.body, vars, nc);
		} else if (node.type === 'TryStatement') {
			traverse(node.block, vars, context);
			if (node.handler) traverse(node.handler.body, vars, context);
			if (node.finalizer) traverse(node.finalizer, vars, context);
		} else if (node.type === 'WhileStatement') {
			traverse(node.body, vars, context);
		} else if (node.type === 'DoWhileStatement') {
			traverse(node.body, vars, context);
		}
	};

	const handleFunction = path => {
		const vars = [];
		const idents = [];

		path.traverse({
			Identifier: path => {
				idents.push(path);
			}
		});

		const hasScope = (path, node) => {
			while (path) {
				if (node === path.node) return true;
				path = path.parentPath;
			}

			return false;
		};

		traverse(path.node.body, vars, []);

		for (let i = 0; i < vars.length; i++) {
			const {id, context} = vars[i];
			const contexts = [context];

			// look forward to see if there is anybody that can reuse this
			// variable allocation
			main:for (let ii = i + 1; ii < vars.length; ii++) {
				let cur = vars[ii];

				// make sure these variables are not in the same scope
				for (let iv = 0; iv < contexts.length; iv++) {
					let equ = true;
					for (let iii = 0; iii < Math.min(contexts[iv].length, cur.context.length); iii++) {
						if (contexts[iv][iii] !== cur.context[iii]) {
							equ = false;
							break;
						}
					}
					if (equ) continue main;
				}

				//make sure nobody else is using this variable name
				let found = false;
				for (let path of idents) {
					if (!hasScope(path, cur.context[cur.context.length - 1])) continue;

					if (path.node.name === id.name) {
						found = true;
						break;
					}
				}

				if (found) {
					continue;
				}

				contexts.push(cur.context);

				// this variable can be re-used. Make a pass over the ast to rename the variable
				let name = cur.id.name;
				for (let path of idents) {
					if (!hasScope(path, cur.context[cur.context.length - 1])) continue;

					if (path.node.name === name) {
						path.node.name = id.name;
					}
				}

				// stop tracking the variable as we eliminated it.
				vars.splice(ii--, 1);
			}
		}

		const ret = [];
		const seen = new Set();
		for (let {id, context} of vars) {
			if (seen.has(id.name)) continue;
			seen.add(id.name);
			ret.push(id);
		}

		if (path.node.params[path.node.params.length - 1]?.type === 'RestElement') {
			if (ret.length) path.node.body.body.unshift(t.variableDeclaration('var', ret.map(i => t.variableDeclarator(i))));
		} else {
			path.node.params.push(...ret);
		}
	};

	babelTraverse.default(ast, {
		Program: path => {
			const decls = [];
			const reorder = [];
			const exps = [];
			for (const ast of path.node.body.slice()) {
				if (ast.type === 'VariableDeclaration') {
					decls.push(...ast.declarations);
				} else if (ast.type === 'ExportNamedDeclaration' && !ast.source) {
					if (ast.declaration) {
						decls.push(...ast.declaration.declarations);
						exps.push(...ast.declaration.declarations.map(decl => {
							return t.exportSpecifier(decl.id, decl.id);
						}));
					} else {
						exps.push(...ast.specifiers);
					}
				} else {
					reorder.push(ast);
				}
			}

			if (decls.length) {
				reorder.unshift(t.variableDeclaration('var', decls));
			}

			if (exps.length) {
				reorder.push(t.exportNamedDeclaration(null, exps));
			}

			path.node.body = reorder;
		},
		ArrowFunctionExpression: handleFunction,
		FunctionDeclaration: handleFunction,
		ObjectMethod: handleFunction,
	});

	return generate.default(ast, {
		sourceMaps: true,
		...options,
	}, source);
};

/*
console.log(transform(`
const chainGov = (prev, next) => (child, info, entry) => {
	if (isSymbol(info)) info = [prev, info];
	let [gov, curInfo] = info;

	curInfo = gov(child, curInfo, entry);
	if (curInfo === false) {
		return false;
	}

	if (gov === prev && isSymbol(curInfo)) {
		gov = next;

		curInfo = gov(child, curInfo, entry);
		if (curInfo === false) {
			return false;
		}
	}

	return [gov, curInfo];
};
`).code)
*/

export default transform;
