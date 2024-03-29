export const css = (strs, ...vals) => {
	let text = [];
	for (let i = 0; i < strs.length; i++) {
		text.push(strs[i]);
		if (vals[i]) text.push(vals[i]);
	}

	let style = document.createElement('style');
	style.append(document.createTextNode(text.join('')));
	document.head.append(style);
};
