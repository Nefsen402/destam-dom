import { resolve, join } from 'path'
import { defineConfig } from 'vite'
import unsafeVars from './transform/unsafeVariables';
import assertRemove from './transform/assertRemove';
import staticMount from './transform/staticMount';
import compileHTMLLiteral from './transform/htmlLiteral';
import fs from 'fs';

const createTransform = (name, transform, jsx, options) => ({
	name,
	transform(code, id) {
		if (id.endsWith('.js') || (jsx && id.endsWith('.jsx'))) {
			const transformed = transform(code, {
				sourceFileName: id,
				plugins: id.endsWith('.jsx') ? ['jsx'] : [],
				...options,
			});
			return {
				code: transformed.code,
				map: transformed.decodedMap,
			};
		}
	}
});

const libs = {
	destamd: {
		entry: resolve(__dirname, 'index.js'),
		fileName: 'destam-dom',
	},
};

const lib = process.env.LIB;

let config;
if (lib in libs) {
	config = defineConfig({
		define: {
			'process.env.NODE_ENV': '"development"',
		},
		plugins: !process.env.N_DEBUG ? [] : [
			createTransform('assert-remove', assertRemove),
			{
				name: 'unsafe-vars',
				renderChunk: (code, chunk, options) => {
					const transformed = unsafeVars(code, {
						sourceFileName: chunk.fileName,
					});

					return {
						code: transformed.code,
						map: transformed.decodedMap,
					};
				},
			},
		],
		build: {
			minify: 'terser',
			target: 'es2020',
			terserOptions: {
				compress: {
					unsafe_math: true,
					unsafe_comps: true,
					unsafe_symbols: true,
					ecma: 2020,
					passes: 2,
				},
				mangle: {
					properties: {
						regex: /_$/,
					}
				}
			},
			lib: {
				...libs[lib],
				name: lib,
				formats: process.env.FORMATS?.split(',') || ['es', 'iife', 'umd'],
			},
			sourcemap: true,
		},
	});
} else {
	const getExample = (file) => {
		if (file === '/') file = '/index.html';
		if (!file.startsWith('/') || !file.endsWith('.html')) return null;

		file = file.substring(1);
		let i = file.lastIndexOf('.');
		const name = file.substring(0, i);

		const existed = ['.js', '.jsx'].find(ex => fs.existsSync('examples/' + name + ex));
		if (!existed) {
			return null;
		}

		const relative = '/' + name + '.html';
		return {
			name,
			file: name + existed,
			relative,
			location: resolve(__dirname, '/examples/' + name + existed),
			resolved: join(__dirname, relative),
		};
	};

	let examples;
	const getExamples = () => {
		if (examples) {
			return examples;
		}

		return examples = fs.readdirSync(resolve(__dirname, 'examples')).map(file => {
			let i = file.lastIndexOf('.');
			const name = file.substring(0, i);

			return getExample('/' + name + '.html');
		});
	};

	const generateTemplate = (entry, hot) => {
		return `
			<!doctype html>
			<html lang="en">
				${hot ? '<script type="module" src="/@vite/client"></script>' : ""}
				<head>
					<meta charset="UTF-8" />
					<meta name="viewport" content="width=device-width, initial-scale=1.0" />
					<title>Destam-Dom</title>
				</head>
				<body>
					<script type="module">
						import { mount } from './index';
						import example from './examples/${entry.file}';

						mount(document.body, example);
					</script>
				</body>
			</html>
		`;
	};

	config = defineConfig({
		optimizeDeps: {
			include: [],
			noDiscovery: true,
		},
		plugins: [
			...(process.env.N_DEBUG ? [createTransform('assert-remove', assertRemove)] : []),
			createTransform('transform-literal-html', compileHTMLLiteral, true, {
				jsx_auto_import: {h: 'destam-dom'},
			}),
			{
				name: 'examples',
				resolveId (id) {
					let found = getExamples().find(ex => ex.resolved === id);
					if (found) {
						return found.resolved;
					}
				},
				load(id) {
					let found = getExamples().find(ex => ex.resolved === id);
					if (found) return generateTemplate(found);
				},
				configureServer(server) {
					server.middlewares.use((req, res, next) => {
						let found = getExample(req.originalUrl);
						if (found) {
							res.end(generateTemplate(found, true));
						} else {
							next();
						}
					});
				},
			},
			...(process.env.STATIC_ANALYZE ? [createTransform('static-mount', staticMount, true, {
				util_import: 'destam-dom'
			})] : []),
		],
		esbuild: {
			jsx: 'preserve',
		},
		build: {
			rollupOptions: {
				input: Object.fromEntries(getExamples().map(ex => [ex.name, ex.resolved])),
			},
		},
		resolve: {
			alias: [
				{find: /^destam-dom($|\/)/, replacement: '/'},
			]
		}
	});

}

export default config;
