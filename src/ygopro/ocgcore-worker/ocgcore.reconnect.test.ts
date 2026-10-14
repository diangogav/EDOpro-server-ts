import { mock } from "jest-mock-extended";
import { YGOProMsgSelectYesNo } from "ygopro-msg-encode";
import { LoggerMock } from "@test-support/mocks/logger/LoggerMock";
import { YGOProClient } from "@ygopro/client/domain/YGOProClient";
import { YGOProRoom } from "@ygopro/room/domain/YGOProRoom";
import { OCGCore } from "@ygopro/ocgcore-worker/ocgcore";

jest.mock("@ygopro/ocgcore-worker/ocgcore-worker", () => ({}));
jest.mock("@ygopro/ygopro", () => ({}));
jest.mock("@ygopro/room/domain/DuelRecord", () => ({}));

type CoreSetup = {
	responseSide: number;
	lastResponseRequestMsg: YGOProMsgSelectYesNo;
	setResponseTimer(team: number, options: { awaitingConfirm: boolean }): Promise<void>;
};

type Role = "active" | "opponent" | "teammate";
const cases: {
	tag: boolean;
	swapped: boolean;
	seat: number;
	role: Role;
	awaitingConfirm: boolean;
}[] = [];
for (const tag of [false, true]) {
	for (const swapped of [false, true]) {
		for (let seat = 0; seat < (tag ? 4 : 2); seat++) {
			const roles: Role[] = tag ? ["active", "opponent", "teammate"] : ["active", "opponent"];
			for (const role of roles) {
				for (const awaitingConfirm of [false, true]) {
					cases.push({ tag, swapped, seat, role, awaitingConfirm });
				}
			}
		}
	}
}

describe("OCGCore reconnect timer ownership", () => {
	beforeEach(() => {
		jest.useFakeTimers();
		jest.setSystemTime(1000);
	});
	afterEach(() => {
		jest.clearAllTimers();
		jest.useRealTimers();
	});

	it.each(
		cases,
	)("restores team clocks for tag=$tag swapped=$swapped seat=$seat role=$role awaitingConfirm=$awaitingConfirm", async ({
		tag,
		swapped,
		seat,
		role,
		awaitingConfirm,
	}) => {
		const players = Array.from({ length: tag ? 4 : 2 }, (_, position) =>
			mock<YGOProClient>({ position, team: tag ? Math.floor(position / 2) : position }),
		);
		const player = players[seat];
		const activeTeam = role === "opponent" ? 1 - player.team : player.team;
		const activeSide = swapped ? 1 - activeTeam : activeTeam;
		const room = mock<YGOProRoom>();
		Object.assign(room, {
			players,
			isTag: tag,
			isPositionSwapped: swapped,
			turn: 1,
			hostInfo: { time_limit: 180 },
			currentDuelRecord: { messages: [] },
		});
		room.getTeamPlayers.mockImplementation((team) => players.filter((p) => p.team === team));
		const core = new OCGCore(room, new LoggerMock());
		const setup = core as unknown as CoreSetup;
		setup.responseSide = activeSide;
		setup.lastResponseRequestMsg = new YGOProMsgSelectYesNo().fromPartial({
			player: activeSide,
			desc: 1,
		});
		if (role !== "opponent") {
			const operator =
				role === "active" ? player : players.find((p) => p.team === player.team && p !== player);
			for (let turn = 1; turn <= 4; turn++) {
				Object.defineProperty(room, "turn", { value: turn, configurable: true });
				if (core.responsePlayer === operator) break;
			}
			expect(core.responsePlayer).toBe(operator);
		}
		const state = core.timerStateAccessor;
		state.leftMs = [91_000, 73_000];
		await setup.setResponseTimer(activeTeam, { awaitingConfirm });
		players.forEach((p) => p.sendMessageToClient.mockClear());
		jest.setSystemTime(3000);
		const startedAt = state.startedAtMs;
		const expectedTimes = [1 - activeTeam, activeTeam].map((team) => ({
			player: swapped ? 1 - team : team,
			seconds: (team === 0 ? 91 : 73) - (team === activeTeam ? 2 : 0),
		}));
		for (let repetition = 0; repetition < 2; repetition++) {
			players.forEach((p) => p.sendMessageToClient.mockClear());
			await core.sendReconnectTimeLimitAndResponseState(player);
			const frames = player.sendMessageToClient.mock.calls.map(([frame]) => frame);
			const times = frames
				.filter((frame) => frame[2] === 0x18)
				.map((frame) => ({
					player: frame[3],
					seconds: frame.readUInt16LE(5),
				}));
			expect(times).toEqual(expectedTimes);
			expect(state.runningPos).toBe(activeTeam);
			expect(jest.getTimerCount()).toBe(1);
			expect(state.leftMs[activeTeam]).toBe(
				(activeTeam === 0 ? 91_000 : 73_000) - (role === "active" ? 2000 : 0),
			);
			expect(state.awaitingConfirm).toBe(role === "active" || awaitingConfirm);
			if (role !== "active") expect(state.startedAtMs).toBe(startedAt);
			const coreMessages = frames.filter((frame) => frame[2] === 0x01);
			expect(coreMessages.map((frame) => frame[3])).toEqual([role === "active" ? 13 : 3]);
		}
		state.clear();
		expect(jest.getTimerCount()).toBe(0);
	});
});
