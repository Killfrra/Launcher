import LocalClient from "./client";
import { WebSocketServer } from 'ws';
import * as sh from './shared'
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
    
    name: string
    
    private clients = new Set<Client>();
    private rooms = new Map<number, Room>();
    private annouceInterval
    
    constructor(dht: any, name: string){
        this.name = name

        const wss = new WebSocketServer({ port: sh.WS_PORT })
        console.log('WS is now listening on', sh.WS_PORT)

        let announce = () => {
            dht.announce(sh.INFO_HASH, sh.WS_PORT, () => {
                console.log('announced self')
            })
        }
        this.annouceInterval = setInterval(announce, sh.DHT_REANNOUNCE_INTERVAL)
        announce()

        wss.on('connection', (ws, req) => {
            let client = remote(ws, new ClientProperties(), LocalClient, this)
            this.clients.add(client)
        })
    }

    async addLocalClient(localClient: LocalClient){
        let client = local(new ClientProperties(), localClient)
        this.clients.add(client)
        return client
    }

    async addRoom(name: string){
        let room = new Room(name)
        this.rooms.set(room.id, room)
        for(let client of this.clients.values()){
            /*async*/ client.addRoom({ id: room.id, name: room.name })
        }
        return room.id
    }

    //@rpc
    async joinRoom(id: number, name: string, caller?: Client){
        let room = this.rooms.get(id)
        if(room === undefined){
            throw 'Room not found'
        }
        let team = sh.TeamID.BLUE //TODO:
        let players = Array.from(this.clients)
            .filter(client => {
                if(client.room === room){
                    /*await*/ client.addPlayer(team, name)
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
        return { team, players }
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
}