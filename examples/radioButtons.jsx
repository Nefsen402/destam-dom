import {h, mount, Observer} from 'destam-dom';

const RadioButton = ({value, name}) => {
	return <>
		<input name={name} type="radio" $checked={value} $onclick={() => value.set(true)} />
		<label for={name}>{name}</label>
		<br/>
	</>;
};

const selected = Observer.mutable(null);
const selector = selected.selector();

const List = ({each}) => {
	return <RadioButton value={selector(each)} name={each} />;
};

mount(document.body, <>
	<List each={Array.from(Array(10), (_, i) => i)} />
</>);
