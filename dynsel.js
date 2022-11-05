"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const prompts_1 = __importDefault(require("prompts"));
class DynamicSelectPrompt {
    constructor(name, message, choices) {
        this.name = name;
        this.message = message;
        this.choices = choices;
        let that = this;
        this.opts = {
            onCancel(prompt, answers) {
                that.prompt = undefined;
            },
            onSubmit(prompt, answer, answers) {
                that.prompt = undefined;
            },
        };
    }
    async show() {
        let that = this;
        return (await (0, prompts_1.default)({
            type: 'select',
            message: this.message,
            name: this.name,
            choices: this.choices(),
            onRender() {
                if (this.firstRender) {
                    that.prompt = this;
                }
            },
        }, this.opts))[this.name];
    }
    update() {
        if (!this.prompt) {
            return;
        }
        this.prompt.choices = this.choices();
        this.prompt.render();
    }
}
exports.default = DynamicSelectPrompt;
//# sourceMappingURL=dynsel.js.map