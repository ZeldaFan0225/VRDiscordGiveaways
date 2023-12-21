import { ApplicationCommandData, ApplicationCommandOptionType, ApplicationCommandType, Message, AttachmentBuilder, NewsChannel, TextChannel } from "discord.js";
import { Command } from "../classes/command";
import { CommandContext } from "../classes/commandContext";

const commandData: ApplicationCommandData = {
    type: ApplicationCommandType.ChatInput,
    name: "addkeys",
    description: "Adds keys to a handout",
    options: [{
        type: ApplicationCommandOptionType.String,
        name: "message_id",
        description: "The id of the handout message",
        required: true
    },{
        type: ApplicationCommandOptionType.Attachment,
        name: "prize_attachment",
        description: "The file with the keys",
        required: true
    }]
}


export default class Test extends Command {
    constructor() {
        super(commandData)
        this.name = commandData.name
        this.staffOnly = true
        this.description = `Deletes a key handout`
    }
    async run(ctx: CommandContext): Promise<any> {
        const attachment = ctx.interaction.options.getAttachment("prize_attachment", true)
        const id = ctx.interaction.options.getString("message_id", true)
        let res = await ctx.sql.query(`SELECT * FROM freekeys WHERE id=$1`, [id]).catch(console.error)
        const sample_prize = res?.rows[0]
        if(!sample_prize) return ctx.error("Unable to find that handout")

        let prizes = await fetch(attachment.url).then(async res => {
            if(res.status !== 200) return []
            const text = await res.text()
            return text.split("\n").map(k => k.replace("\r", "")).filter(v => v)
        }).catch(() => [])
        if(!prizes.length) return ctx.error("Invalid file")

        let query = `INSERT INTO freekeys (id, channel_id, name, prize) VALUES ${prizes.map((_, i) => `($1, $2, $3, $${i+4})`).join(", ")}`
        ctx.sql.query(query, [id, sample_prize.channel_id, sample_prize.name, ...prizes])

        return ctx.reply({content: `Added ${prizes.length} keys to the handout with id \`${id}\``, ephemeral: true})
    }
}