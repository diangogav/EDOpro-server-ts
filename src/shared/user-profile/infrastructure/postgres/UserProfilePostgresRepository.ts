import { IsNull, MoreThan } from "typeorm";

import { dataSource } from "../../../../evolution-types/src/data-source";
import { UserBanEntity } from "../../../../evolution-types/src/entities/UserBanEntity";
import { UserProfileEntity } from "../../../../evolution-types/src/entities/UserProfileEntity";
import { UserProfile } from "../../domain/UserProfile";
import { UserProfileRepository } from "../../domain/UserProfileRepository";

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

	async isBanned(userId: string): Promise<boolean> {
		const repository = dataSource.getRepository(UserBanEntity);
		const now = new Date();
		const activeBan = await repository.findOne({
			where: {
				user: { id: userId },
				expiresAt: IsNull() as any,
			},
		});
		if (activeBan) {
			return true;
		}
		// Buscar baneos con expiresAt en el futuro
		const futureBan = await repository.findOne({
			where: {
				user: { id: userId },
				expiresAt: MoreThan(now) as any,
			},
		});

		return !!futureBan;
	}
}
