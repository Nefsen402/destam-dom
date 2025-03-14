import {html, Observer} from 'destam-dom';

const text = Observer.mutable('');

export default html`
	<input $value=${text} $oninput=${e => text.set(e.target.value)} />
	<button $onclick=${() => text.set(String(BigInt(text.get()) + 1n))}>Increment</button>
	<p>${null}</p>
	<p>${text}</p>
	<p>${text.map(text => text.length)}</p>
	<p>${text.map(text => {
		const nums = [];
		const checkPrime = num => {
			if (num in nums) {
				return nums[num];
			}

			for (let i = 2, l = Math.ceil(Math.sqrt(num)); i < l; i++) {
				if (num % i === 0) return nums[num] = false;
			}
			return nums[num] = true;
		};

		let num = BigInt(text);
		if (num === 0n) return "";

		let i = 2;
		const out = [];
		while (num !== 1n) {
			if (checkPrime(i)) {
				if (num % BigInt(i) === 0n) {
					num /= BigInt(i);
					out.push(i, ', ');
				} else {
					i++;
				}
			} else {
				i++;
			}
		}

		out.pop();
		return out;
	})}</p>
`;
