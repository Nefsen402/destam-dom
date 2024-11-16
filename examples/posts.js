import {OArray, OObject, html, Observer} from 'destam-dom';

const posts = OArray();
const loading = Observer.mutable(false);

let start = 0;
const load = () => {
	loading.set(true);
	fetch("https://jsonplaceholder.typicode.com/posts?_limit=4&start=" + start)
		.then(body => body.json())
		.then(newPosts => {
			posts.push(...newPosts);
		})
		.catch(() => {})
		.then(() => loading.set(false));

	start += 4;
};

load();

const currentAdding = OObject({
	title: '',
	body: '',
	error: '',
});

const Input = ({value, style}) => {
	return html`<input
		style=${style}
		$value=${value}
		$oninput=${e => value.set(e.target.value)}
	/>`;
};

export default html`
	<button $onclick=${load}> Load more </button> ${loading.map(loading => loading ? 'Loading...' : null)}
	<div>
		${currentAdding.observer.path('error').map(e => !!e).map(error => {
			if (error) {
				return html`<div style="color: red;">${currentAdding.observer.path('error')}</div>`
			}

			return null;
		})}
		Title: <${Input} value=${currentAdding.observer.path('title')} /><br/>
		Body: <${Input} value=${currentAdding.observer.path('body')} /><br/>
		<button $onclick=${() => {
			if (!currentAdding.title) {
				if (currentAdding.error) {
					currentAdding.error += '...';
				} else {
					currentAdding.error = "The post must have a title";
				}
				return;
			} else {
				currentAdding.error = null;
			}

			posts.push({
				title: currentAdding.title,
				body: currentAdding.body,
			});

			currentAdding.title = currentAdding.body = '';
		}}> Add post</button>
	</div>
	<div style="width: 1400px">
		<${({each: post}) => {
			const {title, body} = post;
			return html`<div style="width: 300px;outline: 2px solid black; display: inline-block; margin: 10px; padding: 5px; vertical-align: top">
				<h2>${title}</h2>
				<p>${body}</p>
				<div style="text-align: center;">
					<button $onclick=${() => {
						const index = posts.indexOf(post);
						if (index >= 0) posts.splice(index, 1);
					}}>Delete</button>
				</div>
			</div>`;
		}} each=${posts} />
	</div>
`;
