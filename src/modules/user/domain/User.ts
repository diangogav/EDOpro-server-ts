export class User {
	readonly username: string;
	readonly password: string;

	constructor({ username, password }: { username: string; password: string }) {
		this.username = username;
		this.password = password;
	}

	isValidPassword(password: string): boolean {
		return password === this.password;
	}
}
