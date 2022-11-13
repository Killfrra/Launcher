import { WebSocket, RawData } from "ws"
import { debug } from './shared'

export function rpc(obj: any, key: string /*, desc: PropertyDescriptor*/){
    obj[key].rpc = true
    //desc.value.rpc = true
}

type JSONDataType = string | number | {} | { [k: string]: JSONDataType } | JSONDataType[] | boolean | null
type CFArgs = JSONDataType[]
type CFReturn = JSONDataType

// RemotelyCallableLocalFunction
type RCLF<ARGS extends CFArgs, RETURN extends (CFReturn | void)> =
    (...args: [...ARGS, LorR<any, any>]) => (RETURN | Promise<RETURN>)

// LocallyCallableRemoteFunction
type LCRF<ARGS extends CFArgs, RETURN extends CFReturn> =
    (...args: ARGS) => Promise<RETURN>

type RCLF2LCRF<CALLED> = {
    [K in keyof CALLED]:
    CALLED[K] extends RCLF<infer ARGS, infer RETURN> ?
    LCRF<ARGS, RETURN extends void ? null : RETURN>
    : undefined
}

type Ctr<T> = new (...args: any[]) => T

// Local or Remote
export abstract class LorR<DEFAULT_CALLED = undefined, CALLED_OVERLAY = {}>{
    p: CALLED_OVERLAY
    m: RCLF2LCRF<DEFAULT_CALLED>
    constructor(p: CALLED_OVERLAY) {
        this.p = p
        let cache: Record<string, LCRF<any, any>> = {}
        let remote = this
        this.m = new Proxy(cache as any, {
            get(obj: typeof cache, prop, receiver) {
                if (typeof prop === 'string') {
                    let cfunc = obj[prop]
                    if (cfunc !== undefined) {
                        return cfunc
                    }
                    return obj[prop] = (...args: CFArgs) => remote.apply(prop, args)
                }
                return undefined
            },
        })
    }
    protected abstract apply(fname: string, args: CFArgs): Promise<CFReturn>
}

export class Local<DEFAULT_CALLED, CALLED_OVERLAY> extends LorR<DEFAULT_CALLED, CALLED_OVERLAY>{
    caller?: Local<any, any>
    private d: DEFAULT_CALLED
    constructor(d: DEFAULT_CALLED, p: CALLED_OVERLAY) {
        super(p)
        this.d = d
    }
    protected async apply(fname: string, args: CFArgs) {
        let called: any = this.d
        let func = called[fname]
        if (typeof func === 'function' && func.rpc) {
            return await (func as Function).apply(called, [...args, this.caller!]) as CFReturn
        }
        return null
    }
}

type RequestMessage = [id: number, fname: string, ...args: JSONDataType[]]
type ResponseMessage = [id: number, succ: boolean, ret: JSONDataType]

function isRequestMessage(data: JSONDataType): data is RequestMessage {
    return Array.isArray(data) && data.length >= 2 && typeof data[0] === 'number' && typeof data[1] === 'string'
}

function isResponseMessage(data: JSONDataType): data is RequestMessage {
    return Array.isArray(data) && data.length === 3 && typeof data[0] === 'number' && typeof data[1] === 'boolean'
}

export class Remote<CALLER, DEFAULT_CALLED, CALLED_OVERLAY> extends LorR<DEFAULT_CALLED, CALLED_OVERLAY>{
    private static nextMsgID = 0;
    private ws: WebSocket
    private c: CALLER
    constructor(c: CALLER, ws: WebSocket, d: Ctr<DEFAULT_CALLED>, p: CALLED_OVERLAY) {
        super(p)
        this.c = c
        this.ws = ws
        ws.on('message', async (raw_data) => {
            let data = JSON.parse(raw_data.toString('utf8')) as JSONDataType
            if (isRequestMessage(data)) {
                let [ id, fname, ...args ] = data
                let called: any = this.c
                let func = called[fname]
                if(typeof func === 'function' && func.rpc){
                    let succ = false
                    let ret: JSONDataType
                    try {
                        ret = await (func as Function).apply(called, [ ...args, this ])
                        succ = true
                    } catch(e) {
                        if(e !== undefined){
                            ret = e
                        } else {
                            ret = 'unknown'
                        }
                    }
                    ws.send(JSON.stringify([ id, succ, ret] as ResponseMessage))
                }
            }
        })
    }
    protected apply(fname: string, args: CFArgs) {
        let ws = this.ws
        return new Promise<CFReturn>((res, rej) => {

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

            let out_id = ((Remote.nextMsgID++) << 1) >>> 1
            let onmessage = (raw_data: RawData) => {
                let data = JSON.parse(raw_data.toString('utf8')) as JSONDataType
                if (isResponseMessage(data)) {
                    let [ in_id, succ, ret ] = data
                    if (in_id === out_id) {
                        offall();
                        if (succ) {
                            res(ret)
                        } else {
                            rej({ type: 'message', error: ret })
                        }
                    }
                }
            }
            let onclose = (code: number, reason: Buffer) => {
                debug.error('close', code, reason)
                offall() && rej({ type: 'onclose', error: { code, reason } })
            }
            let onerror = (error: Error) => {
                debug.error('error', error)
                offall() && rej({ type: 'error', error })
            }
            let onunexpectedresponse = (request: any/*ClientRequest*/, response: any/*IncomingMessage*/) => {
                debug.error('unexpected-response', request, response)
                offall() && rej({ type: 'unexpected-response', error: { request, response } })
            }

            onall();

            ws.send(JSON.stringify([out_id, fname, ...args] as RequestMessage))
        })
    }
}