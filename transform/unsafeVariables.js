import parser from '@babel/parser';
import generate from '@babel/generator';
import babelTraverse from '@babel/traverse';
import t from '@babel/types';
import util from 'util';
import {collectVariables} from './util.js';

const createSequence = idents => {
	if (idents.length === 1) return idents[0];
	return t.sequenceExpression(idents);
};

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
	});

	collectVariables(ast);

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
		VariableDeclaration: path => {
			const node = path.node;
			if (node.bailed) return;

			const decls = [];
			if (['BlockStatement', 'ForStatement'].includes(path.parentPath.node.type)) {
				for (const dec of node.declarations) {
					if (dec.init) {
						decls.push(t.expressionStatement(t.assignmentExpression('=', dec.id, dec.init)));
					}
				}

				path.replaceWithMultiple(decls);
			} else {
				for (const dec of node.declarations) {
					if (dec.init) {
						decls.push(t.assignmentExpression('=', dec.id, dec.init));
					} else {
						decls.push(dec.id);
					}
				}
				path.parentPath.node.left = decls[0];
			}
		},
	});

	const traverse = scope => {
		for (const child of scope.children) {
			traverse(child);
		}

		if (!scope.func) {
			return;
		}

		const doesNotOverlap = (one, two) => {
			return one[1] < two[0] ||
				two[1] < one[0];
		};

		const vars = [];

		const ret = [];
		for (const assignment of scope.values()) {
			if (assignment.type !== 'var') {
				continue;
			}

			let s = assignment.getScope();

			let sameScope = true;
			for (let ident of [...assignment.uses, ...assignment.assignments]) {
				if (assignment.assignments[0].scope !== ident.scope) {
					sameScope = false;
					break;
				}
			}

			let replaced = false;
			if (sameScope) for (let v of vars) {
				if (doesNotOverlap(v.scope, s)) {
					console.log(v.assignment.name, assignment.name);
					assignment.replace(v.assignment);
					v.scope = v.assignment.getScope();
					replaced = true;
					break;
				}
			}

			if (!replaced) {
				if (sameScope) vars.push({scope: s, assignment});
				ret.push(assignment.assignments[0]);
			}
		}

		if (!ret.length) {
			return;
		}

		// find leading variable assignments and squash them. Terser doesn't
		// seem to be smart enough to do this on its own.
		const decls = new Map(ret.map(i => [i.name, t.variableDeclarator(i)]));
		const body = scope.func.body.body;
		const declsCleanup = [];
		let movedExpressions = 0;

		for (let elem of body) {
			const orig = elem;

			if (elem.type === 'ExpressionStatement') {
				elem = elem.expression;
			}

			if (elem.type === 'AssignmentExpression' &&
					elem.operator === '=' &&
					elem.left.type === 'Identifier' &&
					decls.has(elem.left.name) &&
					!decls.get(elem.left.name).init) {
				decls.get(elem.left.name).init = elem.right;
				declsCleanup.push(() => {
					let i = body.indexOf(orig);
					body.splice(i, 1);
				});
				movedExpressions++;
			} else if (elem.type === 'ForStatement' &&
					elem.init?.type === 'AssignmentExpression' &&
					decls.has(elem.init.left.name) &&
					!decls.get(elem.init.left.name).init) {
				decls.get(elem.init.left.name).init = elem.init.right;
				declsCleanup.push(() => elem.init = null);
				movedExpressions++;
				break;
			} else if (elem.type === 'ForStatement' &&
					elem.init?.type === 'SequenceExpression') {
				let i = 0;
				for (let expr of elem.init.expressions) {
					if (decls.has(expr.left.name) &&
							!decls.get(expr.left.name).init) {
						decls.get(expr.left.name).init = expr.right;
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
			} else {
				break;
			}
		}

		if (scope.func.params[scope.func.params.length - 1]?.type !== 'RestElement' &&
				movedExpressions <= 4) {
			scope.func.params.push(...ret);
		} else {
			for (let c of declsCleanup) c();
			body.unshift(t.variableDeclaration('var', [...decls.values()]));
		}
	};

	traverse(ast.program.assignment);

	return generate.default(ast, {
		sourceMaps: true,
		...options,
	}, source);
};

export default transform;
