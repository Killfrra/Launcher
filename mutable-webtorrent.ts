import WebTorrent from 'webtorrent'
//@ts-ignore
import sodium from 'sodium-universal'
import sha1 from 'simple-sha1'

const BTPK_PREFIX = 'urn:btpk:'
const BITH_PREFIX = 'urn:btih:'

function verify (signature: Buffer, message: Buffer, publicKey: Buffer) {
  return sodium.crypto_sign_verify_detached(signature, message, publicKey)
}

function sign (message: Buffer, publicKey: Buffer, secretKey: Buffer) {
  const signature = Buffer.alloc(sodium.crypto_sign_BYTES)
  sodium.crypto_sign_detached(signature, message, secretKey)
  return signature
}

type u = undefined
type Callback = (torrent: WebTorrent.Torrent) => any

class MutableWebTorrent extends WebTorrent {
  constructor (options?: WebTorrent.Options) {
    let dht = options?.dht as (u|{ verify: Function })
    console.assert(!dht?.verify || dht.verify === verify)
    super(options)
  }

  addMutable(magnetURI: string, opts?: WebTorrent.TorrentOptions | Callback, callback: Callback = noop): WebTorrent.Torrent {
    let options: u|WebTorrent.TorrentOptions
    if (typeof opts === 'function') {
        callback = opts
    } else {
        options = opts
    }

    const parsed = new URL(magnetURI)
    const xs = parsed.searchParams.get('xs')
    const isMutableLink = xs && xs.startsWith(BTPK_PREFIX)
    if (!isMutableLink) return super.add(magnetURI, options, callback)

    const publicKeyString = xs.slice(BTPK_PREFIX.length)

    this.resolve(publicKeyString, (err, res) => {
      if (err) return this.emit('error', err)
      if (!res) return this.emit('error', new Error('Unable to resolve magnet link'))

      const urn = `${BITH_PREFIX}${res.infoHash.toString('hex')}`

      const finalMangetURI = magnetURI + `&xt=${urn}`

      super.add(finalMangetURI, options, (torrent) => {
        torrent.publicKey = Buffer.from(publicKeyString, 'hex')
        torrent.sequence = res.sequence || 0

        callback(torrent)
      })
    })
  }

  resolve (publicKeyString, callback) {
    const publicKey = Buffer.from(publicKeyString, 'hex')

    sha1(publicKey, (targetID) => {
      this.dht.get(targetID, (err, res) => {
        if (err) return callback(err)

        try {
          const infoHash = res.v.ih
          const sequence = res.seq

          return callback(null, { infoHash, sequence })
        } catch (parseErr) {
          return callback(parseErr)
        }
      })
    })
  }

  publish (publicKeyString: string, secretKeyString: string, infoHashString: string, options, callback) {
    if (!callback) {
      callback = options
      options = { sequence: 1 }
    } else if (!options) {
      options = { sequence: 1 }
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
        sign: (buf) => {
          return sign(buf, buffPubKey, buffSecKey)
        }
      }

      dht.get(targetID, (err, res) => {
        if (err) return callback(err)

        const sequence = (res && res.seq) ? res.seq + 1 : options.sequence
        opts.seq = sequence

        dht.put(opts, (putErr, hash) => {
          if (putErr) return callback(putErr)

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

  republish (publicKeyString, callback) {
    if (!callback) {
      callback = () => noop
    }

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

  createKeypair (seed) {
    const publicKey = Buffer.alloc(sodium.crypto_sign_PUBLICKEYBYTES)
    const secretKey = Buffer.alloc(sodium.crypto_sign_SECRETKEYBYTES)

    if (seed) {
        sodium.crypto_sign_seed_keypair(publicKey, secretKey, seed)
    } else {
        sodium.crypto_sign_keypair(publicKey, secretKey)
    }

    return { publicKey: publicKey.toString('hex'), secretKey: secretKey.toString('hex') }
  }
}

module.exports = MutableWebTorrent

function noop () {}