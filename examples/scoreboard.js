import { html, OArray, OObject, Observer } from 'destam-dom';

const scores = OArray([
	OObject({ name: "Mark", score: 3 }),
	OObject({ name: "Troy", score: 2 }),
	OObject({ name: "Jenny", score: 1 }),
	OObject({ name: "David", score: 8 })
]);

const newPlayer = Observer.mutable(OObject({ name: "", score: 0 }));

// Map `newPlayer` to resolve to its internal observer and unwrap for direct field access
const newPlayerObserver = newPlayer.map(player => player.observer).unwrap();

const Input = ({ value, ...props }) => {
	return html`
		<input $value=${value} $oninput=${e => {
			if (props.type === 'number') {
				value.set(parseInt(e.target.value) || 0);
			} else {
				value.set(e.target.value);
			}
		}} =${props} />
	`;
};

const Player = ({ each }) => {
	return html`
		<div class=player style="transition: all 250ms ease 0s;">
			<div class=name>${each.observer.path('name')}</div>
			<div class=score>${each.observer.path('score')}</div>
		</div>
	`;
};

const PlayerAdmin = ({ each }) => {
	return html`
		<div class=player>
			${each.observer.path('name')}
			<${Input} value=${each.observer.path('score')} type=number />
			<button $onclick=${() => {
				let i = scores.indexOf(each);
				scores.splice(i, 1);
			}}>x</button>
		</div>
	`;
};

export default html`
	<${Player} each=${scores.observer.skip().path('score').map(() => scores.toSorted((a, b) => b.score - a.score))} />

	<div class=admin>
		<${PlayerAdmin} each=${scores} />
		<div class=edit>
			<${Input} value=${newPlayerObserver.path('name')} placeholder="Player name..." />
			<${Input} value=${newPlayerObserver.path('score')} type=number />
			<button $onclick=${() => {
				scores.push(newPlayer.get()); // Push the existing OObject to scores
				newPlayer.set(OObject({ name: "", score: 0 })); // Reassign newPlayer with a fresh OObject
			}}>Add player</button>
		</div>
	</div>
`;
