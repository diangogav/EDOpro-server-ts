export class UnrankedMatch {
    readonly id: string;
    readonly gameId: string;
    readonly bestOf: number;
    readonly playerNames: string[];
    readonly opponentNames: string[];
    readonly date: Date;
    readonly banListName: string;
    readonly banListHash: string;
    readonly team0Score: number;
    readonly team1Score: number;
    readonly winnerTeam: number;
    readonly season: number;

    private constructor({
        id,
        gameId,
        bestOf,
        playerNames,
        opponentNames,
        date,
        banListName,
        banListHash,
        team0Score,
        team1Score,
        winnerTeam,
        season,
    }: {
        id: string;
        gameId: string;
        bestOf: number;
        playerNames: string[];
        opponentNames: string[];
        date: Date;
        banListName: string;
        banListHash: string;
        team0Score: number;
        team1Score: number;
        winnerTeam: number;
        season: number;
    }) {
        this.id = id;
        this.gameId = gameId;
        this.bestOf = bestOf;
        this.playerNames = playerNames;
        this.opponentNames = opponentNames;
        this.date = date;
        this.banListName = banListName;
        this.banListHash = banListHash;
        this.team0Score = team0Score;
        this.team1Score = team1Score;
        this.winnerTeam = winnerTeam;
        this.season = season;
    }

    static create(data: {
        id: string;
        gameId: string;
        bestOf: number;
        playerNames: string[];
        opponentNames: string[];
        date: Date;
        banListName: string;
        banListHash: string;
        team0Score: number;
        team1Score: number;
        winnerTeam: number;
        season: number;
    }): UnrankedMatch {
        return new UnrankedMatch(data);
    }
}
