/* node:coverage disable */

import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {describe, it} from 'node:test';
import {transformBabelAST as staticMount} from '../transform/staticMount.js';
import {transformBabelAST as htmlLiteral} from '../transform/htmlLiteral.js';
import parser from '@babel/parser';
import t from '@babel/types';
import generate from '@babel/generator';

const files = fs.readdirSync(path.resolve(fileURLToPath(import.meta.url), '..'));

const transform = (file, options) => async () => {
	let source = fs.readFileSync(path.resolve(fileURLToPath(import.meta.url), '..', file)).toString();
	const ast = parser.parse(source, {
		sourceType: 'module',
		code: false,
		ast: true,
		plugins: file.endsWith('.jsx') ? ['jsx'] : [],
	});

	htmlLiteral(ast);

	if (!file.endsWith('.jsx')) {
		staticMount(ast, options);
	}

	const context = {};

	// replace imports
	for (let i = 0; i < ast.program.body.length; i++) {
		const child = ast.program.body[i];
		if (child.type === 'ImportDeclaration') {
			ast.program.body.splice(i--, 1);

			const mod = options.override_import?.[child.source.value] || await import(child.source.value);
			for (const spec of child.specifiers) {
				if (!spec.imported) {
					context[spec.local.name] = mod.default;
				} else {
					context[spec.local.name] = mod[spec.imported.name];
				}
			}
		}
	}

	const code = generate.default(ast, {}, source).code;

	for (let o in global) {
		if (!(o in context)) context[o] = global[o];
	}

	if (context.test) context.test = (name, impl) => {
		it(name, () => {
			try {
				return impl();
			} catch (e) {
				console.log(code.split('\n').map((line, num) => (num + 1) + " " + line).join("\n"));
				throw e;
			}
		});
	};

	const script = new vm.Script(code, {
		filename: file,
	});

	vm.createContext(context);
	script.runInContext(context);
}

const iife = path.resolve(fileURLToPath(import.meta.url), '../../dist/destam-dom.iife.js');
if (fs.existsSync(iife)) {
	const script = new vm.Script(fs.readFileSync(iife), {
		filename: 'destam-dom.iife.js',
	});

	script.runInThisContext();
}

for (const file of files) {
	if (file === 'transform.test.js') continue;
	if (!file.endsWith('.test.js') && !file.endsWith('.test.jsx')) continue;

	describe("transform with util " + file, transform(file, {
		util_import: '..',
		assure_import: /^\.\.\/index\.js$/,
	}));

	describe("transform " + file, transform(file, {
		assure_import: /^\.\.\/index\.js$/,
	}));

	if ([
		'custom_element.test.js',
		'array.test.js',
		'array_reconciliation.test.js',
		'replacement.test.js',
		'static.test.js',
	].includes(file)) {
		describe("iife " + file, transform(file, {
			assure_import: /^$/,
			override_import: {
				'../index.js': global.destamd,
			}
		}));
	}
}
