import {Observer} from 'destam-dom';

const RadioButton = ({value, name}) => {
	return <>
		<input name={name} type="radio" $checked={value} $onclick={() => value.set(name)} />
		<label for={name}>{name}</label>
		<br/>
	</>;
};

const selected = Observer.mutable(null);
const selector = selected.selector();

const List = ({each}) => {
	return <RadioButton value={selector(each)} name={each} />;
};

export default <>
	<List each={Array.from(Array(10), (_, i) => i)} />
</>;
