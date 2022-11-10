import { WebSocket, RawData } from 'ws';
import { debug } from './shared';

type FilterConditionally<Source, Condition> = Pick<Source, { [K in keyof Source]: Source[K] extends Condition ? K : never }[keyof Source]>;

type RPCFunction = Function //((...args: any[]) => Promise<any>) & { rpc?: boolean }
export type RemoteType<Prop extends object, Meth extends object> = Prop & FilterConditionally<Meth, RPCFunction>

export function remote<Prop extends object, Meth extends object>(
    ws: WebSocket, base: Prop, cls: new(...args: any[]) => Meth, local?: object
){
    let proto = cls.prototype
    let remote: Remote
    let proxy = new Proxy(base, {
        get(base, p, receiver) {
            let func = (proto as any)[p]
            if(typeof p === 'string' && !(p in base) && typeof func === 'function' && func.rpc === true){
                return ((base as any)[p] = (...args: any[]) => remote.apply(p, args))
            }
            return Reflect.get(base, p, receiver)
        },
    }) as RemoteType<Prop, Meth>
    remote = new Remote(ws, proxy, local)
    return proxy
}

export function local<Prop extends object, Meth extends object>(
    base: Prop, proto: Meth, other: any
){
    let proxy = new Proxy(base, {
        get(base, p, receiver) {
            let func = (proto as any)[p]
            if(typeof p === 'string' && !(p in base) && typeof func === 'function' && func.rpc === true){
                return ((base as any)[p] = function(...args: any[]){
                    let that = (this === proxy) ? proto : this
                    return (func as Function).apply(that, args.concat([ other.other ]))
                })
            }
            return Reflect.get(base, p, receiver)
        },
    }) as RemoteType<Prop, Meth>
    return proxy
}

export function rpc(obj: any, key: string /*, desc: PropertyDescriptor*/){
    obj[key].rpc = true
    //desc.value.rpc = true
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
        ws.on('message', async (data) => {
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
                    ws.send(JSON.stringify(msg_out))
                }
            }
        })
    }

    apply(func: string, args?: any[]){
        let ws = this.ws
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
            let onall = () => {
                ws.on('message', onmessage)
                ws.on('close', onclose)
                ws.on('error', onerror)
                ws.on('unexpected-response', onunexpectedresponse)
            }
            let offall = () => {
                ws.off('message', onmessage)
                ws.off('close', onclose)
                ws.off('error', onerror)
                ws.off('unexpected-response', onunexpectedresponse)
                return true
            }
            let onmessage = (data: RawData) => {
                let msg_in = JSON.parse(data.toString('utf8'))
                if (msg_in.id === msg_out.id) {
                    offall()
                    if (msg_in.error !== undefined) {
                        rej(msg_in.error)
                    } else {
                        res(msg_in.data)
                    }
                }
            }
            let onclose = (code: number, reason: Buffer) => {
                debug.error('close', code, reason)
                offall() && rej({ code, reason })
            }
            let onerror = (err: Error) => {
                debug.error('error', err)
                offall() && rej(err)
            }
            let onunexpectedresponse = (request: any/*ClientRequest*/, response: any/*IncomingMessage*/) => {
                debug.error('unexpected-response', request, response)
                offall() && rej({ request, response })
            }

            onall()

            ws.send(JSON.stringify(msg_out))
        })
    }
}