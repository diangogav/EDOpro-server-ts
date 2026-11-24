import bcrypt from "bcrypt";

import { isVerifiedAccount } from "./VerifiedAccount";

export type UserProfileProperties = {
	id: string;
	username: string;
	password: string;
	email: string;
	avatar: string | null;
	emailVerifiedAt?: Date | null;
	discordId?: string | null;
	createdAt?: Date | null;
};
export class UserProfile {
	readonly id: string;
	readonly username: string;
	readonly password: string;
	readonly email: string;
	readonly avatar: string | null;
	readonly emailVerifiedAt: Date | null;
	readonly discordId: string | null;
	readonly createdAt: Date | null;

	private constructor({
		id,
		username,
		password,
		email,
		avatar,
		emailVerifiedAt,
		discordId,
		createdAt,
	}: UserProfileProperties) {
		this.id = id;
		this.username = username;
		this.password = password;
		this.email = email;
		this.avatar = avatar;
		this.emailVerifiedAt = emailVerifiedAt ?? null;
		this.discordId = discordId ?? null;
		this.createdAt = createdAt ?? null;
	}

	static async create({
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
	}): Promise<UserProfile> {
		const passwordHashed = await bcrypt.hash(password, 10);

		return new UserProfile({
			id,
			username,
			password: passwordHashed,
			email,
			avatar,
		});
	}

	static from(data: UserProfileProperties): UserProfile {
		return new UserProfile(data);
	}

	isVerified(cutoff: Date | null): boolean {
		return isVerifiedAccount(this, cutoff);
	}

	async isValidPassword(password: string): Promise<boolean> {
		return bcrypt.compare(password, this.password);
	}
}
