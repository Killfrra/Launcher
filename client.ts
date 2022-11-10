import LocalServer from "./server";
import { WebSocket } from 'ws';
import * as sh from './shared'
import { debug, hash } from './shared'
import { Remote, LorR, rpc } from './remote'
import prompts from 'prompts'
import DSP from './dynsel'
import kleur from 'kleur'

enum ServerStatus { potential, unreachable, connected, disconnected }
class ServerProperties {
    id: string
    host: string
    port: number
    name?: string
    rooms = new Map<number, Room>()
    status = ServerStatus.potential
    constructor(host: string, port: number){
        this.id = host + ':' + port
        this.host = host
        this.port = port
    }
}

type Server = LorR<LocalServer, ServerProperties>

class Player {
    id: number
    name: string
    team: sh.TeamID
    constructor(id: number, name: string, team: sh.TeamID){
        this.id = id
        this.name = name
        this.team = team
    }
}

class Room {
    id: number
    name: string
    server: Server
    players = new Map<number, Player>()
    constructor(id: number, name: string, server: Server){
        this.id = id
        this.name = name
        this.server = server
    }
}

export default class Client {

    private dht
    private name: string

    private id?: number
    private team?: sh.TeamID
    private room?: Room
    private ready = false

    private servers = {
        known: new Set<string>(),
        /*
        potential: new Map<string, ServerProperties>(),
        unreachable: new Map<string, ServerProperties>(),
        */
        connected: new Map<string, Server>(),
        /*
        disconnected: new Map<string, Server>(),
        */
    }

    private rooms = new Set<Room>();

    private inLookup = false
    private inAwaiting = 0
    private roomPrompt = new DSP('room', 'Select room', () => {
        let lasttitle = 'END', n = 0
        if(this.inLookup){
            lasttitle = 'Looking for servers...'
        } else if((n = this.inAwaiting) > 0){
            lasttitle = `Waiting for a response from ${n} servers...`
        }
        return Array.from(this.rooms.values()).map(room => ({
            title: `${room.name} @ ${room.server.p.name} (${hash(room.server.p.id)})`,
            value: room
        })).concat([ {
            title: lasttitle,
            disabled: true
        } as any ])
    })

    private teamPrompt = new DSP('team', 'Select action', () => {
        let ret: ({
            title: string;
            value?: { join: sh.TeamID } | { startGame: true }
            disabled?: boolean;
            description?: string;
        })[] = [
            {
                value: { startGame: true }, title: 'Report readiness',
                disabled: false
            },
            {
                value: { join: sh.TeamID.BLUE }, title: `Join ${kleur.blue('blue')} team`,
                disabled: this.team === sh.TeamID.BLUE
            },
            {
                value: { join: sh.TeamID.PURP }, title: `Join ${kleur.red('red')} team`,
                disabled: this.team === sh.TeamID.PURP
            },
            /*
            {
                value: { join: sh.TeamID.SPEC }, title: `Join ${kleur.grey('spectators')}`,
                disabled: true, description: 'You cannot join spectators'
            },
            */
        ]
        let players = Array.from(this.room!.players.values())
        ret = ret.concat(players.map(player => {
            let color = [ undefined, 'blue', 'red' ][player.team]
            return {
                title: 'Kick ' + (color ? (kleur as any)[color](player.name) : player.name),
                disabled: true
            }
        }))
        return ret
    })

    constructor(dht: any, name: string){
        this.dht = dht
        this.name = name

        this.dht.on('peer', (peer: any, infoHash: any, from: any) => {
            let peerID = peer.host + ':' + peer.port
            let fromID = from.address + ':' + from.port
            if (this.servers.known.has(peerID)) {
                return
            }
            this.servers.known.add(peerID)

            debug.log('found potential peer ' + peerID + ' through ' + fromID)

            let server = new ServerProperties(peer.host, peer.port)
            //this.servers.potential.set(peerID, server)
            server.status = ServerStatus.potential

            //TODO: if(this.room === undefined)
            this.connectServer(server)
        })
    }

    private connectServer(prop: ServerProperties){
        let ws = new WebSocket(`ws://${prop.host}:${prop.port}`)
        let server = new Remote(this, ws, LocalServer, prop)

        //TODO: X?
        ws.on('open', () => {
            //TODO: remove from other lists
            this.servers.connected.set(server.p.id, server)
            server.p.status = ServerStatus.connected
            /*await*/ this.getRooms(server)
        })
        ws.on('close', (code: number, reason: Buffer) => {
            debug.error('close', code, reason)
            /*await*/ this.removeAllRooms(server)
        })
        ws.on('error', (err) => {
            debug.error('error', err)
            /*await*/ this.removeAllRooms(server)
        })
        ws.on('unexpected-response', (request: any/*ClientRequest*/, response: any/*IncomingMessage*/) => {
            debug.error('unexpected-response', request, response)
            /*await*/ this.removeAllRooms(server)
        })
    }

    /*
    async addLocalServer(localServer: LocalServer, other: { other?: any }){
        let server = local(new ServerProperties('', sh.WS_PORT), localServer, other)
        this.servers.connected.set(server.id, server)
        server.status = ServerStatus.connected
        await this.getRooms(server)
        return server
    }
    */

    async getRooms(server: Server){
        try {
            let rooms = await server.m.getRooms()
            this.addRooms(rooms, server)
        } catch(e) {
            debug.error(e)
        }
    }

    @rpc
    addRooms(rooms: { id: number, name: string }[], server: Server){
        for(let r of rooms){
            let room = new Room(r.id, r.name, server)
            server.p.rooms.set(room.id, room)
            this.rooms.add(room)
        }
        this.roomPrompt.update()
    }

    @rpc
    addRoom(r: { id: number, name: string }, server: Server){
        let room = new Room(r.id, r.name, server)
        server.p.rooms.set(room.id, room)
        this.rooms.add(room)
        this.roomPrompt.update()
    }

    @rpc
    removeRoom(id: number, server: Server){
        let room = server.p.rooms.get(id)
        if(room !== undefined){
            this.rooms.delete(room)
            server.p.rooms.delete(id)
            this.roomPrompt.update()
        }
    }

    @rpc
    removeAllRooms(server: Server){
        for(let room of server.p.rooms.values()){
            this.rooms.delete(room)
        }
        server.p.rooms.clear()
    }

    async lookup(){
        //TODO: lookup interval?
        this.inLookup = true
        this.dht.lookup(sh.INFO_HASH, () => {
            this.inLookup = false
            this.roomPrompt.update()
        })
        await this.selectRoom()
    }

    async selectRoom(){
        let room = await this.roomPrompt.show()
        if(room !== undefined){
            await this.joinRoom(room.id, room.server)
        }
        //TODO: exit to main menu
    }

    async joinRoom(roomID: number, server: Server){
        let { id, team, players } = await server.m.joinRoom(roomID, this.name!)

        this.id = id
        this.team = team
        this.room = server.p.rooms.get(roomID)!

        for(let p of players){
            let player = new Player(p.id, p.name, p.team)
            this.room.players.set(player.id, player)
        }
        /*async*/ this.selectTeam(server)
    }

    private async selectTeam(server: Server){
        let team = this.team
        do {
            let action = await this.teamPrompt.show()
            if(action === undefined){
                await this.leaveRoom()
                return
            } else if('join' in action){
                team = action.join
                if(this.team != team){
                    await server.m.switchTeam(team)
                    this.team = team
                    this.teamPrompt.update()
                }
            } else if('startGame' in action){
                this.ready = true
                let everybodyReady = await server.m.startGame()
                if(!everybodyReady){
                    console.log('Waiting for the game to start...')
                }
                break
            }
        } while(true)
    }

    async leaveRoom(){
        if(this.room !== undefined){
            await this.room.server.m.leaveRoom()

            this.id = undefined
            this.team = undefined
            this.room = undefined
            this.ready = false
        }
        console.log('You left the room')
    }

    @rpc
    addPlayer(p: {id: number, team: sh.TeamID, name: string}, server: Server){
        if(server != this.room?.server){
            return
        }
        let player = new Player(p.id, p.name, p.team)
        this.room.players.set(player.id, player)
        this.teamPrompt.update()
    }
    
    @rpc
    switchTeam(id: number, team: sh.TeamID, server: Server){
        if(server != this.room?.server){
            return
        }
        let player = this.room.players.get(id);
        if(player !== undefined){
            player.team = team
            this.teamPrompt.update()
        }
    }

    @rpc
    removePlayer(id: number, server: Server){
        if(server != this.room?.server){
            return
        }
        this.room.players.delete(id)
        this.teamPrompt.update()
    }

    @rpc
    async selectChampion(server: Server){
        if(server != this.room?.server){
            return
        }
        let champion = (await prompts({
            type: 'autocomplete',
            name: 'name',
            message: 'Select champion',
            choices: sh.champions.map(c => ({ title: c })),
            initial: 0,
        })).name
        return champion
    }

    @rpc
    launchGame(host: string, port: number, blowfish: string, playerID: number, server: Server){
        if(server != this.room?.server){
            return
        }
        host = host || server.p.host || '127.0.0.1'
        port = port || 5119
        blowfish = blowfish || '17BLOhi6KZsTtldTsizvHg=='
        console.log(`wine 'League of Legends.exe' '' '' '' '${host} ${port} ${blowfish} ${playerID}'`);
    }

    @rpc
    endGame(code: number, server: Server){
        if(server != this.room?.server){
            return
        }
        console.log('Server exited with code', code)
        /*await*/ this.selectTeam(server)
    }

    @rpc
    log(msg: string, server: Server){
        if(server != this.room?.server){
            return
        }
        console.log(msg)
    }
}