import "reflect-metadata";

import { faker } from "@faker-js/faker";
import { Pino } from "src/shared/logger/infrastructure/Pino";
import { UserProfileCreator } from "src/shared/user-profile/application/UserProfileCreator";
import { UserProfilePostgresRepository } from "src/shared/user-profile/infrastructure/postgres/UserProfilePostgresRepository";

import { PostgresTypeORM } from "../evolution-types/src/PostgresTypeORM";

const logger = new Pino();
const postgresDatabase = new PostgresTypeORM();
async function run() {
	await postgresDatabase.connect();
	const userProfileCreator = new UserProfileCreator(new UserProfilePostgresRepository());

	const password = faker.internet.password();
	const username = faker.internet.userName();
	const email = faker.internet.email();

	await userProfileCreator.run({
		username,
		password,
		email,
		avatar: null,
	});

	logger.info(`Creating user with: username: ${username} password: ${password} email: ${email}`);
}

run()
	.then(async () => {
		logger.info("User created");
		await postgresDatabase.close();
	})
	.catch(async (error) => {
		logger.error(error as Error);
		await postgresDatabase.close();
	});
