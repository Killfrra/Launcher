import fs from 'fs/promises'
import MutableWebTorrent from '../mutable-webtorrent'

let { publicKey, secretKey } = MutableWebTorrent.createKeypair()
fs.writeFile('public_key.txt', publicKey, 'utf8')
fs.writeFile('secret_key.txt', secretKey, 'utf8')