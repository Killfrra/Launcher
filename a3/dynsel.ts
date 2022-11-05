import prompts from 'prompts'

type ChoicesGenerator<T> = () => { title: string, value: T }[]
export default class DynamicSelectPrompt<T> {
    name: string
    message: string
    choices: ChoicesGenerator<T>
    prompt?: prompts.PromptObject & { render: () => void }
    opts: prompts.Options
    constructor(name: string, message: string, choices: ChoicesGenerator<T>){
        this.name = name
        this.message = message
        this.choices = choices

        let that = this
        this.opts = {
            onCancel(prompt, answers) {
                that.prompt = undefined
            },
            onSubmit(prompt, answer, answers) {
                that.prompt = undefined
            },
        }
    }
    async show(): Promise<T> {
        let that = this
        return (await prompts({
            type: 'select',
            message: this.message,
            name: this.name,
            choices: this.choices(),
            onRender(){
                if (this.firstRender) {
                    that.prompt = this
                }
            },
        } as any, this.opts))[this.name]
    }
    update(){
        if(!this.prompt){
            return
        }
        this.prompt.choices = this.choices()
        this.prompt.render()
    }
}