export class UnrankedDuel {
    readonly id: string;
    readonly gameId: string;
    readonly date: Date;
    readonly banListName: string;
    readonly banListHash: string;
    readonly team0Score: number;
    readonly team1Score: number;
    readonly winnerTeam: number;
    readonly turns: number;
    readonly matchId: string;
    readonly season: number;
    readonly ipAddress: string | null;

    private constructor(data: {
        id: string;
        gameId: string;
        date: Date;
        banListName: string;
        banListHash: string;
        team0Score: number;
        team1Score: number;
        winnerTeam: number;
        turns: number;
        matchId: string;
        season: number;
        ipAddress: string | null;
    }) {
        this.id = data.id;
        this.gameId = data.gameId;
        this.date = data.date;
        this.banListName = data.banListName;
        this.banListHash = data.banListHash;
        this.team0Score = data.team0Score;
        this.team1Score = data.team1Score;
        this.winnerTeam = data.winnerTeam;
        this.turns = data.turns;
        this.matchId = data.matchId;
        this.season = data.season;
        this.ipAddress = data.ipAddress;
    }

    static create(data: {
        id: string;
        gameId: string;
        date: Date;
        banListName: string;
        banListHash: string;
        team0Score: number;
        team1Score: number;
        winnerTeam: number;
        turns: number;
        matchId: string;
        season: number;
        ipAddress: string | null;
    }): UnrankedDuel {
        return new UnrankedDuel(data);
    }
}
