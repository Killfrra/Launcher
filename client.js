import LocalServer from "./server";
import { WebSocket } from 'ws';
import * as sh from './shared';
import { local, remote } from './remote';
import prompts from 'prompts';
import DSP from './dynsel';
class ServerProperties {
    id;
    host;
    port;
    rooms = new Map();
    constructor(host, port) {
        this.id = host + ':' + port;
        this.host = host;
        this.port = port;
    }
}
class Player {
    id;
    name;
    team;
    constructor(id, name, team) {
        this.id = id;
        this.name = name;
        this.team = team;
    }
}
class Room {
    id;
    name;
    server;
    players = new Map();
    constructor(id, name, server) {
        this.id = id;
        this.name = name;
        this.server = server;
    }
}
export default class Client {
    dht;
    name;
    room;
    servers = new Map();
    rooms = new Set();
    roomPrompt = new DSP('room', 'Select room', () => {
        return Array.from(this.rooms).map(room => ({
            title: `${room.name} @ ${room.server.host}:${room.server.port}`,
            value: room
        }));
    });
    constructor(dht, name) {
        this.dht = dht;
        this.name = name;
        this.dht.on('peer', async (peer, infoHash, from) => {
            let peerID = peer.host + ':' + peer.port;
            let fromID = from.address + ':' + from.port;
            let server = this.servers.get(peerID);
            if (server) {
                return;
            }
            console.log('found potential peer ' + peerID + ' through ' + fromID);
            try {
                let ws = new WebSocket('ws://' + peerID);
                let server = remote(ws, new ServerProperties(peer.host, peer.port), LocalServer, this);
                await this.addServer(server);
            }
            catch (e) {
                console.error(e);
            }
        });
    }
    async addLocalServer(localServer) {
        let server = local(new ServerProperties('0.0.0.0', sh.WS_PORT), localServer);
        await this.addServer(server);
        return server;
    }
    async addServer(server) {
        this.servers.set(server.id, server);
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
            console.log('lookup');
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
        let newteam = (await prompts({
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
    }
    //@rpc
    async addPlayer(team, name) {
        console.log(`${name} joined ${sh.TID2str[team]}`);
    }
    //@rpc
    async switchTeam(id, team, caller) {
        console.log(`${this.room?.players.get(id)?.name} turned to ${sh.TID2str[team]}`);
    }
}
