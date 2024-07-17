import {mount, Observer} from 'destam-dom';

const loadCats = async () => {
	// simulate a slow network request
	await new Promise(ok => setTimeout(ok, 2000));

	return await Promise.all([
		"https://i.imgur.com/7juREyw.png",
		"https://i.imgur.com/e7RuRS3.jpeg",
		"https://i.imgur.com/rIvncBR.jpeg",
		"https://i.imgur.com/SShqFbG.jpeg",
		"https://i.imgur.com/ntcPeAS.jpeg",
		"https://i.imgur.com/fwuR43x.jpeg",
	].map(src => new Promise(ok => {
		const image = <img $onload={() => ok(image)} />;
		image.src = src;
	})));
};

const suspense = (fallback, cb) => props => {
	const res = Promise.resolve(cb(props));
	const out = Observer.mutable(fallback(props));

	res.then(out.set);
	return out.unwrap();
};

const Loading = () => {
	return Observer.timer(250).map(i => "Loading cats" + '...'.substring(0, i % 4));
};

const Cats = suspense(Loading, async () => {
	const cats = await loadCats();

	return cats.map(Cat => {
		return <Cat style="width: 250px" />;
	});
});

mount(document.body, <Cats />);
