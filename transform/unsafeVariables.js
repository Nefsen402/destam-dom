import parser from '@babel/parser';
import generate from '@babel/generator';
import t from '@babel/types';
import util from 'util';
import {collectVariables, assignVariables, createUse} from './util.js';

const replace = (node, replace) => {
	for (let o in node) {
		delete node[o];
	}

	for (let o in replace) {
		node[o] = replace[o];
	}
};

const transform = (source, options) => {
	const ast = parser.parse(source, {code: false, ast: true, sourceType: 'module'});

	const decls = [];
	const ignoreDecls = new Set();
	const callSites = new Map();
	const fors = [];

	const scope = collectVariables(ast, node => {
		if (node.type === 'VariableDeclaration') {
			decls.push(node);
		} else if (node.type === 'BinaryExpression') {
			if (node.operator === '===') {
				node.operator = '==';
			} else if (node.operator === '!==') {
				node.operator = '!=';
			}
		} else if (node.type === 'Program') {
			const decls = [];
			const reorder = [];
			const exps = [];
			for (const ast of node.body) {
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
				const decl = t.variableDeclaration('var', decls);
				reorder.unshift(decl);
				ignoreDecls.add(decl);
			}

			if (exps.length) {
				reorder.push(t.exportNamedDeclaration(null, exps));
			}

			node.body = reorder;
		} else if (node.type === 'CallExpression' && node.callee.type === 'Identifier') {
			callSites.set(node.callee, node);
		} else if (['ForStatement', 'ForOfStatement', 'ForInStatement'].includes(node.type)) {
			fors.push(node);
		}
	});

	for (const node of decls) {
		if (ignoreDecls.has(node)) continue;

		let repl;
		if (node.declarations.length === 1 && !node.declarations[0].init) {
			repl = node.declarations[0];
		} else {
			const decls = [];
			for (const dec of node.declarations) {
				if (dec.init) {
					decls.push(t.assignmentExpression('=', dec.id, dec.init));
				}
			}

			if (decls.length === 1) {
				repl = t.expressionStatement(decls[0]);
			} else {
				repl = t.expressionStatement(t.sequenceExpression(decls));
			}
		}

		replace(node, repl);
	}

	// the above for statemet will always generate expression statements. These
	// do not work if placed inside of for statements so fix them up here.
	for (const f of fors) {
		if (f.type === 'ForStatement') {
			if (f.init?.type === 'ExpressionStatement') f.init = f.init.expression;
		} else {
			if (f.left.type === 'ExpressionStatement') f.left = f.left.expression;
		}
	}

	const functionArgSize = new Map();
	for (const assignment of new Set([...callSites.keys()].map(e => e.assignment))) {
		if (assignment.assignments.length === 1 &&
				assignment.init &&
				assignment.init.type === 'ArrowFunctionExpression' &&
				assignment.uses.length) {
			let params = 0;
			for (const use of assignment.uses) {
				if (!callSites.has(use)) {
					params = Infinity;
					break;
				}

				let call = callSites.get(use);
				if (call.arguments.length &&
						call.arguments[call.arguments.length - 1].type === 'SpreadElement') {
					params = Infinity;
					break;
				}

				params = Math.max(params, call.arguments.length);
			}

			functionArgSize.set(assignment.init, params);
		}
	}

	let root;
	const traverse = scope => {
		for (const child of scope.children) {
			traverse(child);
		}

		if (!scope.func) {
			return;
		}

		const ret = [];
		const unused = [];
		const collect = currentScope => {
			const used = [];

			for (const assignment of currentScope.values()) {
				if (!['var', 'let', 'const'].includes(assignment.type)) {
					continue;
				}

				currentScope.delete(assignment.name);
				if (unused.length) {
					let reuse = unused.pop();
					assignment.replace(reuse);
					used.push(reuse);
				} else {
					assignment.rootScope = scope;

					let v = createUse(assignment);
					v.scope = scope;
					v.assignment.assignments.splice(0, 0, v);

					ret.push(t.variableDeclarator(v));
					used.push(assignment);
				}
			}

			for (const child of currentScope.children) {
				if (child.func) continue;
				collect(child);
			}

			unused.push(...used);
		};

		collect(scope);

		if (!ret.length) {
			return;
		}

		// find leading variable assignments and squash them. Terser doesn't
		// seem to be smart enough to do this on its own.
		const decls = new Map(ret.map(i => [i.id.assignment, i]));
		const body = scope.func.body.body;
		const declsCleanup = [];
		let movedExpressions = 0;

		const isRoot = !!scope.func.body.directives.length;
		scope.func.body.directives = [];

		main:for (let elem of body) {
			const orig = elem;

			if (elem.type === 'ExpressionStatement') {
				elem = elem.expression;
			}

			if (elem.type === 'SequenceExpression') {
				for (let seq of elem.expressions) {
					if (seq.type === 'AssignmentExpression' &&
							seq.operator === '=' &&
							seq.left.type === 'Identifier' &&
							decls.has(seq.left.assignment) &&
							!decls.get(seq.left.assignment).init) {
						decls.get(seq.left.assignment).init = seq.right;
						declsCleanup.push(() => {
							let i = elem.expressions.indexOf(seq);
							elem.expressions.splice(i, 1);

							if (elem.expressions.length === 0) {
								let i = body.indexOf(orig);
								body.splice(i, 1);
							}
						});
						movedExpressions++;
					} else {
						break main;
					}
				}
			} else if (elem.type === 'AssignmentExpression' &&
					elem.operator === '=' &&
					elem.left.type === 'Identifier' &&
					decls.has(elem.left.assignment) &&
					!decls.get(elem.left.assignment).init) {
				decls.get(elem.left.assignment).init = elem.right;
				declsCleanup.push(() => {
					let i = body.indexOf(orig);
					body.splice(i, 1);
				});
				movedExpressions++;
			} else if (elem.type === 'ForStatement' &&
					elem.init?.type === 'AssignmentExpression' &&
					decls.has(elem.init.left.assignment) &&
					!decls.get(elem.init.left.assignment).init) {
				decls.get(elem.init.left.assignment).init = elem.init.right;
				declsCleanup.push(() => elem.init = null);
				movedExpressions++;
				break;
			} else if (elem.type === 'ForStatement' &&
					elem.init?.type === 'SequenceExpression') {
				let i = 0;
				for (let expr of elem.init.expressions) {
					if (decls.has(expr.left.assignment) &&
							!decls.get(expr.left.assignment).init) {
						decls.get(expr.left.assignment).init = expr.right;
						i++;
					} else {
						break;
					}
				}
				movedExpressions += i;
				declsCleanup.push(() => {
					if (i === elem.init.length) {
						elem.init = null;
					} else{
						elem.init.expressions.splice(0, i);
					}
				});
				break;
			} else if (!isRoot) {
				break;
			}
		}

		// use assignment patterns here instead
		if (isRoot) {
			root = () => {
				for (let c of declsCleanup) c();

				scope.func.params.push(...ret.map(decl => {
					const assignment = decl.id.assignment;
					if (assignment.assignments.length === 2) {
						if (assignment.init === null) {
							assignment.rename('undefined');

							return null;
						} else if (assignment.uses.length === 1 &&
								assignment.uses[0].scope === assignment.rootScope){
							// this variable only has one use and within the same
							// scope. It's safe to inline
							replace(assignment.uses[0], assignment.init);
							return null;
						}
					}

					if (!decl.init) {
						return decl.id;
					}

					return t.assignmentPattern(decl.id, decl.init);
				}).filter(e => e));
			};
		} else if (functionArgSize.has(scope.func) &&
				functionArgSize.get(scope.func) <= scope.func.params.length) {
			for (let c of declsCleanup) c();

			scope.func.params.push(...ret.map(decl => {
				if (decl.init) {
					return t.assignmentPattern(decl.id, decl.init)
				}

				return decl.id;
			}));
		} else if (scope.func.params[scope.func.params.length - 1]?.type !== 'RestElement' &&
				movedExpressions <= 4) {
			scope.func.params.push(...ret.map(decl => decl.id));
		} else {
			for (let c of declsCleanup) c();
			body.unshift(t.variableDeclaration('var', ret));
		}
	};

	traverse(scope);
	assignVariables(scope);
	if (root) root();

	return generate.default(ast, {
		sourceMaps: true,
		...options,
	}, source);
};

export default transform;
