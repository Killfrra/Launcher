"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.INFO_HASH = exports.DHT_REANNOUNCE_INTERVAL = exports.DHT_PORT = exports.WS_PORT = exports.TID2str = exports.TeamID = void 0;
const simple_sha1_1 = __importDefault(require("simple-sha1"));
var TeamID;
(function (TeamID) {
    TeamID[TeamID["SPEC"] = 0] = "SPEC";
    TeamID[TeamID["BLUE"] = 1] = "BLUE";
    TeamID[TeamID["PURP"] = 2] = "PURP";
})(TeamID = exports.TeamID || (exports.TeamID = {}));
exports.TID2str = ['spectators', 'blue team', 'red team'];
exports.WS_PORT = 8080;
exports.DHT_PORT = 20000;
exports.DHT_REANNOUNCE_INTERVAL = 15 * 60 * 1000;
exports.INFO_HASH = simple_sha1_1.default.sync('nonexistent');
//# sourceMappingURL=shared.js.map