export type ReconnectInfo = {
	address: string;
	socketId: string;
	position: number;
};

const players: ReconnectInfo[] = [];

export default {
	add(address: ReconnectInfo): void {
		players.push(address);
	},

	get(): ReconnectInfo[] {
		return players;
	},

	delete(info: ReconnectInfo): void {
		const index = players.findIndex((item) => item.socketId === info.socketId);
		if (index !== -1) {
			players.splice(index, 1);
		}
	},
};
