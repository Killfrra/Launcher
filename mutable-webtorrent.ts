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

type u = undefined
type AddMutableOptions = WebTorrent.TorrentOptions
type AddMutableCallback = (torrent: WebTorrent.Torrent) => any
type PublishOptions = { sequence: number }
type Callback<Data = any> = (err?: any, res?: Data) => any

class MutableWebTorrent extends WebTorrent {
    constructor(options?: WebTorrent.Options) {
        let dht = options?.dht as (u | { verify: Function })
        console.assert(dht?.verify === verify)
        super(options)
    }

    addMutable(torrent: any, opts?: AddMutableOptions | AddMutableCallback, callback: AddMutableCallback = noop): void {
        let options: u | AddMutableOptions
        if (typeof opts === 'function') {
            callback = opts
        } else {
            options = opts
        }

        if (typeof torrent !== 'string') {
            super.add(torrent, options, callback)
            return
        }
        let magnetURI = torrent

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

    resolve(publicKeyString: string, callback: Callback) {
        let publicKey = Buffer.from(publicKeyString, 'hex')
        sha1(publicKey, (targetID) => {
            this.dht.get(targetID, (err, res) => {
                if (err) {
                    return callback(err)
                }
                let infoHash = res?.v?.ih
                let sequence = res?.seq
                if (typeof infoHash === 'string' && typeof sequence === 'number') {
                    return callback(null, { infoHash, sequence })
                } else {
                    //TODO: better error message
                    return callback(new Error('Unable to parse response'))
                }
            })
        })
    }

    publish(publicKeyString: string, secretKeyString: string, infoHashString: string, opts?: Callback | PublishOptions, callback: Callback = noop) {
        let options: PublishOptions = { sequence: 1 }
        if (typeof opts === 'function') {
            callback = opts
        } else if(opts !== undefined){
            options = opts
        }
        const buffPubKey = Buffer.from(publicKeyString, 'hex')
        const buffSecKey = Buffer.from(secretKeyString, 'hex')

        sha1(buffPubKey, (targetID) => {
            const dht = this.dht

            const opts = {
                k: buffPubKey,
                // seq: 0,
                v: {
                    ih: Buffer.from(infoHashString, 'hex')
                },
                sign: (buf: Buffer) => {
                    return sign(buf, buffPubKey, buffSecKey)
                },
                seq: options.sequence
            }

            dht.get(targetID, (err, res) => {
                if (err) {
                    return callback(err)
                }
                let sequence = opts.seq
                if(res && res.seq) {
                    sequence = opts.seq = res.seq + 1
                }
                dht.put(opts, (putErr, hash) => {
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
            const dht = this.dht

            dht.get(targetID, (err, res) => {
                if (err) {
                    callback(err)
                    callback = noop
                    return
                }

                dht.put(res, (err) => {
                    callback(err)
                })
            })
        })
    }

    createKeypair(seed) {
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

module.exports = MutableWebTorrent

function noop() { }