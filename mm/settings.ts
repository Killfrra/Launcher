const publicKey = 'f2e86c8b49dc499a5b71851de2756fc58e0dd0f6c324b48538bbeda625844358'
const magnet = (salt?: string) => `magnet:?xs=urn:btpk:${publicKey}` + (salt ? `&s=${salt}` : '')
//TODO: Buffer.from(salt).toString('hex') ?

export default
{
    subscriptions:
    {
        launcher: magnet('launcher'),
        managed:
        [
            magnet('base'),
        ],
    },
}