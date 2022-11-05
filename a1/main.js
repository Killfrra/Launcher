import prompts from 'prompts';
import DHT from 'bittorrent-dht';
import sha1 from 'simple-sha1';
import { WebSocket, WebSocketServer } from 'ws';
const WS_PORT = 8080;
const DHT_PORT = 20000;
const DHT_REANNOUNCE_INTERVAL = 15 * 60 * 1000;
const INFO_HASH = sha1.sync('nonexistent');
class Server {
    ws;
    host;
    port;
    rtt;
    constructor(ws, host, port) {
        this.ws = ws;
        this.host = host;
        this.port = port;
    }
    async ping() {
        await response(this.ws, { type: 'ping' });
    }
    async join(team) {
        await response(this.ws, { type: 'join', team });
    }
}
class Player {
    champion;
}
class RemotePlayer extends Player {
    ws;
    host;
    port;
    constructor(ws, host, port) {
        super();
        this.ws = ws;
        this.host = host;
        this.port = port;
    }
}
class LocalPlayer extends Player {
}
let { action } = await prompts({
    name: 'action',
    message: 'Select action',
    type: 'select',
    choices: [
        { title: 'Create custom game', value: 'create' },
        { title: 'Join   custom game', value: 'join' },
    ]
});
const dht = new DHT();
dht.listen(DHT_PORT, () => {
    console.log('DHT is now listening on', DHT_PORT);
});
let response = (ws, msg_out, timeout, onTimeout = (res, rej) => rej('timeout')) => new Promise((res, rej) => {
    let timeoutInterval;
    let msg_out_id = (Math.random() * (Math.pow(2, 31) - 1)) | 0;
    let cb = (data) => {
        let msg_in = JSON.parse(data.toString('utf8'));
        if (msg_in.type == msg_out.type && msg_in.id === msg_out_id) {
            ws.off('message', cb);
            if (timeout !== undefined) {
                clearTimeout(timeoutInterval);
            }
            if (msg_in.error !== undefined) {
                rej(msg_in.error);
            }
            else {
                res(msg_in);
            }
        }
    };
    ws.on('message', cb);
    if (timeout !== undefined) {
        timeoutInterval = setTimeout(() => {
            ws.off('message', cb);
            onTimeout(res, rej);
        });
    }
    ws.send(JSON.stringify(msg_out));
});
if (action === 'create') {
    let players = new Map();
    players.set('local', new LocalPlayer());
    let playerPrompt;
    let getPlayerChoices = () => {
        let ret = [...players.entries()]
            .map(([k, v]) => ({
            title: k,
            value: v
        }));
        ret.unshift({ title: 'START', value: undefined });
    };
    let updatePlayerPrompt = () => {
        if (!playerPrompt) {
            return;
        }
        playerPrompt.choices = getPlayerChoices();
        playerPrompt.render();
    };
    /*
    let { name } = await prompts({
        type: 'text',
        name: 'name',
        message: 'Enter server name',
        initial: 'TEST SERVER'
    })
    */
    let announce = () => {
        dht.announce(INFO_HASH, WS_PORT, () => {
            console.log('announced self');
        });
    };
    let annouceInterval = setInterval(announce, DHT_REANNOUNCE_INTERVAL);
    announce();
    const wss = new WebSocketServer({ port: WS_PORT });
    console.log('WS is now listening on', WS_PORT);
    wss.on('connection', function connection(ws, req) {
        ws.on('message', function message(data) {
            let msg = JSON.parse(data.toString('utf8'));
            let host = req.socket.remoteAddress;
            let port = req.socket.remotePort;
            if (!(host && port)) {
                let error = 'remoteAddress and/or remotePort is undefined';
                ws.send(JSON.stringify({ id: msg.id, type: msg.type, error }));
                return;
            }
            let playerId = host + ':' + port;
            let player = players.get(playerId);
            if (msg.type === 'ping') {
                ws.send(JSON.stringify({ id: msg.id, type: msg.type }));
            }
            else if (msg.type === 'join') {
                let error = undefined;
                if (player) {
                    error = 'already joined';
                }
                else {
                    player = new RemotePlayer(ws, host, port);
                    players.set(playerId, player);
                    updatePlayerPrompt();
                }
                ws.send(JSON.stringify({ id: msg.id, type: msg.type, error }));
                //TODO: broadcast player number change
            }
            else if (msg.type === 'select_champion') {
                let error = undefined;
                ws.send(JSON.stringify({ id: msg.id, type: msg.type, error }));
                if ([...players.values()].every(v => v.champion !== undefined)) {
                }
            }
        });
    });
    let { player } = await prompts({
        type: 'select',
        name: 'player',
        message: 'Lobby',
        choices: getPlayerChoices(),
        onRender() {
            if (this.firstRender) {
                playerPrompt = this;
            }
        }
    });
}
else if (action === 'join') {
    let servers = new Map();
    let serverPrompt;
    let getServerChoices = () => ([...servers.values()]
        .filter(v => v.rtt !== undefined)
        .map(v => ({
        title: `${v.rtt.toString().padStart(3, ' ')} ${v.host}:${v.port}`,
        value: v
    })));
    let updateServerPrompt = () => {
        if (!serverPrompt) {
            return;
        }
        serverPrompt.choices = getServerChoices();
        serverPrompt.render();
    };
    dht.on('peer', async (peer, infoHash, from) => {
        let peerId = peer.host + ':' + peer.port;
        let fromId = from.address + ':' + from.port;
        let server = servers.get(peerId);
        if (server) {
            return;
        }
        console.log('found potential peer ' + peerId + ' through ' + fromId);
        try {
            let ws = new WebSocket('ws://' + peerId);
            server = new Server(ws, peer.host, peer.port);
            servers.set(peerId, server);
            let localTime1 = Date.now();
            await server.ping();
            let localTime2 = Date.now();
            server.rtt = (localTime2 - localTime1); // 2
            updateServerPrompt();
        }
        catch (e) {
            console.error(e);
        }
    });
    dht.lookup(INFO_HASH, () => {
        console.log('lookup');
    });
    let { server } = await prompts({
        type: 'select',
        name: 'server',
        message: 'Select server',
        choices: getServerChoices(),
        onRender() {
            if (this.firstRender) {
                serverPrompt = this;
            }
        }
    });
    try {
        await server.join();
        console.log('joined');
        server.ws.on('message', async (data) => {
            let msg = JSON.parse(data.toString('utf8'));
            if (msg.type === 'start') {
                let { champion } = await prompts({
                    type: 'select',
                    name: 'champion',
                    choices: [
                        { title: 'Singed', value: 'Singed' }
                    ]
                });
                await response(server.ws, { type: 'select_champion', champion });
            }
        });
    }
    catch (e) {
        console.error(e);
    }
}
/*
import prompts from 'prompts';

let { action } = await prompts({
    name: 'action',
    message: 'Select action',
    type: 'select',
    choices: [
        { title: 'Create custom game', value: 'create' },
        { title: 'Join   custom game', value: 'join' },
    ]
})

type PlayerID = string
type TeamID = number

class Server {
    rooms = new Set<Room>()
}

class Room {
    players = new Map<PlayerID, Player>()
    teams = new Map<TeamID, Map<PlayerID, Player>>()
}

class Player {
    id: PlayerID
    room?: Room
    team?: number
    champion?: string
    constructor(id: PlayerID){
        this.id = id
    }
    joinRoom(room: Room){
        if(room == this.room){
            return
        }
        this.room?.players.delete(this.id)
        this.room = room
        this.room.players.set(this.id, this)
    }
    joinTeam(team: TeamID){
        if(this.room === undefined){
            return
        }
    }
}

if (action === 'create') {
    let server = new LocalServer()
    let player = new LocalPlayer('local')
    let room = new LocalRoom()
    player.joinRoom(room)
    server.rooms.add(room)
} else if(action === 'join') {

}

import prompts from 'prompts';

let { action } = await prompts({
    name: 'action',
    message: 'Select action',
    type: 'select',
    choices: [
        { title: 'Create custom game', value: 'create' },
        { title: 'Join   custom game', value: 'join' },
    ]
})

type PlayerID = string
enum TeamID { SPEC, BLUE, PURP }

class Server {
    name?: string
    players = new Set<ServerPlayer>()
    rooms = new Set<ServerRoom>()
    constructor(){

    }
}

class ServerRoom {
    name?: string
    players = new Set<ServerPlayer>()
    constructor(){
        
    }
}

class ServerPlayer {
    id: PlayerID
    name?: string
    room?: ServerRoom
    team?: number
    champion?: string
    constructor(id: PlayerID){
        this.id = id
    }
}

class Client {
    constructor(){

    }
}

if (action === 'create') {
    let server = new Server()
    let player = new ServerPlayer('local')
    let room = new ServerRoom()

    let { serverName, roomName, playerName } = await prompts([
        { type: 'text', name: 'serverName', message: 'Server name', initial: 'TEST SERVER' },
        { type: 'text', name: 'roomName', message: 'Room name', initial: 'TEST ROOM' },
        { type: 'text', name: 'playerName', message: 'Player name', initial: 'TEST PLAYER' },
    ])
    server.name = serverName
    room.name = roomName
    player.name = playerName
    
    server.rooms.add(room)
    room.players.add(player)
    player.team = TeamID.BLUE
} else if(action === 'join') {

}
*/ 
