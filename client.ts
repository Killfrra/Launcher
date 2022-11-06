import LocalServer from "./server";
import { WebSocket } from 'ws';
import * as sh from './shared'
import { debug } from './shared'
import { local, remote, RemoteType } from './remote'
import prompts from 'prompts'
import DSP from './dynsel'
import kleur from 'kleur'

class ServerProperties {
    id: string
    host: string
    port: number
    name?: string
    rooms = new Map<number, Room>()
    constructor(host: string, port: number){
        this.id = host + ':' + port
        this.host = host
        this.port = port
    }
}

type Server = RemoteType<ServerProperties, LocalServer>

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

    private servers = new Map<string, Server>();
    private rooms = new Set<Room>();

    private inLookup = false
    private inAwaiting = 0
    private roomPrompt = new DSP('room', 'Select room', () => {
        let title = 'END', n = 0
        if(this.inLookup){
            title = 'Looking for servers...'
        } else if((n = this.inAwaiting) > 0){
            title = `Waiting for a response from ${n} servers...`
        }
        return Array.from(this.rooms).map(room => ({
            title: `${room.name} @ ${room.server.name} (${room.server.host}:${room.server.port})`,
            value: room
        })).concat([ {
            title,
            disabled: true
        } as any ])
    })

    private teamPrompt = new DSP('team', 'Select team', () => {
        let ret: ({
            title: string;
            value?: { join: sh.TeamID } | { startGame: true }
            disabled?: boolean;
            description?: string;
        })[] = [
            {
                value: { startGame: true }, title: 'Start game',
                disabled: true
            },
            {
                value: { join: sh.TeamID.BLUE }, title: `Join ${kleur.blue('blue')} team`,
                disabled: this.team === sh.TeamID.BLUE
            },
            {
                value: { join: sh.TeamID.PURP }, title: `Join ${kleur.red('red')} team`,
                disabled: this.team === sh.TeamID.PURP
            },
            {
                value: { join: sh.TeamID.SPEC }, title: `Join ${kleur.grey('spectators')}`,
                disabled: true, description: 'You cannot join spectators'
            },
        ]
        /*
        let players = this.room!.players.values()
        let playersByTeam = groupBy(players, player => player.team)
        for(let [team, players] of playersByTeam.entries()){
            ret = ret.concat(players.map(player => ({
                title: `${player.name}`, disabled: true
            })))
        }
        */
        let players = Array.from(this.room!.players.values())
        ret = ret.concat(players.map(player => {
            let color = [ undefined, 'blue', 'red' ][player.team]
            return {
                title: color ? (kleur as any)[color](player.name) : player.name,
                disabled: true
            }
        }))
        return ret
    })

    constructor(dht: any, name: string){
        this.dht = dht
        this.name = name

        this.dht.on('peer', async (peer: any, infoHash: any, from: any) => {
            let peerID = peer.host + ':' + peer.port
            let fromID = from.address + ':' + from.port
            let server = this.servers.get(peerID)
            if (server) {
                return
            }

            debug.log('found potential peer ' + peerID + ' through ' + fromID)

            let ws = new WebSocket('ws://' + peerID)
            server = remote(ws, new ServerProperties(peer.host, peer.port), LocalServer, this)
            this.servers.set(server.id, server)

            ws.on('open', () => /*await*/ this.getRooms(server!))
            ws.on('error', (err) => debug.error(err))
        })
    }

    async addLocalServer(localServer: LocalServer, other: { other?: any }){
        let server = local(new ServerProperties('', sh.WS_PORT), localServer, other)
        this.servers.set(server.id, server)
        await this.getRooms(server)
        return server
    }

    async getRooms(server: Server){
        try {
            let rooms = await server.getRooms()
            for(let r of rooms){
                let room = new Room(r.id, r.name, server)
                server.rooms.set(room.id, room)
                this.rooms.add(room)
            }
            this.roomPrompt.update()
        } catch(e) {
            debug.error(e)
        }
    }

    //@rpc
    async addRoom(r: { id: number, name: string }, server?: Server){
        let room = new Room(r.id, r.name, server!)
        this.rooms.add(room)
        server!.rooms.set(room.id, room)
        this.roomPrompt.update()
    }

    //@rpc
    async removeRoom(id: number, server?: Server){
        let room = server!.rooms.get(id)
        if(room !== undefined){
            this.rooms.delete(room)
            server!.rooms.delete(id)
            this.roomPrompt.update()
        }
    }

    async lookup(){
        //TODO: lookup interval?
        this.inLookup = true
        this.roomPrompt.update()
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
        let { id, team, players } = await server.joinRoom(roomID, this.name!)

        this.id = id
        this.team = team
        this.room = server.rooms.get(roomID)!

        for(let p of players){
            let player = new Player(p.id, p.name, p.team)
            this.room.players.set(player.id, player)
        }
        
        do {
            let action = await this.teamPrompt.show()
            if(action === undefined){
                await this.leaveRoom()
                //TODO: process.nextTick or setImmediate?
                //TODO: to avoid call stack overflow
                /*await*/ this.selectRoom()
            } else if('join' in action){
                team = action.join
                if(this.team != team){
                    await server.switchTeam(team)
                    this.team = team
                    this.teamPrompt.update()
                }
            } else if('startGame' in action){
                server.startGame()
            }
        } while(true)
    }

    async leaveRoom(){
        if(this.room !== undefined){
            await this.room.server.leaveRoom()

            this.id = undefined
            this.team = undefined
            this.room = undefined
        }
        console.log('You left the room')
    }

    //@rpc
    async addPlayer(p: {id: number, team: sh.TeamID, name: string}, server?: Server){
        if(this.room !== undefined && this.room.server === server){
            let player = new Player(p.id, p.name, p.team)
            this.room.players.set(player.id, player)
            this.teamPrompt.update()
        }
    }
    
    //@rpc
    async switchTeam(id: number, team: sh.TeamID, server?: Server){
        if(this.room !== undefined && this.room.server === server){
            let player = this.room.players.get(id);
            if(player !== undefined){
                player.team = team
                this.teamPrompt.update()
            }
        }
    }

    //@rpc
    async removePlayer(id: number, server?: Server){
        if(this.room !== undefined && this.room.server === server){
            this.room.players.delete(id)
            this.teamPrompt.update()
        }
    }

    //@rpc
    async selectChampion(server?: Server){
        let champion = (await prompts({
            type: 'select',
            name: 'name',
            message: 'Select champion',
            choices: [
                { title: 'Singed', value: 'Singed' },
                { title: 'Singed', value: 'Singed' },
                { title: 'Singed', value: 'Singed' },
                { title: 'Singed', value: 'Singed' },
            ]
        })).name
        return champion
    }

    //@rpc
    async launchGame(host: string, port: number, blowfish: string, playerID: number, server?: Server){
        host = host || server!.host || '127.0.0.1'
        port = port || 5119
        blowfish = blowfish || '17BLOhi6KZsTtldTsizvHg=='
        console.log(`start 'League of Legends.exe' '' '' '' '${host} ${port} ${blowfish} ${playerID}'`);
    }
}