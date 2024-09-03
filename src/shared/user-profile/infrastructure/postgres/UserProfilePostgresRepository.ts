import { dataSource } from "src/shared/db/postgres/infrastructure/data-source";

import { UserProfile } from "../../domain/UserProfile";
import { UserProfileRepository } from "../../domain/UserProfileRepository";
import { UserProfileEntity } from "./UserProfileEntity";

export class UserProfilePostgresRepository implements UserProfileRepository {
	async findByUsername(username: string): Promise<UserProfile | null> {
		const repository = dataSource.getRepository(UserProfileEntity);
		const userProfileEntity = await repository.findOneBy({ username });
		if (!userProfileEntity) {
			return null;
		}

		return UserProfile.from(userProfileEntity);
	}

	async create(userProfile: UserProfile): Promise<void> {
		const repository = dataSource.getRepository(UserProfileEntity);
		const userProfileEntity = repository.create({
			id: userProfile.id,
			username: userProfile.username,
			password: userProfile.password,
			email: userProfile.email,
			avatar: userProfile.avatar,
		});
		await repository.save(userProfileEntity);
	}
}
