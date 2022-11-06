import LocalClient from "./client";
import { WebSocketServer } from 'ws';
import * as sh from './shared'
import { debug } from './shared'
import { local, remote, RemoteType } from './remote'

class ClientProperties {
    static nextID = 0
    id: number
    name?: string
    team?: sh.TeamID
    room?: Room
    constructor(){
        this.id = ClientProperties.nextID++
    }
}

type Client = RemoteType<ClientProperties, LocalClient>

class Room {
    static nextID = 0
    id: number
    name: string
    constructor(name: string){
        this.id = Room.nextID++
        this.name = name
    }
}

export default class Server {
    
    private name: string
    
    private clients = new Set<Client>();
    private rooms = new Map<number, Room>();
    private annouceInterval
    private wss: WebSocketServer
    
    constructor(dht: any, name: string){
        this.name = name

        this.wss = new WebSocketServer({ port: sh.WS_PORT })
        debug.log('WS is now listening on', sh.WS_PORT)

        let announce = () => {
            dht.announce(sh.INFO_HASH, sh.WS_PORT, () => {
                debug.log('announced self')
            })
        }
        this.annouceInterval = setInterval(announce, sh.DHT_REANNOUNCE_INTERVAL)
        announce()

        this.wss.on('connection', (ws, req) => {
            let client = remote(ws, new ClientProperties(), LocalClient, this)
            this.clients.add(client)
        })
    }

    async addLocalClient(localClient: LocalClient, other: { other?: any }){
        let client = local(new ClientProperties(), localClient, other)
        this.clients.add(client)
        return client
    }

    //@rpc
    async addRoom(name: string, caller?: Client){
        let room = new Room(name)
        this.rooms.set(room.id, room)
        for(let client of this.clients.values()){
            /*async*/ client.addRoom({ id: room.id, name: room.name })
        }
        return room.id
    }

    //@rpc
    async joinRoom(roomID: number, name: string, caller?: Client){
        let room = this.rooms.get(roomID)
        if(room === undefined){
            throw 'Room not found'
        }
        let id = caller!.id
        let team = sh.TeamID.BLUE as sh.TeamID //TODO:
        let players = Array.from(this.clients)
            .filter(client => {
                if(client.room === room){
                    /*await*/ client.addPlayer({ id, team, name })
                    return true
                }
            })
            .map(client => ({
                id: client.id!,
                name: client.name!,
                team: client.team!,
            }))
        caller!.name = name
        caller!.team = team
        caller!.room = room

        return { id, team, players }
    }

    //@rpc
    async leaveRoom(caller?: Client){
        let room = caller!.room
        if(room){
            for(let client of this.clients){
                if(client !== caller && client.room === caller!.room){
                    client.removePlayer(caller!.id)
                }
            }
        }
    }

    //@rpc
    async getRooms(){
        return Array.from(this.rooms.values()).map(room => ({ id: room.id, name: room.name }))
    }

    //@rpc
    async switchTeam(team: sh.TeamID, caller?: Client){
        caller!.team = team
        for(let client of this.clients){
            if(client !== caller && client.room === caller!.room){
                client.switchTeam(caller!.id, team)
            }
        }
    }

    //@rpc
    async startGame(caller?: Client){
        let room = caller!.room!
        let players = Array.from(this.clients).filter(client => client.room === room) //TODO:
        let champions = await Promise.all(players.map(player => player.selectChampion()))

        await this.launchServer()

        for(let player of players){
            player.launchGame('', 0, '', player.id)
        }
    }

    async launchServer(){

    }
}