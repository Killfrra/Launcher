import { WebSocket } from 'ws';

class Local {
    async call(func: string, args?: any[], timeout?: number){
        let f = this[func]
        if(typeof f === 'function'){
            return await (f as Function).apply(this, args)
        }
    }
}

class Server extends Local {
    private prop: string = '42'
    get_rooms(){
        return []
    }
}

class Remote {
    ws: WebSocket

    constructor(ws){
        this.ws = ws
        this.ws.on('message', async (data) => {
            let msg_in = JSON.parse(data.toString('utf8'))
            if(msg_in.type === 'call'){
                let func = this[msg_in.data.func]
                if(typeof func === 'function'){
                    let data: any = undefined
                    let error: any = undefined
                    try {
                        data = await (func as Function).apply(this, msg_in.data.args)
                    } catch (e) {
                        error = e
                    }
                    let msg_out = {
                        id: msg_in.id,
                        data,
                        error
                    }
                    this.ws.send(JSON.stringify(msg_out))
                }
            }
        })
    }

    call(func: string, args?: any[], timeout?: number){
        return new Promise((res, rej) => {
            let timeoutInterval
            let id = Math.floor(Math.random() * (Math.pow(2, 32) - 1)).toString(36)
            let msg_out = {
                id,
                type: 'call',
                data: {
                    func,
                    args
                }
            }
            let cb = (data) => {
                let msg_in = JSON.parse(data.toString('utf8'))
                if (msg_in.id === msg_out.id) {
                    this.ws.off('message', cb)
                    if (timeout !== undefined) {
                        clearTimeout(timeoutInterval)
                    }
                    if (msg_in.error !== undefined) {
                        rej(msg_in.error)
                    } else {
                        res(msg_in.data)
                    }
                }
            }
            this.ws.on('message', cb)
            this.ws.send(JSON.stringify(msg_out))
            
            if (timeout !== undefined) {
                timeoutInterval = setTimeout(() => {
                    this.ws.off('message', cb)
                    rej('timeout')
                })
            }
        })
    }
}

class Client {

}