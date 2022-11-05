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
const server_1 = __importDefault(require("./server"));
const ws_1 = require("ws");
const sh = __importStar(require("./shared"));
const remote_1 = require("./remote");
const prompts_1 = __importDefault(require("prompts"));
const dynsel_1 = __importDefault(require("./dynsel"));
class ServerProperties {
    constructor(host, port) {
        this.rooms = new Map();
        this.id = host + ':' + port;
        this.host = host;
        this.port = port;
    }
}
class Player {
    constructor(id, name, team) {
        this.id = id;
        this.name = name;
        this.team = team;
    }
}
class Room {
    constructor(id, name, server) {
        this.players = new Map();
        this.id = id;
        this.name = name;
        this.server = server;
    }
}
class Client {
    constructor(dht, name) {
        this.servers = new Map();
        this.rooms = new Set();
        this.roomPrompt = new dynsel_1.default('room', 'Select room', () => {
            return Array.from(this.rooms).map(room => ({
                title: `${room.name} @ ${room.server.host}:${room.server.port}`,
                value: room
            })).concat([{
                    title: 'END',
                    disabled: true
                }]);
        });
        this.dht = dht;
        this.name = name;
        return;
        this.dht.on('peer', async (peer, infoHash, from) => {
            let peerID = peer.host + ':' + peer.port;
            let fromID = from.address + ':' + from.port;
            let server = this.servers.get(peerID);
            if (server) {
                return;
            }
            console.log('found potential peer ' + peerID + ' through ' + fromID);
            try {
                let ws = new ws_1.WebSocket('ws://' + peerID);
                let server = (0, remote_1.remote)(ws, new ServerProperties(peer.host, peer.port), server_1.default, this);
                this.servers.set(server.id, server);
                ws.on('error', (err) => console.error(err));
                await new Promise((res, rej) => ws.on('open', () => res()));
                await this.getRooms(server);
            }
            catch (e) {
                console.error(e);
            }
        });
    }
    async addLocalServer(localServer, other) {
        let server = (0, remote_1.local)(new ServerProperties('', sh.WS_PORT), localServer, other);
        this.servers.set(server.id, server);
        await this.getRooms(server);
        return server;
    }
    async getRooms(server) {
        try {
            let rooms = await server.getRooms();
            for (let r of rooms) {
                let room = new Room(r.id, r.name, server);
                server.rooms.set(room.id, room);
                this.rooms.add(room);
            }
            this.roomPrompt.update();
        }
        catch (e) {
            console.error(e);
        }
    }
    //@rpc
    async addRoom(r, server) {
        let room = new Room(r.id, r.name, server);
        this.rooms.add(room);
        server.rooms.set(room.id, room);
        this.roomPrompt.update();
    }
    //@rpc
    async removeRoom(id, server) {
        let room = server.rooms.get(id);
        if (room !== undefined) {
            this.rooms.delete(room);
            server.rooms.delete(id);
            this.roomPrompt.update();
        }
    }
    async lookup() {
        this.dht.lookup(sh.INFO_HASH, () => {
            console.log('lookup finished');
        });
        let room = await this.roomPrompt.show();
        await this.joinRoom(room.id, room.server);
    }
    async joinRoom(id, server) {
        let { team, players } = await server.joinRoom(id, this.name);
        this.room = server.rooms.get(id);
        console.log(`You joined ${sh.TID2str[team]}`);
        for (let p of players) {
            let player = new Player(p.id, p.name, p.team);
            this.room.players.set(player.id, player);
            console.log(`${p.name} in ${sh.TID2str[p.team]}`);
        }
        //TODO: add self? what's id?
        let newteam = (await (0, prompts_1.default)({
            type: 'select',
            name: 'name',
            message: 'Select team',
            choices: [
                { title: 'blue', value: sh.TeamID.BLUE },
                { title: 'red', value: sh.TeamID.PURP },
                { title: 'spectators', value: sh.TeamID.SPEC },
            ]
        })).name;
        if (team != newteam) {
            await server.switchTeam(newteam);
            team = newteam;
        }
        let start = (await (0, prompts_1.default)({
            type: 'confirm',
            name: 'name',
            message: 'Start game?',
            initial: true
        })).name;
        if (start) {
            server.startGame();
        }
    }
    //@rpc
    async addPlayer(team, name, server) {
        console.log(`${name} joined ${sh.TID2str[team]}`);
    }
    //@rpc
    async switchTeam(id, team, server) {
        console.log(`${this.room?.players.get(id)?.name} turned to ${sh.TID2str[team]}`);
    }
    //@rpc
    async selectChampion(server) {
        let champion = (await (0, prompts_1.default)({
            type: 'select',
            name: 'name',
            message: 'Select champion',
            choices: [
                { title: 'Singed', value: 'Singed' },
                { title: 'Singed', value: 'Singed' },
                { title: 'Singed', value: 'Singed' },
                { title: 'Singed', value: 'Singed' },
            ]
        })).name;
        return champion;
    }
    //@rpc
    async launchGame(host, port, blowfish, playerID, server) {
        host = host || server.host || '127.0.0.1';
        port = port || 5119;
        blowfish = blowfish || '17BLOhi6KZsTtldTsizvHg==';
        console.log(`start 'League of Legends.exe' '' '' '' '${host} ${port} ${blowfish} ${playerID}'`);
    }
}
exports.default = Client;
//# sourceMappingURL=client.js.map