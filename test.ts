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
    constructor(c: CALLER, m: Ctr<CALLED>, p: CALLED_OVERLAY){
        this.c = c
        this.p = p
        let cache: Record<string, LCRF<any, any>> = {}
        let remote = this
        this.m = new Proxy(cache as any, {
            get(obj: typeof cache, prop, receiver) {
                if(typeof prop === 'string')
                {
                    if(!(prop in obj)){
                        let func = m.prototype[prop]
                        if(typeof func === 'function' && func.rpc === true){
                            return ((obj as any)[prop] = (...args: any[]) => remote.apply(prop, args))
                        }
                    }
                    return obj[prop]
                }
                return undefined
            },
        })
    }

    apply(prop: string, args: any[]){

    }
}

class Remote<CALLER, CALLED, CALLED_OVERLAY> extends LorR<CALLER, CALLED, CALLED_OVERLAY>{
    ws: WebSocket
    constructor(c: CALLER, m: Ctr<CALLED>, p: CALLED_OVERLAY, ws: WebSocket){
        super(c, m, p)
        this.ws = ws
        ws.on('message', (data) => {

        })
    }
    apply(prop: string, args: any[]){

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

type Client = Remote<LocalServer, LocalClient, ClientProperties>
type Server = Remote<LocalClient, LocalServer, ServerProperties>

class LocalClient {
    blowfish = 0;
    async addRooms(rooms: { id: number, name: string }[], server: Server){
    }
}

class LocalServer {
    addRoom(name: string, caller: Client){
    }
}

let s = new LocalServer()
let c = new Remote(s, LocalClient, new ClientProperties())

c.m.addRooms([]);
c.p.blowfish;
({} as Server).m.addRoom('');