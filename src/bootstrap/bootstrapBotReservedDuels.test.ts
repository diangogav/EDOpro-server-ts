import { Redis } from "@shared/db/redis/infrastructure/Redis";
import { ReservedDuelServices } from "@shared/reserved-duel/application/ReservedDuels";
import { RESERVATION_OPEN_CHANNEL } from "@shared/reserved-duel/domain/Reservation";
import { LoggerMock } from "@test-support/mocks/logger/LoggerMock";
import { WindbotModule } from "@ygopro/windbot/application/WindbotModule";

import { bootstrapBotReservedDuels } from "./bootstrapBotReservedDuels";

jest.mock("@shared/db/redis/infrastructure/Redis", () => ({
	Redis: { getInstance: jest.fn() },
}));

const subscriber = { on: jest.fn(), subscribe: jest.fn().mockResolvedValue(1) };
const services = {} as ReservedDuelServices;
const windbot = (enabled: boolean) => ({ isEnabled: () => enabled }) as unknown as WindbotModule;

beforeEach(() => {
	jest.clearAllMocks();
	(Redis.getInstance as jest.Mock).mockReturnValue({ duplicate: () => subscriber });
});

describe("bootstrapBotReservedDuels", () => {
	it("subscribes on its own connection when reserved duels and WindBot are on", async () => {
		const started = await bootstrapBotReservedDuels(services, windbot(true), new LoggerMock());

		expect(started).not.toBeNull();
		expect(subscriber.subscribe).toHaveBeenCalledWith(RESERVATION_OPEN_CHANNEL);
	});

	it.each([
		["reserved duels are off", null, windbot(true)],
		["WindBot is missing", services, undefined],
		["WindBot is disabled", services, windbot(false)],
	])("stays off when %s", async (_case, reserved, bot) => {
		expect(await bootstrapBotReservedDuels(reserved, bot, new LoggerMock())).toBeNull();
		expect(subscriber.subscribe).not.toHaveBeenCalled();
	});
});
