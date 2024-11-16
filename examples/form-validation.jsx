import {Observer} from 'destam-dom';

const constainsOneOf = (str, chars) => {
	for (let i = 0; i < chars.length; i++) {
		if (str.includes(chars[i])) return true;
	}

	return false;
}

const Input = ({value, ...props}) => {
	return <input $value={value} $oninput={e => value.set(e.target.value)} {...props} />;
};

const Visible = ({value, children}) => {
	return value.map(vis => {
		if (!vis) return null;

		return children;
	});
};

const ErrorMessage = ({value, message}) => {
	return <Visible value={value}>
		<div>
			<span>{message}</span>
		</div>
	</Visible>;
};

const Form = ({}, cleanup) => {
	const password = Observer.mutable('');
	const retypePassword = Observer.mutable('');

	const errors = [
		{message: "The password must be at least 8 characters", value: password.map(pass => {
			return pass.length < 8;
		})},
		{message: "The password must have at least one number", value: password.map(pass => {
			return !constainsOneOf(pass, "0123456789");
		})},
		{message: "The password must have at least one uppercase letter", value: password.map(pass => {
			return !constainsOneOf(pass, "ABCDEFGHIJKLMNOPQRSTUVWXYZ");
		})},
		{message: "The password must have at least one lowercase letter", value: password.map(pass => {
			return !constainsOneOf(pass, "abcdefghijklmnopqrstuvwxyz");
		})},
	];

	const isRetype = Observer.all(errors.map(e => e.value)).map(vals => !vals.includes(true)).memo();
	const doesntMatch = Observer.all([password, retypePassword])
		.map(([pass, retype]) => pass !== retype);

	// if the user added an error to the password, reset the retypePassword field
	cleanup(isRetype.watch(() => {
		if (!isRetype.get()) {
			retypePassword.set('');
		}
	}));

	return <>
		<Input value={password} type="password" />
		{errors.map(props => <ErrorMessage {...props} />)}
		<Visible value={isRetype}>
			<div>
				Retype your password
			</div>
			{/* if there are no errors with the password, prompt the user to retype the password */}
			<Input value={retypePassword} type="password" />
			<ErrorMessage
				message="The passwords must match"
				value={Observer.all([doesntMatch, retypePassword])
					.map(([match, retype]) => retype !== '' && match)}
			/>

			<Visible value={doesntMatch.map(e => !e)}>
				<div>Your chosen password is {password}</div>
			</Visible>
		</Visible>
	</>;
};

export default <Form />;
