import { RoomState } from "@edopro/room/domain/RoomState";
import { YGOProRoom } from "./YGOProRoom";

export class YGOProRoomState extends RoomState {
    protected toRPS(room: YGOProRoom): void {
        const team0Player = room.getTeamPlayers(0)[0];
        const team1Player = room.getTeamPlayers(1)[0];
        if (!team0Player || !team1Player) {
            return;
        }

        const message = room.messageSender.selectHandMessage();
        team0Player.captain();
        team1Player.captain();
        team0Player.sendMessageToClient(message);
        team1Player.sendMessageToClient(message);
    }
}
