import { UserProfile } from "../../domain/UserProfile";
import { UserProfilePostgresRepository } from "./UserProfilePostgresRepository";
import { dataSource } from "../../../../evolution-types/src/data-source";

jest.mock("../../../../evolution-types/src/data-source", () => ({
	dataSource: {
		getRepository: jest.fn(),
	},
}));

const makeEntityData = (
	overrides: Partial<{
		id: string;
		username: string;
		password: string;
		email: string;
		avatar: string | null;
	}> = {},
) => ({
	id: "user-123",
	username: "testuser",
	password: "hashed-password",
	email: "test@example.com",
	avatar: null,
	...overrides,
});

describe("UserProfilePostgresRepository", () => {
	let repo: UserProfilePostgresRepository;
	let mockOrmRepo: {
		findOneBy: jest.Mock;
		findOne: jest.Mock;
		create: jest.Mock;
		save: jest.Mock;
	};

	beforeEach(() => {
		jest.clearAllMocks();
		mockOrmRepo = {
			findOneBy: jest.fn(),
			findOne: jest.fn(),
			create: jest.fn(),
			save: jest.fn(),
		};
		(dataSource.getRepository as jest.Mock).mockReturnValue(mockOrmRepo);
		repo = new UserProfilePostgresRepository();
	});

	describe("findById()", () => {
		it("returns a UserProfile when the user exists", async () => {
			const entityData = makeEntityData({ id: "user-123" });
			mockOrmRepo.findOneBy.mockResolvedValue(entityData);

			const result = await repo.findById("user-123");

			expect(result).toBeInstanceOf(UserProfile);
			expect(result?.id).toBe("user-123");
		});

		it("carries the verification facts of the account", async () => {
			const createdAt = new Date("2026-11-01T00:00:00.000Z");
			const emailVerifiedAt = new Date("2026-11-02T00:00:00.000Z");
			mockOrmRepo.findOneBy.mockResolvedValue({
				...makeEntityData(),
				emailVerifiedAt,
				discordId: "discord-1",
				createdAt,
			});

			const result = await repo.findById("user-123");

			expect(result?.emailVerifiedAt).toEqual(emailVerifiedAt);
			expect(result?.discordId).toBe("discord-1");
			expect(result?.createdAt).toEqual(createdAt);
		});

		it("returns null when the user does not exist", async () => {
			mockOrmRepo.findOneBy.mockResolvedValue(null);

			const result = await repo.findById("non-existent-id");

			expect(result).toBeNull();
		});
	});
});
