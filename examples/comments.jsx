import {mount, OArray, Observer, OObject} from 'destam-dom';

const CommentPoster = ({postComment, postName="Post"}) => {
	const value = Observer.mutable("");

	return <div>
		<textarea $value={value} $oninput={e => value.set(e.target.value)} />
		<button $onclick={() => {
			postComment(OObject({
				votes: 1,
				message: value.get(),
				replies: OArray(),
			}));

			value.set("");
		}}>{postName}</button>
	</div>;
}

const CommentList = ({comments, postName}) => {
	const Comment = ({each: comment}) => {
		return <>
			<div $style={{
				display: 'flex',
				flexDirection: 'row',
			}}>
				<div $style={{
					display: 'flex',
					flexDirection: 'column',
					alignItems: 'center',
					width: '20px',
				}}>
					<span style="cursor: pointer" $onclick={() => comment.votes++}>🡱</span>
					<span>{comment.observer.path('votes')}</span>
					<span style="cursor: pointer" $onclick={() => comment.votes--}>🡳</span>
				</div>
				<div $style={{
					padding: '10px',

				}}>{comment.observer.path('message')}</div>
			</div>
			<CommentList comments={comment.replies} postName="Reply" />
		</>;
	};

	return <div $style={postName === 'Reply' && {marginLeft: '10px', paddingLeft: '10px', borderLeft: 'solid 1px grey'}}>
		<Comment each={comments} />
		<CommentPoster postComment={comment => comments.push(comment)} postName={postName}/>
	</div>;
}

mount(document.body, <CommentList comments={OArray()} />);
