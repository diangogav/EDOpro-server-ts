import { BanList } from "../../../../../src/modules/ban-list/domain/BanList";
import { GameOverData } from "../../../../../src/modules/room/domain/domain-events/GameOverDomainEvent";
import { RoomRepository } from "../../../../../src/modules/room/domain/RoomRepository";

export class RoomRepositoryMock implements RoomRepository {
	readonly mockSaveMatch = jest.fn();
	readonly mockUpdatePlayerPoints = jest.fn();
	readonly mockUpdatePlayerPointsByBanList = jest.fn();
	readonly mockIncreaseWins = jest.fn();
	readonly mockIncreaseLoses = jest.fn();
	readonly mockIncreaseWinsByBanList = jest.fn();
	readonly mockIncreaseLosesByBanList = jest.fn();

	async saveMatch(id: string, data: GameOverData): Promise<void> {
		await this.mockSaveMatch(id, data);
	}

	async updatePlayerPoints(id: string, points: number): Promise<void> {
		await this.mockUpdatePlayerPoints(id, points);
	}

	async updatePlayerPointsByBanList(id: string, points: number, banList: BanList): Promise<void> {
		await this.mockUpdatePlayerPointsByBanList(id, points, banList);
	}

	async increaseWins(id: string): Promise<void> {
		await this.mockIncreaseWins(id);
	}

	async increaseLoses(id: string): Promise<void> {
		await this.mockIncreaseLoses(id);
	}

	async increaseWinsByBanList(id: string, banList: BanList): Promise<void> {
		await this.mockIncreaseWinsByBanList(id, banList);
	}

	async increaseLosesByBanList(id: string, banList: BanList): Promise<void> {
		await this.mockIncreaseLosesByBanList(id, banList);
	}
}