import OArray from 'destam/Array';
import * as Network from 'destam/Network';
import {Insert, Modify, Delete} from 'destam/Events';

import 'destam/Tracking';

const cloneEvent = (event) => {
	const e = event.constructor();
	e.value = event.value;
	e.ref = event.ref;
	e.time = event.time;
	e.network_ = event.network_;
	e.id = event.id;
	return e;
};

const observify = obj => {
	const mapped = obj.observer.source_();

	const handleCommit = (commit, args) => {
		const events = [];

		for (let delta of commit) {
			if (delta instanceof Modify) continue;

			delta = cloneEvent(delta);
			if (delta instanceof Insert) {
				delta.value = obj.observer.path([delta.ref]);
			}
			
			const link = mapped.observer.source_.verify(mapped.observer, delta);
			mapped.observer.source_.apply(mapped.observer, delta, link, events);
		}

		Network.callListeners(events, args);
	};

	const initial = [];
	for (let link = obj.observer.linkNext_; link !== obj.observer; link = link.linkNext_) {
		initial.push(Insert(null, null, link.query_));
	}

	handleCommit(initial);
	obj.observer.skip().shallow().watchCommit(handleCommit);
	return mapped;
};

const subnetMask = subnet => (1n << BigInt(subnet)) - 1n;

const indexOf = (str, char) => {
	const index = str.indexOf(char);
	if (index === -1) return str.length;
	return index;
};

const parseIP = (ip) => {
	let subnet = null;
	const subnetLoc = ip.indexOf('/');
	if (subnetLoc > 0) {
		subnet = subnetLoc + 1 === ip.length ? null : parseInt(ip.substring(subnetLoc + 1));
		ip = ip.substring(0, subnetLoc);
	}

	let val = 0n;
	let valPos = 0;
	let extend = null;
	let prevChar;

	while(ip) {
		const next = Math.min(indexOf(ip, '.'), indexOf(ip, ':'));
		const nextChar = ip[next] ?? prevChar;

		if (valPos !== 0 && next === 0 && ip[next] === ':') {
			extend = (extend ?? 0n) | val;
			val = 0n;
		} else {
			let num, len;
			if (nextChar === ':') {
				num = parseInt(ip.substring(0, next), 16);
				len = 16;
			} else {
				num = parseInt(ip.substring(0, next));
				len = 8;
			}

			for (let i = len - 1; i >= 0; i--) {
				val |= BigInt(((num >> i) & 1)) << BigInt(valPos++);
			}
		}

		ip = ip.substring(next + 1);
		prevChar = nextChar;
	}

	if (extend !== null) {
		val = (val << BigInt(128 - valPos)) | extend;
		valPos = 128;
	}

	subnet = subnet === null ? valPos : subnet;
	return {ip: val, subnet, size: Math.max(valPos, subnet)};
};

const stringify = ip => {
	let str;
	if (ip.size <= 32) {
		str = Array(Math.ceil(ip.size / 8)).fill(null).map((_, i) => {
			let num = 0;
			for (let ii = 0; ii < 8; ii++) {
				num = (num << 1) | Number((ip.ip >> BigInt(i * 8 + ii)) & 1n);
			}

			return num.toString(10);
		}).join('.');
	} else {
		const nums = Array(Math.ceil(ip.size / 16)).fill(null).map((_, i) => {
			let num = 0;
			for (let ii = 0; ii < 16; ii++) {
				num = (num << 1) | Number((ip.ip >> BigInt(i * 16 + ii)) & 1n);
			}

			return num.toString(16);
		});

		let seqStart = 0, seqEnd = 0, currentSeqStart = -1, currentSeqEnd = 0;
		for (let i = 0; i < nums.length; i++) {
			if (nums[i] === "0") {
				currentSeqEnd++;
				if (currentSeqEnd - currentSeqStart > seqEnd - seqStart) {
					seqStart = currentSeqStart;
					seqEnd = currentSeqEnd;
				}
			} else {
				currentSeqStart = currentSeqEnd = i;
			}
		}

		if (seqStart !== seqEnd) {
			if (seqStart === -1) {
				nums.splice(0, seqEnd, '', '', ...(seqEnd === nums.length ? [''] : []));
			} else if (seqEnd === nums.length - 1) {
				nums.splice(seqStart + 1, seqEnd - seqStart, '', '');
			} else {
				nums.splice(seqStart + 1, seqEnd - seqStart, '');
			}
		}

		str = nums.join(':');
	}

	if (ip.subnet === ip.size) {
		return str;
	} else {
		return str + '/' + ip.subnet;
	}
};

const getSubnets = (root, ...exclude) => {
	root.size = Math.max(root.size, ...exclude.map(ip => ip.size));
	root.ip = root.ip & subnetMask(root.subnet);

	const list = [];

	const recurse = ip => {
		let hasExclusion = false;
		for (const ex of exclude) {
			const subnet = subnetMask(Math.min(ip.subnet, ex.subnet));
			if ((ip.ip & subnet) === (ex.ip & subnet)) {
				if (ip.subnet >= ex.subnet) return;
				hasExclusion = true;
			}
		}

		if (!hasExclusion) {
			list.push(ip);
			return;
		}

		recurse({ip: ip.ip, subnet: ip.subnet + 1, size: ip.size});
		recurse({ip: ip.ip | (1n << BigInt(ip.subnet)), subnet: ip.subnet + 1, size: ip.size});
	};

	recurse(root);
	return list;
};

const ips = OArray(['']);
const IP = ({each: str}) => {
	return <><input type="text" $value={str} $oninput={e => str.set(e.target.value)} /><br /></>;
};

export default <>
	<IP each={observify(ips)} />
	<button $onclick={() => {
		ips.push('');
	}}>Add exclusion</button>
	<button $onclick={() => {
		ips.pop();
	}}>Remove exclusion</button>

	{ips.observer.skip().map(() => {
		return getSubnets(...ips.map(parseIP)).map(ip => <><br />{stringify(ip)}</>);
	})}
</>;

