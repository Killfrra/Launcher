import sha1 from 'simple-sha1';
export const WS_PORT = 8080;
export const DHT_PORT = 20000;
export const DHT_REANNOUNCE_INTERVAL = 15 * 60 * 1000;
export const INFO_HASH = sha1.sync('nonexistent');
export let response = (ws, type, data, timeout, onTimeout = (res, rej) => rej('timeout')) => new Promise((res, rej) => {
    let timeoutInterval;
    let msg_out = {
        id: (Math.random() * (Math.pow(2, 31) - 1)) | 0,
        type,
        data
    };
    let cb = (data) => {
        let msg_in = JSON.parse(data.toString('utf8'));
        if (msg_in.id === msg_out.id) {
            ws.off('message', cb);
            if (timeout !== undefined) {
                clearTimeout(timeoutInterval);
            }
            if (msg_in.error !== undefined) {
                rej(msg_in.error);
            }
            else {
                res(msg_in.data);
            }
        }
    };
    ws.on('message', cb);
    if (timeout !== undefined) {
        timeoutInterval = setTimeout(() => {
            ws.off('message', cb);
            onTimeout(res, rej);
        });
    }
    ws.send(JSON.stringify(msg_out));
});
export let message = async (ws, type) => {
    return await new Promise((res, rej) => {
        ws.on('message', function cb(data) {
            let msg_in = JSON.parse(data.toString('utf8'));
            if (msg_in.type === type) {
                ws.off('message', cb);
                res(msg_in.data);
            }
        });
    });
};
