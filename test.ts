import { WebSocket, RawData } from "ws"
import { debug } from './shared'

type JSONDataType = string | number | {} | { [k: string]: JSONDataType } | JSONDataType[] | boolean | null
type CFArgs = JSONDataType[]
type CFReturn = JSONDataType

// RemotelyCallableLocalFunction
type RCLF<ARGS extends CFArgs, RETURN extends CFReturn> =
    (...args: [...ARGS, LorR<any, any>]) => (RETURN | Promise<RETURN>)

// LocallyCallableRemoteFunction
type LCRF<ARGS extends CFArgs, RETURN extends CFReturn> =
    (...args: ARGS) => Promise<RETURN>

type RCLF2LCRF<CALLED> = {
    [K in keyof CALLED]:
    CALLED[K] extends RCLF<infer ARGS, infer RETURN> ?
    LCRF<ARGS, RETURN>
    : undefined
}

type Ctr<T> = new (...args: any[]) => T

// Local or Remote
abstract class LorR<DEFAULT_CALLED = undefined, CALLED_OVERLAY = {}>{
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
    abstract apply(fname: string, args: CFArgs): Promise<CFReturn>
}

class Local<DEFAULT_CALLED, CALLED_OVERLAY> extends LorR<DEFAULT_CALLED, CALLED_OVERLAY>{
    caller?: Local<any, any>
    d: DEFAULT_CALLED
    constructor(d: DEFAULT_CALLED, p: CALLED_OVERLAY) {
        super(p)
        this.d = d
    }
    async apply(fname: string, args: CFArgs) {
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

class Remote<DEFAULT_CALLED, CALLED_OVERLAY> extends LorR<DEFAULT_CALLED, CALLED_OVERLAY>{
    static nextMsgID = 0;
    ws: WebSocket
    d: DEFAULT_CALLED
    constructor(ws: WebSocket, d: DEFAULT_CALLED, p: CALLED_OVERLAY) {
        super(p)
        this.ws = ws
        this.d = d
        ws.on('message', async (raw_data) => {
            let data = JSON.parse(raw_data.toString('utf8')) as JSONDataType
            if (isRequestMessage(data)) {
                let [ id, fname, ...args ] = data
                let called: any = this.d
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
    apply(fname: string, args: CFArgs) {
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

class ClientProperties {
    static nextID = 1
    id: number
    name?: string
    ready = false
    champion?: string
    blowfish = '17BLOhi6KZsTtldTsizvHg=='
    constructor() {
        this.id = ClientProperties.nextID++
    }
}

class ServerProperties {
    id: string
    host: string
    port: number
    name?: string
    constructor(host: string, port: number) {
        this.id = host + ':' + port
        this.host = host
        this.port = port
    }
}

type Client = LorR<LocalClient, ClientProperties>
type Server = LorR<LocalServer, ServerProperties>

class LocalClient {
    blowfish = 0;
    async addRooms(rooms: { id: number, name: string }[], server: Server) {
    }
}

class LocalServer {
    addRoom(name: string, caller: Client) {
        return null
    }
}

let lc = new LocalClient()
let ls = new LocalServer()
let c = new Local(lc, new ClientProperties())
let s = new Local(ls, new ServerProperties('', 0))
c.caller = s;
s.caller = c;

c.m.addRooms([]);
c.p.blowfish;
s.m.addRoom('');