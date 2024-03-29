import {Observer, OArray, OObject, html, mount, Delete} from '/index.js';
import createNetwork from 'destam/Tracking';

const TodoItem = ({each: item}) => {
	return html`<li
		style=${{
			'text-decoration': item.observer.path('completed').map(c => c ? 'line-through' : 'none')
		}}
		$onclick=${() => {
			item.completed = !item.completed;
		}}
	>${item.observer.path('name')}</li>`
};

const TodoList = ({todos}) => {
	return html`
		<ul>
			<${TodoItem} each=${todos} />
		</ul>
	`;
};

const AddTodo = ({todos}) => {
	let item = Observer.mutable('');

	return html`
		<div>
			<input $value=${item} $onchange=${e => item.set(e.target.value)} />
			<button $onclick=${() => {
				if (!item.get()) return;

				todos.push(OObject({
					completed: false,
					name: item.get(),
				}));

				item.set('');
			}}>Add Todo</button>
		</div>
	`;
};

const TodoFilter = ({filter}) => {
	return html`<div>
		Show:
		<button disabled=${filter.map(f => f === 'all')} $onclick=${() => filter.set('all')}>All</button>
		<button disabled=${filter.map(f => f === 'active')} $onclick=${() => filter.set('active')}>Active</button>
		<button disabled=${filter.map(f => f === 'completed')} $onclick=${() => filter.set('completed')}>Completed</button>
	</div>`;
};

const Undo = ({state}, cleanup) => {
	const history = Observer.mutable([]);
	const historyPos = Observer.mutable(0);
	const network = createNetwork(state.observer);

	cleanup(() => {
		network.remove();
	});

	cleanup(state.observer.watchCommit((commit, args) => {
		if (args === 'is-undo-action') {
			return;
		}

		const pos = historyPos.get();
		history.set(history.get().slice(0, pos).concat([commit]))
		historyPos.set(pos + 1);
	}).remove);

	return html`<div>
		<button disabled=${historyPos.map(p => p === 0)} $onclick=${() => {
			const pos = historyPos.get();
			network.apply(history.get()[pos - 1].map(delta => delta.invert()), 'is-undo-action');
			historyPos.set(pos - 1);
		}}>Undo</button>
		<button disabled=${Observer.all([historyPos, history]).map(([p, h]) => p === h.length)} $onclick=${() => {
			const pos = historyPos.get();
			network.apply(history.get()[pos], 'is-undo-action');
			historyPos.set(pos + 1);
		}}>Redo</button>
	</div>`;
};

const Todo = ({state}) => {
	return html`<div>
		<${AddTodo} todos=${state.todos} />
		<${TodoList} todos=${state.observer.anyPath(['todos'], ['filter']).map(([todos, filt]) => {
			return todos.filter(todo => {
				if (filt === 'completed' && !todo.completed) return false;
				if (filt === 'active' && todo.completed) return false;
				return true;
			});
		})}/>
		<${TodoFilter} filter=${state.observer.path('filter')}/>
		<${Undo} state=${state.todos} />

		All items<br/>
		<${TodoList} todos=${state.todos} />
	</div>`;
};

const state = OObject({
	todos: OArray(),
	filter: 'all',
});

mount(document.body, html`<${Todo} state=${state} />`);
