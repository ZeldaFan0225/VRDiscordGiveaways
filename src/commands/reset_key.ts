import { ApplicationCommandData, ApplicationCommandOptionType, ApplicationCommandType, Colors, EmbedBuilder, Snowflake } from "discord.js";
import { Command } from "../classes/command";
import { CommandContext } from "../classes/commandContext";
import { randomizeArray } from "../classes/randomizer";
import { syncDB } from "../intervals/syncdb";

const commandData: ApplicationCommandData = {
    type: ApplicationCommandType.ChatInput,
    name: "reset_key",
    description: "Resets the handout status of a key",
    options: [{
        type: ApplicationCommandOptionType.String,
        name: "message_id",
        description: "The id of the handout message",
        required: true
    },{
        type: ApplicationCommandOptionType.User,
        name: "user",
        description: "The user that received the key",
        required: true
    }]
}


export default class Test extends Command {
    constructor() {
        super(commandData)
        this.name = commandData.name
        this.staffOnly = true
        this.description = `Resets the handout status of a key`
    }
    async run(ctx: CommandContext): Promise<any> {
        const id = ctx.interaction.options.getString("message_id", true)
        const user = ctx.interaction.options.getUser("user", true)

        const res = await ctx.sql.query(`DELETE FROM freekeys WHERE user_id=$1 AND id=$2 RETURNING *`, [user.id, id]).then(res => res.rows[0]).catch(console.error)
        if(!res) return ctx.error("Unable to find user for the given handout")

        const create = await ctx.sql.query("INSERT INTO freekeys (id, prize, channel_id) VALUES ($1, $2, $3) RETURNING *", [id, res.prize, res.channel_id]).then(res => res.rows[0]).catch(console.error)
        if(!create) return ctx.error("Unable to reset key")

        return ctx.reply({
            ephemeral: true,
            content: "Successfully reset key"
        })
    }
}