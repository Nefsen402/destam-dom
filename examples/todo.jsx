import {Observer, Delete} from 'destam-dom';
import createNetwork from 'destam/Tracking';

// Use obsevers directly from destam because the ones that destam-dom provides
// are simplified for more optimal operation in the common case.
//
// They don't generate IDs that are required for destam/Tracking to work.
import OObject from 'destam/Object';
import OArray from 'destam/Array';

const TodoItem = ({each: item}) => {
	return <li
		$style={{
			'text-decoration': item.observer.path('completed').map(c => c ? 'line-through' : 'none')
		}}
		$onclick={() => {
			item.completed = !item.completed;
		}}
	>{item.observer.path('name')}</li>;
};

const TodoList = ({todos}) => {
	return <ul>
		<TodoItem each={todos} />
	</ul>;
};

const AddTodo = ({todos}) => {
	let item = Observer.mutable('');

	return <div>
		<input $value={item} $onchange={e => item.set(e.target.value)} />
		<button $onclick={() => {
			if (!item.get()) return;

			todos.push(OObject({
				completed: false,
				name: item.get(),
			}));

			item.set('');
		}}>Add Todo</button>
	</div>;
};

const TodoFilter = ({filter}) => {
	return <div>
		Show:
		<button disabled={filter.map(f => f === 'all')} $onclick={() => filter.set('all')}>All</button>
		<button disabled={filter.map(f => f === 'active')} $onclick={() => filter.set('active')}>Active</button>
		<button disabled={filter.map(f => f === 'completed')} $onclick={() => filter.set('completed')}>Completed</button>
	</div>;
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
	}));

	return <div>
		<button disabled={historyPos.map(p => p === 0)} $onclick={() => {
			const pos = historyPos.get();
			network.apply(history.get()[pos - 1].map(delta => delta.invert()), 'is-undo-action');
			historyPos.set(pos - 1);
		}}>Undo</button>
		<button disabled={Observer.all([historyPos, history]).map(([p, h]) => p === h.length)} $onclick={() => {
			const pos = historyPos.get();
			network.apply(history.get()[pos], 'is-undo-action');
			historyPos.set(pos + 1);
		}}>Redo</button>
	</div>;
};

const Todo = ({state}) => {
	return <div>
		<AddTodo todos={state.todos} />
		<TodoList todos={Observer.all([
			state.observer.path('todos'),
			state.observer.path('filter'),
		]).map(([todos, filt]) => {
			return todos.filter(todo => {
				if (filt === 'completed' && !todo.completed) return false;
				if (filt === 'active' && todo.completed) return false;
				return true;
			});
		})}/>
		<TodoFilter filter={state.observer.path('filter')}/>
		<Undo state={state.todos} />

		All items<br/>
		<TodoList todos={state.todos} />
	</div>;
};

const state = OObject({
	todos: OArray(),
	filter: 'all',
});

export default <Todo state={state} />;
