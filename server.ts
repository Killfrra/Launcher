import LocalClient from './client';
import { WebSocketServer } from 'ws';
import * as sh from './shared'
import { debug } from './shared'
import { local, remote, RemoteType } from './remote'
import { promises as fs } from 'fs'
import { spawn } from 'child_process'

class ClientProperties {
    static nextID = 1
    id: number
    name?: string
    team?: sh.TeamID
    room?: Room
    ready = false
    champion?: string
    blowfish = '17BLOhi6KZsTtldTsizvHg=='
    constructor(){
        this.id = ClientProperties.nextID++
    }
}

type Client = RemoteType<ClientProperties, LocalClient>

class Room {
    static nextID = 0
    id: number
    name: string
    gameInfo = {
        map: 1,
        mode: 'CLASSIC',
        package: 'LeagueSandbox-Scripts',
        manacosts: true,
        cooldowns: true,
        cheats: false,
        minions: true,
    }
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

            ws.on('close', (code: number, reason: Buffer) => {
                debug.error('close', code, reason)
                this.leaveRoom(client)
            })
            ws.on('error', (err) => {
                debug.error('error', err)
                this.leaveRoom(client)
            })
            ws.on('unexpected-response', (request: any/*ClientRequest*/, response: any/*IncomingMessage*/) => {
                debug.error('unexpected-response', request, response)
                this.leaveRoom(client)
            })
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
                if(client !== caller && client.room === room){
                    /*await*/ client.removePlayer(caller!.id)
                }
            }
        }
        caller!.team = undefined
        caller!.room = undefined
        caller!.ready = false
        caller!.champion = undefined
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
        caller!.ready = true
        
        let room = caller!.room!
        let players = Array.from(this.clients).filter(client => client.room === room) //TODO:

        if(!players.every(player => player.ready)){
            return false
        }
        
        await Promise.all(players.map(async player => {
            player.champion = await player.selectChampion()
        }))

        /* async */ this.launchGame(room, players)

        return true
    }

    private async launchGame(room: Room, players: Client[]){
        let config = {
            gameId: 1,
            game: {
                map: room.gameInfo.map,
                gameMode: room.gameInfo.mode,
                dataPackage: room.gameInfo.package
            },
            gameInfo: {
                FORCE_START_TIMER: 60,

                MANACOSTS_ENABLED: room.gameInfo.manacosts,
                COOLDOWNS_ENABLED: room.gameInfo.cooldowns,
                CHEATS_ENABLED: room.gameInfo.cheats,
                MINION_SPAWNS_ENABLED: room.gameInfo.minions,

                CONTENT_PATH: sh.CONTENT_PATH,
                IS_DAMAGE_TEXT_GLOBAL: false,
                ENDGAME_HTTP_POST_ADDRESS: "",
            },
            players: players.map(player => ({
                playerId: player.id,
                blowfishKey: player.blowfish,
                rank: 'DIAMOND',
                name: player.name,
                champion: player.champion,
                team: player.team,
                skin: 0,
                summoner1: 'SummonerFlash',
                summoner2: 'SummonerHeal',
                ribbon: 2,
                icon: 0,
                runes: {
                     1: 5245,  2: 5245,  3: 5245,  4: 5245,  5: 5245,
                     6: 5245,  7: 5245,  8: 5245,  9: 5245, 10: 5317,
                    11: 5317, 12: 5317, 13: 5317, 14: 5317, 15: 5317,
                    16: 5317, 17: 5317, 18: 5317, 19: 5289, 20: 5289,
                    21: 5289, 22: 5289, 23: 5289, 24: 5289, 25: 5289,
                    26: 5289, 27: 5289, 28: 5335, 29: 5335, 30: 5335,
                },
                talents: {
                    4111: 1, 4112: 3, 4114: 1, 4122: 3,
                    4124: 1, 4132: 1, 4134: 3, 4142: 3,
                    4151: 1, 4152: 3, 4162: 1, 4211: 2,
                    4213: 2, 4221: 1, 4222: 3, 4232: 1,
                }        
            })),
        }
        await fs.writeFile(sh.GAMESERVER_DIR + '/Settings/GameInfo.json', JSON.stringify(config, null, 4), 'utf8')

        let proc = spawn(
            sh.GAMESERVER_DIR + '/' + sh.GAMESERVER_EXE,
            [ '--port', sh.GAMESERVER_PORT.toString() ],
            {
                cwd: sh.GAMESERVER_DIR
            }
        )
        proc.stdout.setEncoding('utf8');
        proc.on('close', (code) => {
            for(let player of players){
                player.ready = false
                player.champion = undefined
                /*await*/ player.endGame(code || 0)
            }
        })

        await new Promise<void>((res, rej) => {
            //proc.on('close', (code) => rej(code))
            proc.stdout.on('data', function ondata(data){
                let str = data.toString()
                //let lines = str.split(/(\r?\n)/g)
                if(str.includes('Server is ready, clients can now connect')){
                    proc.stdout.off('data', ondata)
                    res()
                }
            })
        })

        for(let player of players){
            /*await*/ player.launchGame('', sh.GAMESERVER_PORT, player.blowfish, player.id)
        }
    }
}