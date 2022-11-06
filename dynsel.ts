import prompts from 'prompts'

type ChoicesGenerator<T> = () => {
    title: string
    value?: T
    disabled?: boolean
}[]
export default class DynamicSelectPrompt<T> {
    private name: string
    private message: string
    private choices: ChoicesGenerator<T>
    private prompt?: prompts.PromptObject & {
        cursor: number
        value: any
        render: () => void
        fire: () => void
    }
    private opts: prompts.Options
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
    async show(): Promise<T|undefined> {
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
        //HACK: begin
        let n = this.prompt.cursor
        let newValue = this.prompt.choices[n].value;
        if(this.prompt.value !== newValue){
            this.prompt.value = newValue
            this.prompt.fire()
        }
        //HACK:end
        this.prompt.render()
    }
    /*
    abort(){
        if(!this.prompt){
            return
        }
        (this.prompt as any).abort()
    }
    */
}