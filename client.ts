import prompts from 'prompts';
import DHT from 'bittorrent-dht';
import { WebSocket } from 'ws';
import { message, response } from './shared'
import * as sh from './shared'

class Server {
    id: string
    host: string
    port: number
    ws: WebSocket
    
    name?: string

    constructor(ws: WebSocket, host: string, port: number) {
        this.id = host + ':' + port
        this.ws = ws
        this.host = host
        this.port = port
    }
}

class Room {
    id: string
    name: string
    server: Server
    constructor(id, name, server){
        this.id = id
        this.name = name
        this.server = server
    }
}

class Player {
    id: string
    name: string
    team: number
    constructor(id, name, team){
        this.id = id
        this.name = name
        this.team = team
    }
}

export default class Client {
    async main(){
        let { playerName } = await prompts({
            type: 'text',
            name: 'playerName',
            message: 'Enter player name',
            initial: 'TEST'
        })

        const dht = new DHT()
        dht.listen(sh.DHT_PORT, () => {
            console.log('DHT is now listening on', sh.DHT_PORT)
        })

        let servers = new Map<string, Server>();
        let rooms = new Map<string, Room>();

        let roomPrompt
        let getRoomChoices = () => (
            [...rooms.values()]
                .map(room => ({
                    title: `${room.name} @ ${room.server.host}:${room.server.port}`,
                    value: room
                }))
        )
        let updateRoomPrompt = () => {
            if (!roomPrompt) {
                return
            }
            roomPrompt.choices = getRoomChoices()
            roomPrompt.render()
        }

        dht.on('peer', async (peer, infoHash, from) => {
            let peerID = peer.host + ':' + peer.port
            let fromID = from.address + ':' + from.port
            let server = servers.get(peerID)
            if (server) {
                return
            }

            console.log('found potential peer ' + peerID + ' through ' + fromID)

            try {
                let ws = new WebSocket('ws://' + peerID)
                server = new Server(ws, peer.host, peer.port)
                servers.set(peerID, server)

                try {
                    let serverRooms = await response(ws, 'get_rooms') as Array<{ id: string, name: string }>
                    for(let room of serverRooms){
                        rooms[room.id] = new Room(room.id, room.name, server)
                    }
                    updateRoomPrompt()
                } catch(e) {
                    console.error(e)
                }
            } catch (e) {
                console.error(e)
            }
        })
        dht.lookup(sh.INFO_HASH, () => {
            console.log('lookup')
        })

        let { room }: { room: Room } = await prompts({
            type: 'select',
            name: 'room',
            message: 'Select room',
            choices: getRoomChoices(),
            onRender() {
                if (this.firstRender) {
                    roomPrompt = this
                }
            }
        } as any)
        roomPrompt = undefined

        let serverPlayers = (await response(room.server.ws, 'join_room', room.id)) as Array<{ id: string, name: string, team: number }>
        let players = serverPlayers.map(player => new Player(player.id, player.name, player.team))
        
        for(let player of players){
            console.log(player.name, player.team);
        }

        let { team } = await prompts({
            type: 'select',
            name: 'team',
            message: 'Select team',
            choices: [
                { title: 'spectators', value: 0 },
                { title: 'blue', value: 1 },
                { title: 'red', value: 2 }
            ]
        })

        await response(room.server.ws, 'join_team', { team, playerName })

        await message(room.server.ws, 'on_game_started')

        let { champion } = await prompts({
            type: 'select',
            name: 'champion',
            message: 'Select champion',
            choices: [
                { title: 'Singed', value: 'Singed' },
                { title: 'Ashe', value: 'Ashe' },
            ]
        })

        await response(room.server.ws, 'select_champion', champion)

        let { host, port, blowfish, playerID } = await message(room.server.ws, 'launch_client') as any

        console.log(`'League of Legends.exe' "" "" "" "${host} ${port} ${blowfish} ${playerID}`)

        await message(room.server.ws, 'on_game_ended')
    }
}