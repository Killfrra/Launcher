import sha1 from 'simple-sha1';
export var TeamID;
(function (TeamID) {
    TeamID[TeamID["SPEC"] = 0] = "SPEC";
    TeamID[TeamID["BLUE"] = 1] = "BLUE";
    TeamID[TeamID["PURP"] = 2] = "PURP";
})(TeamID || (TeamID = {}));
export const TID2str = ['spectators', 'blue team', 'red team'];
export const WS_PORT = 8080;
export const DHT_PORT = 20000;
export const DHT_REANNOUNCE_INTERVAL = 15 * 60 * 1000;
export const INFO_HASH = sha1.sync('nonexistent');
