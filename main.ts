import prompts from 'prompts';
import DHT from 'bittorrent-dht';
import sha1 from 'simple-sha1';
import { WebSocket, WebSocketServer } from 'ws';

const WS_PORT = 8080
const DHT_PORT = 20000
const DHT_REANNOUNCE_INTERVAL = 15 * 60 * 1000

const INFO_HASH = sha1.sync('nonexistent')

class Server {
    ws: WebSocket
    host: string
    port: number

    rtt?: number

    constructor(ws: WebSocket, host: string, port: number) {
        this.ws = ws
        this.host = host
        this.port = port
    }
    async ping() {
        await response(this.ws, { type: 'ping' })
    }
    async join(team?: number) {
        await response(this.ws, { type: 'join', team } as any)
    }
}

class Player {
    champion?: string
}
class RemotePlayer extends Player {
    ws: WebSocket
    host: string
    port: number
    constructor(ws: WebSocket, host: string, port: number) {
        super()
        this.ws = ws
        this.host = host
        this.port = port
    }
}
class LocalPlayer extends Player {}

let { action } = await prompts({
    name: 'action',
    message: 'Select action',
    type: 'select',
    choices: [
        { title: 'Create custom game', value: 'create' },
        { title: 'Join   custom game', value: 'join' },
    ]
})

const dht = new DHT()
dht.listen(DHT_PORT, () => {
    console.log('DHT is now listening on', DHT_PORT)
})

let response = (ws: WebSocket, msg_out: { type: string }, timeout?: number, onTimeout = (res, rej) => rej('timeout')) => new Promise((res, rej) => {
    let timeoutInterval
    let msg_out_id = (Math.random() * (Math.pow(2, 31) - 1)) | 0
    let cb = (data) => {
        let msg_in = JSON.parse(data.toString('utf8'))
        if (msg_in.type == msg_out.type && msg_in.id === msg_out_id) {
            ws.off('message', cb)
            if (timeout !== undefined) {
                clearTimeout(timeoutInterval)
            }
            if (msg_in.error !== undefined) {
                rej(msg_in.error)
            } else {
                res(msg_in)
            }
        }
    }
    ws.on('message', cb)
    if (timeout !== undefined) {
        timeoutInterval = setTimeout(() => {
            ws.off('message', cb)
            onTimeout(res, rej)
        })
    }
    ws.send(JSON.stringify(msg_out))
})

if (action === 'create') {

    let players = new Map<string, Player>()
    players.set('local', new LocalPlayer())

    let playerPrompt
    let getPlayerChoices = () => {
        let ret = [...players.entries()]
            .map(([k, v]) => ({
                title: k,
                value: v
            }))
        ret.unshift(
            { title: 'START', value: undefined as any }
        )
    }
    let updatePlayerPrompt = () => {
        if (!playerPrompt) {
            return
        }
        playerPrompt.choices = getPlayerChoices()
        playerPrompt.render()
    }

    /*
    let { name } = await prompts({
        type: 'text',
        name: 'name',
        message: 'Enter server name',
        initial: 'TEST SERVER'
    })
    */

    let announce = () => {
        dht.announce(INFO_HASH, WS_PORT, () => {
            console.log('announced self')
        })
    }
    let annouceInterval = setInterval(announce, DHT_REANNOUNCE_INTERVAL)
    announce()

    const wss = new WebSocketServer({ port: WS_PORT })
    console.log('WS is now listening on', WS_PORT)

    wss.on('connection', function connection(ws, req) {
        ws.on('message', function message(data) {
            let msg = JSON.parse(data.toString('utf8'))
            let host = req.socket.remoteAddress
            let port = req.socket.remotePort
            if (!(host && port)) {
                let error = 'remoteAddress and/or remotePort is undefined'
                ws.send(JSON.stringify({ id: msg.id, type: msg.type, error }))
                return
            }
            let playerId = host + ':' + port
            let player = players.get(playerId)
            if (msg.type === 'ping') {
                ws.send(JSON.stringify({ id: msg.id, type: msg.type }))
            } else if (msg.type === 'join') {
                let error: string|undefined = undefined
                if (player) {
                    error = 'already joined'
                } else {
                    player = new RemotePlayer(ws, host, port)
                    players.set(playerId, player)

                    updatePlayerPrompt()
                }
                ws.send(JSON.stringify({ id: msg.id, type: msg.type, error }))
                //TODO: broadcast player number change
            } else if(msg.type === 'select_champion') {
                let error: string|undefined = undefined
                ws.send(JSON.stringify({ id: msg.id, type: msg.type, error }))

                if([...players.values()].every(v => v.champion !== undefined)){
                    
                }
            }
        })
    })

    let { player } = await prompts({
        type: 'select',
        name: 'player',
        message: 'Lobby',
        choices: getPlayerChoices(),
        onRender() {
            if (this.firstRender) {
                playerPrompt = this
            }
        }
    } as any)



} else if (action === 'join') {
    let servers = new Map<string, Server>();

    let serverPrompt
    let getServerChoices = () => (
        [...servers.values()]
            .filter(v => v.rtt !== undefined)
            .map(v => ({
                title: `${v.rtt!.toString().padStart(3, ' ')} ${v.host}:${v.port}`,
                value: v
            }))
    )
    let updateServerPrompt = () => {
        if (!serverPrompt) {
            return
        }
        serverPrompt.choices = getServerChoices()
        serverPrompt.render()
    }

    dht.on('peer', async (peer, infoHash, from) => {
        let peerId = peer.host + ':' + peer.port
        let fromId = from.address + ':' + from.port
        let server = servers.get(peerId)
        if (server) {
            return
        }

        console.log('found potential peer ' + peerId + ' through ' + fromId)

        try {
            let ws = new WebSocket('ws://' + peerId)
            server = new Server(ws, peer.host, peer.port)
            servers.set(peerId, server)

            let localTime1 = Date.now()
            await server.ping()
            let localTime2 = Date.now()
            server.rtt = (localTime2 - localTime1) // 2

            updateServerPrompt()
        } catch (e) {
            console.error(e)
        }
    })
    dht.lookup(INFO_HASH, () => {
        console.log('lookup')
    })
    let { server }: { server: Server } = await prompts({
        type: 'select',
        name: 'server',
        message: 'Select server',
        choices: getServerChoices(),
        onRender() {
            if (this.firstRender) {
                serverPrompt = this
            }
        }
    } as any)
    try {
        await server.join()
        console.log('joined')
        server.ws.on('message', async (data) => {
            let msg = JSON.parse(data.toString('utf8'))
            if(msg.type === 'start'){
                let { champion } = await prompts({
                    type: 'select',
                    name: 'champion',
                    choices: [
                        { title: 'Singed', value: 'Singed' }
                    ]
                })
                await response(server.ws, { type: 'select_champion', champion } as any)
            }
        })
    } catch (e) {
        console.error(e)
    }
}