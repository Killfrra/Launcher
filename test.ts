import { WebSocket } from "ws"

type JSONDataType = string | number | { [k:string]: JSONDataType } | JSONDataType[] | boolean | null

// RemotelyCallableLocalFunction
type RCLF<CALLER, CALLED, ARGS extends JSONDataType[], RETURN extends (JSONDataType | void)> =
    (...args: [...ARGS, LorR<CALLED, CALLER, any>]) => (RETURN | Promise<RETURN>)

// LocallyCallableRemoteFunction
type LCRF<ARGS extends JSONDataType[], RETURN extends (JSONDataType | void)> =
    (...args: ARGS) => Promise<RETURN>

type RCLF2LCRF<CALLER, CALLED> = {
    [K in keyof CALLED]:
    CALLED[K] extends RCLF<CALLER, CALLED, infer ARGS, infer RETURN> ?
        LCRF<ARGS, RETURN>
        : never
}
/*
type FilterKeys<OF, BY> = {
    [K in keyof OF]: OF[K] extends BY ? K : never
}[keyof OF]
type FilterEntries<OF, BY> = Pick<OF, FilterKeys<OF, BY>>
type Overlap<A, B> = {
    [K in (keyof A | keyof B)]: K extends keyof B ? B[K] : K extends keyof A ? A[K] : never
}
*/

type Ctr<T> = new (...args: any[]) => T

// Local or Remote
abstract class LorR<CALLER, CALLED, CALLED_OVERLAY>{
    c: CALLER
    p: CALLED_OVERLAY
    m: RCLF2LCRF<CALLER, CALLED>
    constructor(c: CALLER, m: CALLED, p: CALLED_OVERLAY){
        this.c = c
        this.p = p
        let cache: Record<string, LCRF<any, any>> = {}
        let remote = this
        this.m = new Proxy(cache as any, {
            get(obj: typeof cache, prop, receiver) {
                if(typeof prop === 'string'){
                    let cfunc = obj[prop]
                    if(cfunc !== undefined){
                        return cfunc
                    }
                    let func = (m as any)[prop]
                    if(typeof func === 'function'){
                        return (obj[prop] = (...args: any[]) => remote.apply(prop, args))
                    }
                }
                return undefined
            },
        })
    }
    async apply(prop: string, args: any[]){

    }
}

class Local<CALLER, CALLED, CALLED_OVERLAY> extends LorR<CALLER, CALLED, CALLED_OVERLAY>{
    constructor(c: CALLER, m: CALLED, p: CALLED_OVERLAY){
        super(c, m, p)
    }
    async apply(prop: string, args: any[]){

    }
}

class Remote<CALLER, CALLED, CALLED_OVERLAY> extends LorR<CALLER, CALLED, CALLED_OVERLAY>{
    ws: WebSocket
    constructor(c: CALLER, m: Ctr<CALLED>, p: CALLED_OVERLAY, ws: WebSocket){
        super(c, m.prototype, p)
        this.ws = ws
        ws.on('message', (data) => {

        })
    }
    async apply(prop: string, args: any[]){

    }
}

class ClientProperties {
    static nextID = 1
    id: number
    name?: string
    ready = false
    champion?: string
    blowfish = '17BLOhi6KZsTtldTsizvHg=='
    constructor(){
        this.id = ClientProperties.nextID++
    }
}

class ServerProperties {
    id: string
    host: string
    port: number
    name?: string
    constructor(host: string, port: number){
        this.id = host + ':' + port
        this.host = host
        this.port = port
    }
}

type Client = Local<LocalServer, LocalClient, ClientProperties>
type Server = Local<LocalClient, LocalServer, ServerProperties>

class LocalClient {
    blowfish = 0;
    async addRooms(rooms: { id: number, name: string }[], server: Server){
    }
}

class LocalServer {
    addRoom(name: string, caller: Client){
    }
}

let lc = new LocalClient()
let ls = new LocalServer()
let c = new Local(ls, lc, new ClientProperties())
let s = new Local(lc, ls, new ServerProperties('', 0))

c.m.addRooms([]);
c.p.blowfish;
s.m.addRoom('');