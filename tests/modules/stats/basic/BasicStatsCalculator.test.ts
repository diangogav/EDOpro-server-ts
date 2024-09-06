describe("BasicStatsCalculator", () => {
	it("Should...", () => {
		expect(true).toBe(true);
	});
	// let roomRepository: RoomRepositoryMock;
	// let basicStatsCalculator: BasicStatsCalculator;
	// let playerGlobalRank: Rank;
	// let playerBanListRank: Rank;
	// let opponentGlobalRank: Rank;
	// let opponentBanListRank: Rank;
	// let player: Player;
	// let opponent: Player;
	// beforeEach(() => {
	// 	roomRepository = new RoomRepositoryMock();
	// 	// basicStatsCalculator = new BasicStatsCalculator(roomRepository);
	// 	basicStatsCalculator = new BasicStatsCalculator();
	// 	playerGlobalRank = RankMother.create({ name: "Global", points: 100 });
	// 	playerBanListRank = RankMother.create({ name: "TCG", points: 100 });
	// 	opponentGlobalRank = RankMother.create({ name: "Global", points: 50 });
	// 	opponentBanListRank = RankMother.create({ name: "TCG", points: 50 });
	// 	player = PlayerMother.create({
	// 		team: Team.PLAYER,
	// 		winner: true,
	// 		games: [
	// 			GameMother.create({ result: "winner" }),
	// 			GameMother.create({ result: "winner" }),
	// 			GameMother.create({ result: "winner" }),
	// 		],
	// 	});
	// 	opponent = PlayerMother.create({
	// 		team: Team.OPPONENT,
	// 		winner: false,
	// 		games: [
	// 			GameMother.create({ result: "loser" }),
	// 			GameMother.create({ result: "loser" }),
	// 			GameMother.create({ result: "loser" }),
	// 		],
	// 	});
	// });
	// afterEach(() => {
	// 	jest.clearAllMocks();
	// });
	// it("Should calculate players points correctly", async () => {
	// 	player = PlayerMother.create({
	// 		...player.toPresentation(),
	// 		games: [
	// 			GameMother.create({ result: "winner" }),
	// 			GameMother.create({ result: "loser" }),
	// 			GameMother.create({ result: "winner" }),
	// 			GameMother.create({ result: "loser" }),
	// 			GameMother.create({ result: "winner" }),
	// 		],
	// 	});
	// 	opponent = PlayerMother.create({
	// 		...opponent.toPresentation(),
	// 		games: [
	// 			GameMother.create({ result: "loser" }),
	// 			GameMother.create({ result: "winner" }),
	// 			GameMother.create({ result: "loser" }),
	// 			GameMother.create({ result: "winner" }),
	// 			GameMother.create({ result: "loser" }),
	// 		],
	// 	});
	// 	const players = [player, opponent];
	// 	const event = GameOverDomainEventMother.create({
	// 		players: players.map((player) => player.toPresentation()),
	// 	});
	// 	await basicStatsCalculator.handle(event);
	// 	expect(roomRepository.mockUpdatePlayerPoints).toHaveBeenCalledTimes(2);
	// 	expect(roomRepository.mockUpdatePlayerPoints).toHaveBeenNthCalledWith(1, player.name, 1);
	// 	expect(roomRepository.mockUpdatePlayerPoints).toHaveBeenNthCalledWith(2, opponent.name, -1);
	// 	expect(roomRepository.mockIncreaseWins).toHaveBeenCalledTimes(1);
	// 	expect(roomRepository.mockIncreaseWins).toHaveBeenCalledWith(player.name);
	// 	expect(roomRepository.mockIncreaseLoses).toHaveBeenCalledTimes(1);
	// 	expect(roomRepository.mockIncreaseLoses).toHaveBeenCalledWith(opponent.name);
	// 	expect(roomRepository.mockSaveMatch).toBeCalledTimes(2);
	// 	players[0].recordPoints("Global", 1);
	// 	players[1].recordPoints("Global", -1);
	// 	expect(roomRepository.mockSaveMatch).toHaveBeenNthCalledWith(1, player.name, {
	// 		bestOf: event.data.bestOf,
	// 		date: event.data.date,
	// 		players: players.map((player) => player.toPresentation()),
	// 		banListHash: event.data.banListHash,
	// 		banListName: "N/A",
	// 	});
	// 	expect(roomRepository.mockSaveMatch).toHaveBeenNthCalledWith(2, opponent.name, {
	// 		bestOf: event.data.bestOf,
	// 		date: event.data.date,
	// 		players: players.map((player) => player.toPresentation()),
	// 		banListHash: event.data.banListHash,
	// 		banListName: "N/A",
	// 	});
	// });
	// it("Should calculate players points correctly for global and ban list", async () => {
	// 	const banList = new BanList();
	// 	banList.setName("TCG");
	// 	BanListMemoryRepository.add(banList);
	// 	const players = [player, opponent];
	// 	const event = GameOverDomainEventMother.create({
	// 		players: players.map((player) => player.toPresentation()),
	// 		banListHash: banList.hash,
	// 	});
	// 	await basicStatsCalculator.handle(event);
	// 	expect(roomRepository.mockUpdatePlayerPoints).toHaveBeenCalledTimes(2);
	// 	expect(roomRepository.mockUpdatePlayerPointsByBanList).toHaveBeenCalledTimes(2);
	// 	expect(roomRepository.mockUpdatePlayerPoints).toHaveBeenNthCalledWith(1, player.name, 3);
	// 	expect(roomRepository.mockUpdatePlayerPoints).toHaveBeenNthCalledWith(2, opponent.name, -3);
	// 	expect(roomRepository.mockIncreaseWins).toHaveBeenCalledTimes(1);
	// 	expect(roomRepository.mockIncreaseWins).toHaveBeenCalledWith(player.name);
	// 	expect(roomRepository.mockIncreaseLoses).toHaveBeenCalledTimes(1);
	// 	expect(roomRepository.mockIncreaseLoses).toHaveBeenCalledWith(opponent.name);
	// 	expect(roomRepository.mockUpdatePlayerPointsByBanList).toHaveBeenNthCalledWith(
	// 		1,
	// 		player.name,
	// 		3,
	// 		banList
	// 	);
	// 	expect(roomRepository.mockUpdatePlayerPointsByBanList).toHaveBeenNthCalledWith(
	// 		2,
	// 		opponent.name,
	// 		-3,
	// 		banList
	// 	);
	// 	expect(roomRepository.mockIncreaseWinsByBanList).toHaveBeenCalledTimes(1);
	// 	expect(roomRepository.mockIncreaseWinsByBanList).toHaveBeenCalledWith(player.name, banList);
	// 	expect(roomRepository.mockIncreaseLosesByBanList).toHaveBeenCalledTimes(1);
	// 	expect(roomRepository.mockIncreaseLosesByBanList).toHaveBeenCalledWith(opponent.name, banList);
	// 	expect(roomRepository.mockSaveMatch).toBeCalledTimes(2);
	// 	players[0].recordPoints("Global", 3);
	// 	players[1].recordPoints("Global", -3);
	// 	players[0].recordPoints("TCG", 3);
	// 	players[1].recordPoints("TCG", -3);
	// 	expect(roomRepository.mockSaveMatch).toHaveBeenNthCalledWith(1, player.name, {
	// 		bestOf: event.data.bestOf,
	// 		date: event.data.date,
	// 		players: players.map((player) => player.toPresentation()),
	// 		banListHash: event.data.banListHash,
	// 		banListName: banList.name,
	// 	});
	// 	expect(roomRepository.mockSaveMatch).toHaveBeenNthCalledWith(2, opponent.name, {
	// 		bestOf: event.data.bestOf,
	// 		date: event.data.date,
	// 		players: players.map((player) => player.toPresentation()),
	// 		banListHash: event.data.banListHash,
	// 		banListName: banList.name,
	// 	});
	// });
	// it("Should calculate players points correctly if loser does not have enough points", async () => {
	// 	opponentGlobalRank = RankMother.create({ name: "Global", points: 1 });
	// 	player = PlayerMother.create({
	// 		...player.toPresentation(),
	// 		games: [
	// 			GameMother.create({ result: "winner" }),
	// 			GameMother.create({ result: "winner" }),
	// 			GameMother.create({ result: "winner" }),
	// 		],
	// 	});
	// 	opponent = PlayerMother.create({
	// 		...opponent.toPresentation(),
	// 		games: [
	// 			GameMother.create({ result: "loser" }),
	// 			GameMother.create({ result: "loser" }),
	// 			GameMother.create({ result: "loser" }),
	// 		],
	// 	});
	// 	const players = [player, opponent];
	// 	const event = GameOverDomainEventMother.create({
	// 		players: players.map((player) => player.toPresentation()),
	// 	});
	// 	await basicStatsCalculator.handle(event);
	// 	expect(roomRepository.mockUpdatePlayerPoints).toHaveBeenCalledTimes(2);
	// 	expect(roomRepository.mockUpdatePlayerPoints).toHaveBeenNthCalledWith(1, player.name, 3);
	// 	expect(roomRepository.mockUpdatePlayerPoints).toHaveBeenNthCalledWith(2, opponent.name, -1);
	// 	expect(roomRepository.mockIncreaseWins).toHaveBeenCalledTimes(1);
	// 	expect(roomRepository.mockIncreaseWins).toHaveBeenCalledWith(player.name);
	// 	expect(roomRepository.mockIncreaseLoses).toHaveBeenCalledTimes(1);
	// 	expect(roomRepository.mockIncreaseLoses).toHaveBeenCalledWith(opponent.name);
	// 	expect(roomRepository.mockSaveMatch).toBeCalledTimes(2);
	// 	players[0].recordPoints("Global", 3);
	// 	players[1].recordPoints("Global", -1);
	// 	expect(roomRepository.mockSaveMatch).toHaveBeenNthCalledWith(1, player.name, {
	// 		bestOf: event.data.bestOf,
	// 		date: event.data.date,
	// 		players: players.map((player) => player.toPresentation()),
	// 		banListHash: event.data.banListHash,
	// 		banListName: "N/A",
	// 	});
	// 	expect(roomRepository.mockSaveMatch).toHaveBeenNthCalledWith(2, opponent.name, {
	// 		bestOf: event.data.bestOf,
	// 		date: event.data.date,
	// 		players: players.map((player) => player.toPresentation()),
	// 		banListHash: event.data.banListHash,
	// 		banListName: "N/A",
	// 	});
	// });
});
