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
const prompts_1 = __importDefault(require("prompts"));
//@ts-ignore
const bittorrent_dht_1 = __importDefault(require("bittorrent-dht"));
const server_1 = __importDefault(require("./server"));
const client_1 = __importDefault(require("./client"));
const sh = __importStar(require("./shared"));
async function main() {
    /*
    const dht = {
        on: (evt: string, cb: (peer: any, infoHash: any, from: any) => void) => {},
        lookup: (hash: string, cb: () => void) => {},
        listen: (port: number, cb: () => void) => {},
        announce: (hash: string, port: number, cb: () => void) => {},
    }
    //*/ const dht = new bittorrent_dht_1.default();
    dht.listen(sh.DHT_PORT, () => {
        console.log('DHT is now listening on', sh.DHT_PORT);
    });
    let clientName = (await (0, prompts_1.default)({
        type: 'text', name: 'name',
        message: 'Enter player name',
        initial: 'TEST CLIENT'
    })).name;
    let { action } = await (0, prompts_1.default)({
        name: 'action',
        message: 'Select action',
        type: 'select',
        choices: [
            { title: 'Create custom game', value: 'create' },
            { title: 'Join   custom game', value: 'join' },
        ]
    });
    if (action === 'create') {
        let serverName = (await (0, prompts_1.default)({
            type: 'text', name: 'name',
            message: 'Enter server name',
            initial: 'TEST SERVER'
        })).name;
        let server = new server_1.default(dht, serverName);
        let client = new client_1.default(dht, clientName);
        let roomName = (await (0, prompts_1.default)({
            type: 'text', name: 'name',
            message: 'Enter room name',
            initial: 'TEST ROOM'
        })).name;
        let roomID = await server.addRoom(roomName);
        let otherClient = {}; //TODO: X
        let otherServer = {}; //TODO: X
        let remoteClient = otherClient.other = await server.addLocalClient(client, otherServer);
        let remoteServer = otherServer.other = await client.addLocalServer(server, otherClient);
        await client.joinRoom(roomID, remoteServer);
    }
    else if (action === 'join') {
        let client = new client_1.default(dht, clientName);
        await client.lookup();
    }
}
main();
//# sourceMappingURL=main.js.map