import { Deck } from "../../../../deck/domain/Deck";
import { PlayerRoomState } from "../../../../room/domain/PlayerRoomState";
import { PlayerChangeClientMessage } from "../../../server-to-client/PlayerChangeClientMessage";
import { TypeChangeClientMessage } from "../../../server-to-client/TypeChangeClientMessage";
import { WatchChangeClientMessage } from "../../../server-to-client/WatchChangeClientMessage";
import { RoomMessageHandler } from "../RoomMessageHandler";
import { RoomMessageHandlerCommandStrategy } from "../RoomMessageHandlerCommandStrategy";
import { RoomMessageHandlerContext } from "../RoomMessageHandlerContext";
import { NotReadyCommandStrategy } from "./NotReadyCommandStrategy";

export class ChangeToObserver implements RoomMessageHandlerCommandStrategy {
    private readonly STATUS = 0x09;
    constructor(
        private readonly context: RoomMessageHandlerContext,
        private readonly afterExecuteCallback: () => void
    ) { }

    execute(): void {

        const player = this.context.client.name;
        const ready = this.context.client.isReady;

        if (!(this.context.room.spectators.find(spectator => spectator.name == player))) {

            this.context.room.addSpectator(this.context.client);
            this.context.room.removePlayer(this.context.client);
        

        }
       

        this.context.room.clients.forEach((_client) => {


            const status = (this.context.client.position << 4) | PlayerRoomState.SPECTATE;
            

            _client.socket.write(PlayerChangeClientMessage.create({ status }));

            
        });

        this.context.room.spectators.forEach((_client) => {


            const status = (this.context.client.position << 4) | PlayerRoomState.SPECTATE;
            

            _client.socket.write(PlayerChangeClientMessage.create({ status }));

            
        });

        this.context.client.spectorPosition();
        this.context.client.notReady();
        const type = (Number(this.context.client.host) << 4) | this.context.client.position;
		this.context.client.socket.write(TypeChangeClientMessage.create({ type }));

        console.log("Llegue 2")


        const spectatorsCount = this.context.room.spectators.length;
        const watchMessage = WatchChangeClientMessage.create({ count: spectatorsCount });


        this.context.room.clients.forEach((_client) => {
            _client.socket.write(watchMessage);
        });
        this.context.room.clients.forEach((_client) => {
            _client.socket.write(watchMessage);
        });

        this.context.room.spectators.forEach((_client) => {
            _client.socket.write(watchMessage);
        });

        



    }
}


