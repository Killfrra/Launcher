import prompts from 'prompts';
export default class DynamicSelectPrompt {
    name;
    message;
    choices;
    prompt;
    opts;
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
        return (await prompts({
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
