import prompts, { prompt } from 'prompts';
import DHT from 'bittorrent-dht';
import sha1 from 'simple-sha1';
import express from 'express';
import fetch from 'node-fetch';

const HTTP_PORT = 8080
const DHT_PORT = 20000
const DHT_REANNOUNCE_INTERVAL = 15 * 60 * 1000

const INFO_HASH = sha1.sync('nonexistent')
//const INFO_HASH = 'e3811b9539cacff680e418124272177c47477157'

class Server {
    host: string
    port: number
    ping?: number
    constructor(host: string, port: number){
        this.host = host
        this.port = port
    }
}

class Player {
    host: string
    port: number
    constructor(host: string, port: number){
        this.host = host
        this.port = port
    }
}

let { action } = await prompts({
    name: 'action',
    message: 'Select action',
    type: 'select',
    choices: [
        { title: 'Create custom game', value: 'create'},
        { title: 'Join   custom game', value: 'join'  },
    ]
})

const dht = new DHT()
dht.listen(DHT_PORT, () => {
    console.log('DHT is now listening on', DHT_PORT)
})

if(action === 'create'){
    let maxPlayers = 12 //TODO:
    let players = new Map<string, Player>()

    let {name} = await prompts({
        type: 'text',
        name: 'name',
        message: 'Enter server name',
        initial: 'TEST SERVER'
    })

    let announce = () => {
        dht.announce(INFO_HASH, HTTP_PORT, () => {
            console.log('announced self')
        })
    }
    let annouceInterval = setInterval(announce, DHT_REANNOUNCE_INTERVAL)
    announce()

    const app = express()
    app.get('/ping', function (req, res) {
        res.json(Date.now())
    })
    app.post('/join', function (req, res) {
        let host = req.socket.remoteAddress
        let port = req.socket.remotePort
        if(!(host && port)){
            return
        }
        let playerId = host + ':' + port
        let player = players.get(playerId)
        if(player){
            return
        }
        player = new Player(host, port)
        players.set(playerId, player)
    })
    app.listen(HTTP_PORT)
    console.log('HTTP is now listening on', HTTP_PORT)

} else if(action === 'join'){
    let servers = new Map<string, Server>();

    let serverPrompt
    let updateServerPrompt = () => {
        if(!serverPrompt){
            return
        }
        serverPrompt.choices = getServerChoices()
        serverPrompt.render()
    }
    let getServerChoices = () => (
        [...servers.values()]
        .filter(v => v.ping !== undefined)
        .map(v => ({
            title: `${v.ping!.toString().padStart(3, ' ')} ${v.host}:${v.port}`,
            value: v
        }))
    )
    
    dht.on('peer', async (peer, infoHash, from) => {
        let peerId = peer.host + ':' + peer.port
        console.log('found potential peer ' + peerId + ' through ' + from.address + ':' + from.port)
        let server = servers.get(peerId)
        if(server){
            return
        }
        server = new Server(peer.host, peer.port)
        servers.set(peerId, server)
        let localTime1 = Date.now()
        let serverTime = await (await fetch('http://' + peerId + '/ping', {
            method: 'GET'
        })).json()
        let localTime2 = Date.now()
        if(typeof serverTime === 'number'){
            server.ping = ((serverTime - localTime1) + (localTime2 - serverTime)) / 2
            updateServerPrompt()
        } else {
            //TODO: error
        }
    })
    dht.lookup(INFO_HASH, () => {
        console.log('lookup')
    })
    await prompts(({
        type: 'select',
        name: 'server',
        message: 'Select server',
        choices: getServerChoices(),
        onRender(){
            if(this.firstRender){
                serverPrompt = this
            }
        }
    }) as any)
}