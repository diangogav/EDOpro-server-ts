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
		const userProfileEntity = new UserProfileEntity();
		userProfileEntity.id = userProfile.id;
		userProfileEntity.username = userProfile.username;
		userProfileEntity.password = userProfile.password;
		userProfileEntity.email = userProfile.email;
		userProfileEntity.avatar = userProfile.avatar;

		const repository = dataSource.getRepository(UserProfileEntity);
		await repository.save(userProfileEntity);
	}
}
