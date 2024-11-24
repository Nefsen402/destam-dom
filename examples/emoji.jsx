import { Observer } from 'destam-dom';

const emojiList = "https://raw.githubusercontent.com/andrewagain/emoji-search/refs/heads/master/src/emojiList.json";

const search = Observer.mutable('');

const Emoji = ({each: {symbol, keywords}}) => {
	return search.map(s => keywords.includes(s) ? symbol : null);
};

const emojis = Observer.mutable([]);
fetch(emojiList).then(b => b.json()).then(content => emojis.set(content));

export default <>
	<input $value={search} $oninput={e => search.set(e.target.value)} />
	<div>
		<Emoji each={emojis} />
	</div>
</>;
