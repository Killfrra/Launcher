"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const client_1 = __importDefault(require("./client"));
const ws_1 = require("ws");
const sh = __importStar(require("./shared"));
const remote_1 = require("./remote");
class ClientProperties {
    constructor() {
        this.id = ClientProperties.nextID++;
    }
}
ClientProperties.nextID = 0;
class Room {
    constructor(name) {
        this.id = Room.nextID++;
        this.name = name;
    }
}
Room.nextID = 0;
class Server {
    constructor(dht, name) {
        this.clients = new Set();
        this.rooms = new Map();
        this.name = name;
        this.wss = new ws_1.WebSocketServer({ port: sh.WS_PORT });
        console.log('WS is now listening on', sh.WS_PORT);
        let announce = () => {
            dht.announce(sh.INFO_HASH, sh.WS_PORT, () => {
                console.log('announced self');
            });
        };
        this.annouceInterval = setInterval(announce, sh.DHT_REANNOUNCE_INTERVAL);
        announce();
        this.wss.on('connection', (ws, req) => {
            let client = (0, remote_1.remote)(ws, new ClientProperties(), client_1.default, this);
            this.clients.add(client);
        });
    }
    async addLocalClient(localClient, other) {
        let client = (0, remote_1.local)(new ClientProperties(), localClient, other);
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
    //@rpc
    async startGame(caller) {
        let room = caller.room;
        let players = Array.from(this.clients).filter(client => client.room === room); //TODO:
        let champions = await Promise.all(players.map(player => player.selectChampion()));
        await this.launchServer();
        for (let player of players) {
            player.launchGame('', 0, '', player.id);
        }
    }
    async launchServer() {
    }
}
exports.default = Server;
//# sourceMappingURL=server.js.map