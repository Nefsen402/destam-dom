import {html, mount, OArray, OObject, Observer} from 'destam-dom';

const scores = OArray([
	OObject({ name: "Mark", score: 3 }),
	OObject({ name: "Troy", score: 2 }),
	OObject({ name: "Jenny", score: 1 }),
	OObject({ name: "David", score: 8 })
]);

const Input = ({value, ...props}) => {
	return html`
		<input $value=${value} $oninput=${e => {
			if (props.type === 'number') {
				value.set(parseInt(e.target.value));
			} else {
				value.set(e.target.value)
			}
		}} =${props} />
	`;
}

const Player = ({each}) => {
	return html`
		<div class=player style="transition: all 250ms ease 0s;">
			<div class=name>${each.observer.path('name')}</>
			<div class=score>${each.observer.path('score')}</>
		</>
	`;
};

const PlayerAdmin = ({each}) => {
	return html`
		<div class=player>
			${each.observer.path('name')}
			<${Input} value=${each.observer.path('score')} type=number />
			<button $onclick=${e => {
				let i = scores.indexOf(each);
				scores.splice(i, 1);
			}}>x</button>
		</>
	`;
};

const newPlayerName = Observer.mutable("");
const newPlayerScore = Observer.mutable("");

mount(document.body, html`
	<${Player} each=${scores.observer.skip().path('score').map(() => scores.toSorted((a, b) => b.score - a.score))} />

	<div class=admin>
		<${PlayerAdmin} each=${scores} />
		<div class=edit>
			<${Input} value=${newPlayerName} placeholder="Player name..." />
			<${Input} value=${newPlayerScore} type=number />
			<button $onclick=${() => {
				scores.push(OObject({name: newPlayerName.get(), score: newPlayerScore.get()}))
				newPlayerName.set("");
				newPlayerScore.set("");
			}}>Add player</button>
		</div>
	</>
`);
