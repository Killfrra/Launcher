import LocalServer from "./server";
import { WebSocket } from 'ws';
import * as sh from './shared'
import { debug, hash, TeamID } from './shared'
import { Local, Remote, LorR, rpc } from './remote'
import prompts from 'prompts'
import DSP from './dynsel'
import kleur from 'kleur'
import net from 'net'
import { spawn } from 'child_process'

const isIP = (i: string) => net.isIP(i) != 0
const base64regex = /^(?:[A-Za-z0-9+\\/]{4})*(?:[A-Za-z0-9+\\/]{2}(==)?|[A-Za-z0-9+\\/]{3}=?)?$/
const isBase64 = (i: string) => {
    return base64regex.test(i)
}

type u = undefined

enum ServerStatus { potential, unreachable, connected, disconnected }
class ServerProperties {
    id: string
    host: string
    port: number
    name?: string
    rooms = new Map<number, Room>()
    status = ServerStatus.potential
    ws?: WebSocket
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
    team: TeamID
    constructor(id: number, name: string, team: TeamID){
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
    private team?: TeamID
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
    private lookupInterval?: NodeJS.Timer
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
            value?: { join: TeamID } | { startGame: true }
            disabled?: boolean;
            description?: string;
        })[] = [
            {
                value: { startGame: true }, title: 'Report readiness',
                disabled: false
            },
            {
                value: { join: TeamID.BLUE }, title: `Join ${kleur.blue('blue')} team`,
                disabled: this.team === TeamID.BLUE
            },
            {
                value: { join: TeamID.PURP }, title: `Join ${kleur.red('red')} team`,
                disabled: this.team === TeamID.PURP
            },
            /*
            {
                value: { join: TeamID.SPEC }, title: `Join ${kleur.grey('spectators')}`,
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

    setName(to: string){
        this.name = to
        return this
    }

    private connectServer(prop: ServerProperties){
        let ws = new WebSocket(`ws://${prop.host}:${prop.port}`)
        let server = new Remote(this, ws, LocalServer, prop)
        server.p.ws = ws

        //TODO: X?
        ws.on('open', () => {
            /*await*/ this.onServerConnect(server)
        })
        ws.on('close', (code: number, reason: Buffer) => {
            debug.error('close', code, reason)
            /*await*/ this.onServerDisconnect(server)
        })
        ws.on('error', (err) => {
            debug.error('error', err)
            /*await*/ this.onServerDisconnect(server)
        })
        ws.on('unexpected-response', (request: any/*ClientRequest*/, response: any/*IncomingMessage*/) => {
            debug.error('unexpected-response', request, response)
            /*await*/ this.onServerDisconnect(server)
        })
    }

    private async disconnectServer(prop: ServerProperties)
    {
        prop.ws?.terminate()
    }

    private async onServerConnect(server: Server)
    {
        //TODO: remove from other lists
        this.servers.connected.set(server.p.id, server)
        server.p.status = ServerStatus.connected
        await this.getRooms(server)
    }

    private async onServerDisconnect(server: Server)
    {
        this.removeAllRooms(server)
    }

    async addLocalServer(localServer: LocalServer){
        let server = new Local(localServer, new ServerProperties('', sh.WS_PORT))
        await this.onServerConnect(server)
        return server
    }

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

    startLookup()
    {
        if(this.lookupInterval)
        {
            return
        }
        let lookup = () => {
            this.inLookup = true
            this.dht.lookup(sh.INFO_HASH, () => {
                this.inLookup = false
                this.roomPrompt.update()
            })
        }
        this.lookupInterval = setInterval(lookup, sh.DHT_LOOKUP_INTERVAL)
        lookup()
    }

    endLookup()
    {
        clearInterval(this.lookupInterval)
    }

    async screenRooms()
    {
        while(true)
        {
            let room = await this.roomPrompt.show()
            if(room === undefined)
            {
                break
            }
            await this.screenRoom(room.id, room.server)
        }
    }

    async screenRoom(roomID: number, server: Server)
    {
        let room = await this.joinRoom(roomID, server)
        while(true)
        {
            let team = this.team;
            let action = await this.teamPrompt.show()
            if(action === undefined)
            {
                await this.leaveRoom()
                break
            }
            else if('join' in action)
            {
                team = action.join
                if(this.team != team){
                    await server.m.switchTeam(team)
                    this.team = team
                }
            }
            else if('startGame' in action)
            {
                this.ready = true
                let everybodyReady = await server.m.startGame()
                if(!everybodyReady)
                {
                    console.log('Waiting for the game to start...')
                }
                await this.screenGameEnd();
            }
        }
    }

    ongameend?: () => void
    screenGameEnd()
    {
        return new Promise<void>((res, rej) => {
            this.ongameend = () => {
                this.ongameend = undefined
                res()
            }
        })
    }

    async joinRoom(roomID: number, server: Server){
        let { id, team, players } = await server.m.joinRoom(roomID, this.name!)
        this.id = id
        this.team = team
        this.room = server.p.rooms.get(roomID)!
        for(let p of players){
            let player = new Player(p.id, p.name, p.team)
            this.room.players.clear()
            this.room.players.set(player.id, player)
        }
        return this.room
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
    addPlayer(p: {id: number, team: TeamID, name: string}, server: Server){
        if(server != this.room?.server){
            throw 'wrong server'
        }
        let player = new Player(p.id, p.name, p.team)
        this.room.players.set(player.id, player)
        this.teamPrompt.update()
    }

    @rpc
    switchTeam(id: number, team: TeamID, server: Server){
        if(server != this.room?.server){
            throw 'wrong server'
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
            throw 'wrong server'
        }
        this.room.players.delete(id)
        this.teamPrompt.update()
    }

    @rpc
    async selectChampion(server: Server){
        if(server != this.room?.server){
            throw 'wrong server'
        }
        let champion: u|string = (await prompts({
            type: 'autocomplete',
            name: 'name',
            message: 'Select champion',
            choices: sh.champions.map(c => ({ title: c })),
        })).name
        //TODO: handle exit
        if(champion === undefined)
        {
            throw 'player exited during champion select'
        }
        return champion
    }

    @rpc
    launchGameClient(port: number, blowfish: string, playerID: number, server: Server){
        if(server != this.room?.server){
            throw 'wrong server'
        }
        if(!(
            typeof port === 'number' &&
            typeof blowfish === 'string' && (blowfish === '' || isBase64(blowfish)) &&
            typeof playerID === 'number'
        )){
            console.log('strange connection details')
            this.ongameend?.call(null)
            throw 'strange connection details'
        }
        let host = server.p.host || '127.0.0.1'
        port = port || 5119
        blowfish = blowfish || '17BLOhi6KZsTtldTsizvHg=='
        
        let exe = sh.LEAGUE_DIR + '/' + sh.LEAGUE_EXE
        let args = [ '', '', '', `${host} ${port} ${blowfish} ${playerID}` ]
        if(sh.LEAGUE_RUNNER)
        {
            exe = sh.LEAGUE_RUNNER
            args.unshift(sh.LEAGUE_EXE)
        }
        let opts = {
            cwd: sh.LEAGUE_DIR,
            env: {
                ...process.env,
                'WINEPREFIX': sh.WINEPREFIX_DIR //TODO: hmm...
            },
            stdio: 'ignore' as any
        }
        console.log('running', exe, ...args.map(a => `'${a}'`)/*, opts*/)
        try {
            let proc = spawn(exe, args, opts)
            proc.on('close', async (code) => {
                //TODO:
            })
        } catch(e) {
            console.log(e)
        }
    }

    @rpc
    endGame(code: number, server: Server){
        if(server != this.room?.server){
            return
        }
        console.log('Server exited with code', code)
        this.ongameend?.call(null)
    }

    @rpc
    log(msg: string, server: Server){
        if(server != this.room?.server){
            return
        }
        console.log(msg)
    }

    destroy()
    {
        this.endLookup()
        if(this.room)
        {
            /*await*/ this.leaveRoom()
        }
        for(let server of this.servers.connected.values())
        {
            this.disconnectServer(server.p)
        }
    }
}