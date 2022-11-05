import { WebSocket, RawData } from 'ws';

type FilterConditionally<Source, Condition> = Pick<Source, {[K in keyof Source]: Source[K] extends Condition ? K : never}[keyof Source]>;

export type RemoteType<Prop extends object, Meth extends object> = Prop & FilterConditionally<Meth, Function>

export function remote<Prop extends object, Meth extends object>(
    ws: WebSocket, base: Prop, cls: new(...args: any[]) => Meth, local?: object
){
    let fake = base
    let proto = cls.prototype
    let remote: Remote
    let proxy = new Proxy(fake, {
        get(fake, p, receiver) {
            if(typeof p === 'string' && !(p in fake) && typeof proto[p] === 'function'){
                return ((fake as any)[p] = (...args: any[]) => remote.apply(p, args))
            }
            return Reflect.get(fake, p, receiver)
        },
    }) as RemoteType<Prop, Meth>
    remote = new Remote(ws, proxy, local)
    return proxy
}

export function local<Prop extends object, Meth extends object>(
    base: Prop, proto: Meth, other: any
){
    let fake = base || {}
    let proxy = new Proxy(fake, {
        get(fake, p, receiver) {
            let func = (proto as any)[p]
            if(typeof p === 'string' && !(p in fake) && typeof func === 'function'){
                return ((fake as any)[p] = function(...args: any[]){
                    let that = (this === proxy) ? proto : this
                    return (func as Function).apply(that, args.concat([ other.other ]))
                })
            }
            return Reflect.get(fake, p, receiver)
        },
    }) as RemoteType<Prop, Meth>
    return proxy
}

class Remote {
    ws: WebSocket
    caller: object
    constructor(ws: WebSocket, caller: object, local?: object){
        this.ws = ws
        this.caller = caller
        if(!local){
            return
        }
        this.ws.on('message', async (data) => {
            let msg_in = JSON.parse(data.toString('utf8'))
            if(msg_in.type === 'call'){
                let funcname = msg_in.data?.func
                let func = (local as any)[funcname]
                if(typeof func === 'function'){
                    let data: any = undefined
                    let error: any = undefined
                    try {
                        data = await (func as Function).apply(local, msg_in.data.args.concat([ this.caller ]))
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

    apply(func: string, args?: any[]){
        return new Promise((res, rej) => {
            let id = Math.floor(Math.random() * (Math.pow(2, 32) - 1)).toString(36)
            let msg_out = {
                id,
                type: 'call',
                data: {
                    func,
                    args
                }
            }
            let cb = (data: RawData) => {
                let msg_in = JSON.parse(data.toString('utf8'))
                if (msg_in.id === msg_out.id) {
                    this.ws.off('message', cb)
                    if (msg_in.error !== undefined) {
                        rej(msg_in.error)
                    } else {
                        res(msg_in.data)
                    }
                }
            }
            this.ws.on('message', cb)
            this.ws.send(JSON.stringify(msg_out))
        })
    }
}

/*
class Local {
    async call(func: string, args?: any[]){
        let f = this[func]
        if(typeof f === 'function'){
            return await (f as Function).apply(this, args)
        }
    }
}
*/