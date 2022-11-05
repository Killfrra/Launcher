"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.local = exports.remote = void 0;
function remote(ws, base, cls, local) {
    let fake = base;
    let proto = cls.prototype;
    let remote;
    let proxy = new Proxy(fake, {
        get(fake, p, receiver) {
            if (typeof p === 'string' && !(p in fake) && typeof proto[p] === 'function') {
                return (fake[p] = (...args) => remote.apply(p, args));
            }
            return Reflect.get(fake, p, receiver);
        },
    });
    remote = new Remote(ws, proxy, local);
    return proxy;
}
exports.remote = remote;
function local(base, proto, other) {
    let fake = base || {};
    let proxy = new Proxy(fake, {
        get(fake, p, receiver) {
            let func = proto[p];
            if (typeof p === 'string' && !(p in fake) && typeof func === 'function') {
                return (fake[p] = function (...args) {
                    let that = (this === proxy) ? proto : this;
                    return func.apply(that, args.concat([other.other]));
                });
            }
            return Reflect.get(fake, p, receiver);
        },
    });
    return proxy;
}
exports.local = local;
class Remote {
    constructor(ws, caller, local) {
        this.ws = ws;
        this.caller = caller;
        if (!local) {
            return;
        }
        this.ws.on('message', async (data) => {
            let msg_in = JSON.parse(data.toString('utf8'));
            if (msg_in.type === 'call') {
                let funcname = msg_in.data?.func;
                let func = local[funcname];
                if (typeof func === 'function') {
                    let data = undefined;
                    let error = undefined;
                    try {
                        data = await func.apply(local, msg_in.data.args.concat([this.caller]));
                    }
                    catch (e) {
                        error = e;
                    }
                    let msg_out = {
                        id: msg_in.id,
                        data,
                        error
                    };
                    this.ws.send(JSON.stringify(msg_out));
                }
            }
        });
    }
    apply(func, args) {
        return new Promise((res, rej) => {
            let id = Math.floor(Math.random() * (Math.pow(2, 32) - 1)).toString(36);
            let msg_out = {
                id,
                type: 'call',
                data: {
                    func,
                    args
                }
            };
            let cb = (data) => {
                let msg_in = JSON.parse(data.toString('utf8'));
                if (msg_in.id === msg_out.id) {
                    this.ws.off('message', cb);
                    if (msg_in.error !== undefined) {
                        rej(msg_in.error);
                    }
                    else {
                        res(msg_in.data);
                    }
                }
            };
            this.ws.on('message', cb);
            this.ws.send(JSON.stringify(msg_out));
        });
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
//# sourceMappingURL=remote.js.map