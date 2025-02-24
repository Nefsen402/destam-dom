import {Observer, OArray, OObject, html} from 'destam-dom';

const Input = ({value, ref, enter, keydown, cancel}, cleanup, mounted) => {
	const input = ref || document.createElement('input');

	mounted(() => {
		input.focus();
		requestIdleCallback(() => input.setSelectionRange(0, input.value.length));
	});

	return html`
		<${input}
			$style="height: 35px; width: 90%;"
			$value=${value}
			$oninput=${e => {
				value.set(e.target.value);
			}}
			$onkeydown=${e => {
				if (keydown) keydown(e);

				if (e.key === 'Escape') {
					if (cancel) cancel();
				}

				if (e.key === 'Enter' && value.get()) {
					enter(value.get());
				}
			}}
			$onblur=${cancel}
		/>
	`;
}

const Message = ({each: item}) => {
	return html `
		${item.observer.path('editing').map(e => e != null).memo().map(editing => {
			if (!editing) {
				return html`${item.observer.path('text')}`;
			}

			return html`
				<${Input}
					value=${item.observer.path('editing')}
					enter=${text => {
						item.text = text;
						item.editing = undefined;
					}}
					cancel=${() => {
						item.editing = undefined;
					}}
					keydown=${e => {
						if (e.key === 'ArrowUp') {
							if (item.prev) {
								item.prev.editing = item.prev.text;
								item.editing = undefined;
							}
						} else if (e.key === 'ArrowDown') {
							if (item.next) {
								item.next.editing = item.next.text;
							}
							item.editing = undefined;
						}
					}}
				/>
			`;
		}).unwrap()}
		<br/>
	`
};

const Center = ({children, $style}) => {
	return html`
		<div $style=${{
			left: "50%",
			top: "50%",
			position: "relative",
			transform: "translate(-50%, -50%)",
			...$style,
		}}>
			${children}
		</div>
	`;
};

const App = ({}, cleanup) => {
	const currentMessage = Observer.mutable('');
	const messages = OArray();
	const input = document.createElement('input');

	cleanup(messages.observer.skip().path('editing').watchCommit(() => {
		for (let i = 0; i < messages.length; i++) {
			if (messages[i].editing !== undefined) return;
		}

		input.focus();
	}));

	return html`
		<${Message} each=${messages} />
		<div $style=${{
			position: "absolute",
			bottom: "0px",
			left: "0px",
			right: "0px",
			height: "60px",
			background: '#666',
		}}>
			<${Center}>
				<${Input}
					ref=${input}
					enter=${(text) => {
						let msg = OObject({
							text,
							date: new Date(),
							prev: messages[messages.length - 1],
						});

						if (messages.length) messages[messages.length - 1].next = msg;
						messages.push(msg);
						currentMessage.set('');
					}}
					keydown=${e => {
						if (e.key === 'ArrowUp') {
							let msg = messages[messages.length - 1];
							msg.editing = msg.text;
						}
					}}
					value=${currentMessage}
				/>
			</>
		</div>
	`;
};

export default html`<${App} />`;
