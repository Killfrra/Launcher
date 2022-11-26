import WebTorrent from 'webtorrent'
//@ts-ignore
import sodium from 'sodium-universal'
import sha1 from 'simple-sha1'

const BTPK_PREFIX = 'urn:btpk:'
const BITH_PREFIX = 'urn:btih:'

function verify(signature: Buffer, message: Buffer, publicKey: Buffer) {
    return sodium.crypto_sign_verify_detached(signature, message, publicKey)
}

function sign(message: Buffer, publicKey: Buffer, secretKey: Buffer) {
    const signature = Buffer.alloc(sodium.crypto_sign_BYTES)
    sodium.crypto_sign_detached(signature, message, secretKey)
    return signature
}

type Callback<Data = any> = (err?: any, res?: Data) => any

type DHTGetCBData = {
    v: any
    id: string
    k: string
    sig: string
    seq: number
}

type DHTPutOpts = {
    k: Buffer | string
    v: any
    seq: number
    cas?: number
    salt?: Buffer
} & ({
    sign: (buf: Buffer) => Buffer
} | {
    sig: string
})

type DHT = {
    get(key: string, opts: any, cb: Callback<DHTGetCBData>): void
    get(key: string, cb: Callback<DHTGetCBData>): void
    put(opts: DHTPutOpts, cb: Callback): void
}

export default class MutableWebTorrent extends WebTorrent {
    
    //@ts-ignore
    dht: DHT

    constructor(options?: WebTorrent.Options & { dht?: { verify?: Function } }) {
        options = options || {}
        options.dht = options.dht || {}
        options.dht.verify = verify
        super(options)
    }

    addMutable(magnetURI: string, options?: WebTorrent.TorrentOptions, callback: (torrent: WebTorrent.Torrent) => any = noop): void {
        
        const parsed = new URL(magnetURI)
        const xs = parsed.searchParams.get('xs')
        const isMutableLink = xs && xs.startsWith(BTPK_PREFIX)
        if (!isMutableLink) {
            super.add(magnetURI, options, callback)
            return
        }

        const publicKeyString = xs.slice(BTPK_PREFIX.length)
        //const publicKey = Buffer.from(publicKeyString, 'hex')

        this.resolve(publicKeyString, (err, res) => {
            if (err) {
                return this.emit('error', err)
            }
            if (!res) {
                return this.emit('error', new Error('Unable to resolve magnet link'))
            }
            const finalMangetURI = magnetURI + `&xt=${BITH_PREFIX}${res.infoHash.toString('hex')}`
            super.add(finalMangetURI, options, (torrent) => {
                //torrent.publicKey = publicKey
                //torrent.sequence = res.sequence || 0
                callback(torrent)
            })
        })
    }

    resolve(publicKeyString: string, callback: Callback<{ infoHash: Buffer, sequence: number }>) {
        let publicKey = Buffer.from(publicKeyString, 'hex')
        sha1(publicKey, (targetID) => {
            this.dht.get(targetID, (err, res) => {
                if (err) {
                    return callback(err)
                }
                let infoHash = res?.v?.ih
                let sequence = res?.seq
                if (infoHash !== undefined && sequence !== undefined) {
                    return callback(null, { infoHash, sequence })
                } else {
                    //TODO: better error message
                    return callback(new Error('Unable to parse response'))
                }
            })
        })
    }

    publish(publicKeyString: string, secretKeyString: string, infoHashString: string, options = { sequence: 1 }, callback: Callback = noop) {
        
        const buffPubKey = Buffer.from(publicKeyString, 'hex')
        const buffSecKey = Buffer.from(secretKeyString, 'hex')

        sha1(buffPubKey, (targetID) => {
            
            const opts = {
                k: buffPubKey,
                seq: options.sequence,
                v: {
                    ih: Buffer.from(infoHashString, 'hex')
                },
                sign: (buf: Buffer) => {
                    return sign(buf, buffPubKey, buffSecKey)
                },
            }

            this.dht.get(targetID, (err, res) => {
                if (err) {
                    return callback(err)
                }
                let sequence = opts.seq
                if(res && res.seq) {
                    sequence = opts.seq = res.seq + 1
                }
                this.dht.put(opts, (putErr, hash) => {
                    if (putErr) {
                        return callback(putErr)
                    }
                    const magnetURI = `magnet:?xs=${BTPK_PREFIX}${publicKeyString}`
                    callback(null, {
                        magnetURI,
                        infohash: infoHashString,
                        sequence
                    })
                })
            })
        })
    }

    republish(publicKeyString: string, callback: Callback = noop) {
        const buffPubKey = Buffer.from(publicKeyString, 'hex')
        sha1(buffPubKey, (targetID) => {
            this.dht.get(targetID, (err, res) => {
                if (err || !res) {
                    callback(err)
                    callback = noop //TODO: Investigate
                    return
                }
                this.dht.put(res, (err) => {
                    callback(err)
                })
            })
        })
    }

    static createKeypair(seed?: any) {
        const publicKey = Buffer.alloc(sodium.crypto_sign_PUBLICKEYBYTES)
        const secretKey = Buffer.alloc(sodium.crypto_sign_SECRETKEYBYTES)
        if (seed) {
            sodium.crypto_sign_seed_keypair(publicKey, secretKey, seed)
        } else {
            sodium.crypto_sign_keypair(publicKey, secretKey)
        }
        return {
            publicKey: publicKey.toString('hex'),
            secretKey: secretKey.toString('hex')
        }
    }
}

function noop() { }