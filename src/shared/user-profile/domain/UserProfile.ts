import bcrypt from "bcrypt";

export class UserProfile {
	readonly id: string;
	readonly username: string;
	readonly password: string;
	readonly email: string;
	readonly avatar: string | null;

	private constructor({
		id,
		username,
		password,
		email,
		avatar,
	}: {
		id: string;
		username: string;
		password: string;
		email: string;
		avatar: string | null;
	}) {
		this.id = id;
		this.username = username;
		this.password = password;
		this.email = email;
		this.avatar = avatar;
	}

	static create({
		id,
		username,
		password,
		email,
		avatar,
	}: {
		id: string;
		username: string;
		password: string;
		email: string;
		avatar: string | null;
	}): UserProfile {
		const passwordHashed = bcrypt.hashSync(password, 10);

		return new UserProfile({
			id,
			username,
			password: passwordHashed,
			email,
			avatar,
		});
	}

	static from(data: {
		id: string;
		username: string;
		password: string;
		email: string;
		avatar: string | null;
	}): UserProfile {
		return new UserProfile(data);
	}

	isValidPassword(password: string): boolean {
		return bcrypt.compareSync(password, this.password);
	}
}
