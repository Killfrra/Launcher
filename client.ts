import LocalServer from "./server";
import { WebSocket } from 'ws';
import * as sh from './shared'
import { local, remote, RemoteType } from './remote'
import prompts from 'prompts'
import DSP from './dynsel'

class ServerProperties {
    id: string
    host: string
    port: number
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
    name: string
    room?: Room

    private servers = new Map<string, Server>();
    private rooms = new Set<Room>();

    private roomPrompt = new DSP<Room>('room', 'Select room', () => {
        return Array.from(this.rooms).map(room => ({
            title: `${room.name} @ ${room.server.host}:${room.server.port}`,
            value: room
        }))
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

            console.log('found potential peer ' + peerID + ' through ' + fromID)

            try {
                let ws = new WebSocket('ws://' + peerID)
                let server = remote(ws, new ServerProperties(peer.host, peer.port), LocalServer, this)
                await this.addServer(server)
            } catch (e) {
                console.error(e)
            }
        })
    }

    async addLocalServer(localServer: LocalServer){
        let server = local(new ServerProperties('0.0.0.0', sh.WS_PORT), localServer)
        await this.addServer(server)
        return server
    }

    async addServer(server: Server){
        this.servers.set(server.id, server)
        try {
            let rooms = await server.getRooms()
            for(let r of rooms){
                let room = new Room(r.id, r.name, server)
                server.rooms.set(room.id, room)
                this.rooms.add(room)
            }
            this.roomPrompt.update()
        } catch(e) {
            console.error(e)
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
        this.dht.lookup(sh.INFO_HASH, () => {
            console.log('lookup')
        })

        let room = await this.roomPrompt.show()
        await this.joinRoom(room.id, room.server)
    }

    async joinRoom(id: number, server: Server){
        let { team, players } = await server.joinRoom(id, this.name!)

        this.room = server.rooms.get(id)!

        console.log(`You joined ${sh.TID2str[team]}`)
        for(let p of players){
            let player = new Player(p.id, p.name, p.team)
            this.room.players.set(player.id, player)
            console.log(`${p.name} in ${sh.TID2str[p.team]}`)
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
        })).name

        if(team != newteam){
            await server.switchTeam(newteam)
            team = newteam
        }
    }

    //@rpc
    async addPlayer(team: sh.TeamID, name: string){
        console.log(`${name} joined ${sh.TID2str[team]}`)
    }
    
    //@rpc
    async switchTeam(id: number, team: sh.TeamID, caller?: Client){
        console.log(`${this.room?.players.get(id)?.name} turned to ${sh.TID2str[team]}`)
    }
}