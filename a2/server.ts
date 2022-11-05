import DHT from 'bittorrent-dht';
import { WebSocket, WebSocketServer } from 'ws';
import * as sh from './shared'

let nextRoomID = 0
class Room {
    id: number
    name: string
    constructor(name: string){
        this.id = nextRoomID++
        this.name = name
    }
}

let nextPlayerID = 0
class Player {
    id: number
    ws: WebSocket
    room?: Room
    name?: string
    team?: number
    constructor(ws: WebSocket){
        this.id = nextPlayerID++
        this.ws = ws
    }
}

export default class Server {
    players = new Map<number, Player>()
    rooms = new Map<number, Room>()
    addRoom(name){
        let room = new Room(name)
        this.rooms[room.id] = room
        for(let player of this.players.values()){
            player.ws.send(JSON.stringify({
                type: 'on_room_added',
                data: {
                    id: room.id,
                    name: room.name
                }
            }))
        }
        return room;
    }
    delRoom(room){
        this.rooms.delete(room.id)
        for(let player of this.players.values()){
            player.ws.send(JSON.stringify({
                type: 'on_room_removed',
                data: room.id,
            }))
        }
    }
    async main(){
        const dht = new DHT()
        dht.listen(sh.DHT_PORT, () => {
            console.log('DHT is now listening on', sh.DHT_PORT)
        })

        let announce = () => {
            dht.announce(sh.INFO_HASH, sh.WS_PORT, () => {
                console.log('announced self')
            })
        }
        let annouceInterval = setInterval(announce, sh.DHT_REANNOUNCE_INTERVAL)
        announce()
    
        const wss = new WebSocketServer({ port: sh.WS_PORT })
        console.log('WS is now listening on', sh.WS_PORT)

        let server = this

        wss.on('connection', function connection(ws, req) {
            
            let player = new Player(ws)
            server.players[player.id] = player

            ws.on('message', function message(data) {
                let msg = JSON.parse(data.toString('utf8'))
                
                if (msg.type === 'get_rooms') {
                    ws.send(JSON.stringify({
                        id: msg.id,
                        type: msg.type,
                        data: [...server.rooms.values()]
                            .map(room => ({
                                id: room.id,
                                name: room.name
                            }))
                    }))
                } else if(msg.type === 'join_room') {
                    let roomID = msg.data
                    let room = server.rooms[roomID]
                    player.room = room
                    ws.send(JSON.stringify({
                        id: msg.id,
                        type: msg.type,
                        data: [...server.players.values()]
                            .filter(player => (
                                player.room === room &&
                                player.team !== undefined
                            ))
                            .map(player => ({
                                id: player.id,
                                name: player.name,
                                team: player.team
                            }))
                    }))
                } else if(msg.type === 'join_team') {
                    let { team, playerName } = msg.data
                    let prevTeam = player.team
                    player.team = team
                    player.name = playerName
                    ws.send(JSON.stringify({ id: msg.id, type: msg.type }))
                    let playersInRoom = 1;
                    for(let anotherPlayer of server.players.values()){
                        if(anotherPlayer !== player && anotherPlayer.room === player.room){
                            playersInRoom++;
                            anotherPlayer.ws.send(JSON.stringify({
                                type: 'on_player_joined_team',
                                data: {
                                    id: player.id,
                                    team: player.team,
                                    name: player.name
                                }
                            }))
                        }
                    }
                    /*
                    if(prevTeam === undefined){
                        for(let anotherPlayer of server.players.values()){
                            if(anotherPlayer.room !== player.room){
                                anotherPlayer.ws.send(JSON.stringify({
                                    type: 'on_room_counter_changed',
                                    data: playersInRoom
                                }))
                            }
                        }
                    }
                    */
                } else if(msg.type === 'leave_team') {
                    ws.send(JSON.stringify({ id: msg.id, type: msg.type }))
                    for(let anotherPlayer of server.players.values()){
                        if(anotherPlayer !== player && anotherPlayer.room === player.room){
                            anotherPlayer.ws.send(JSON.stringify({
                                type: 'on_player_leaved_team',
                                data: player.id
                            }))
                        }
                    }
                    player.team = undefined
                } else if(msg.type === 'leave_room') {
                    ws.send(JSON.stringify({ id: msg.id, type: msg.type }))
                    for(let anotherPlayer of server.players.values()){
                        if(anotherPlayer !== player && anotherPlayer.room === player.room){
                            anotherPlayer.ws.send(JSON.stringify({
                                type: 'on_player_leaved_room',
                                data: player.id
                            }))
                        }
                    }
                    player.room = undefined
                }
            })
        })
    }
}