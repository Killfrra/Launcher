import LocalClient from "./client";
import { WebSocketServer } from 'ws';
import * as sh from './shared';
import { local, remote } from './remote';
class ClientProperties {
    static nextID = 0;
    id;
    name;
    team;
    room;
    constructor() {
        this.id = ClientProperties.nextID++;
    }
}
class Room {
    static nextID = 0;
    id;
    name;
    constructor(name) {
        this.id = Room.nextID++;
        this.name = name;
    }
}
export default class Server {
    name;
    clients = new Set();
    rooms = new Map();
    annouceInterval;
    constructor(dht, name) {
        this.name = name;
        const wss = new WebSocketServer({ port: sh.WS_PORT });
        console.log('WS is now listening on', sh.WS_PORT);
        let announce = () => {
            dht.announce(sh.INFO_HASH, sh.WS_PORT, () => {
                console.log('announced self');
            });
        };
        this.annouceInterval = setInterval(announce, sh.DHT_REANNOUNCE_INTERVAL);
        announce();
        wss.on('connection', (ws, req) => {
            let client = remote(ws, new ClientProperties(), LocalClient, this);
            this.clients.add(client);
        });
    }
    async addLocalClient(localClient) {
        let client = local(new ClientProperties(), localClient);
        this.clients.add(client);
        return client;
    }
    async addRoom(name) {
        let room = new Room(name);
        this.rooms.set(room.id, room);
        for (let client of this.clients.values()) {
            /*async*/ client.addRoom({ id: room.id, name: room.name });
        }
        return room.id;
    }
    //@rpc
    async joinRoom(id, name, caller) {
        let room = this.rooms.get(id);
        if (room === undefined) {
            throw 'Room not found';
        }
        let team = sh.TeamID.BLUE; //TODO:
        let players = Array.from(this.clients)
            .filter(client => {
            if (client.room === room) {
                /*await*/ client.addPlayer(team, name);
                return true;
            }
        })
            .map(client => ({
            id: client.id,
            name: client.name,
            team: client.team,
        }));
        caller.name = name;
        caller.team = team;
        caller.room = room;
        return { team, players };
    }
    //@rpc
    async getRooms() {
        return Array.from(this.rooms.values()).map(room => ({ id: room.id, name: room.name }));
    }
    //@rpc
    async switchTeam(team, caller) {
        caller.team = team;
        for (let client of this.clients) {
            if (client !== caller && client.room === caller.room) {
                client.switchTeam(caller.id, team);
            }
        }
    }
}
