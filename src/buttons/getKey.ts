import { Button } from "../classes/button";
import { ButtonContext } from "../classes/buttonContext";



export default class Test extends Button {
    constructor() {
        super()
        this.name = "getkey"
        this.regex = /getkey/
        this.staffOnly = false
    }
    async run(ctx: ButtonContext): Promise<any> {
        let check = await ctx.sql.query(`SELECT * FROM freekeys WHERE id='${ctx.interaction.message.id}' AND user_id='${ctx.interaction.user.id}' LIMIT 1`)
        if(check.rowCount) {
            if(process.env["ENABLE_REVIEW_PROOF_SUBMISION"] !== "1") return ctx.reply({content: `You already got a key: \`${check.rows[0].prize}\``})
            return ctx.reply({content: `You already got a key: \`${check.rows[0].prize}\`${check.rows[0]?.proof_url ? `\n\nYou submitted proof of review.` : `\n\n**Make sure to leave a review and send a screenshot as proof to this bot's direct messages**`}`, ephemeral: true, components: check.rows[0]?.proof_url ? [{type: 1, components: [{type: 2, label: "Remove Proof", style: 4, custom_id: `remove_proof_${check.rows[0]?.id}`}]}] : []})
        }
        let prizequery = await ctx.sql.query(`SELECT * FROM freekeys WHERE id='${ctx.interaction.message.id}' AND user_id IS NULL LIMIT 1`).catch(console.error)
        if(!prizequery?.rowCount) return ctx.error("All keys have been handed out already")
        const prize = prizequery.rows[0]!
        await ctx.sql.query(`UPDATE freekeys SET user_id='${ctx.interaction.user.id}', received_at=CURRENT_TIMESTAMP WHERE prize=$1 AND id='${ctx.interaction.message.id}'`, [prize.prize])

        ctx.log(`${ctx.interaction.user.username} (\`${ctx.interaction.user.id}\`) received key \`${prize.prize}\` from key handout ${prize.name || "Unknown"} \`${ctx.interaction.message.id}\``, [{type: 1, components: [{type: 2, label: "View Message", style: 5, url: `https://discord.com/channels/${process.env["GUILD_ID"]}/${prize.channel_id}/${ctx.interaction.message.id}`}]}])
        if(process.env["ENABLE_REVIEW_PROOF_SUBMISION"] !== "1") return ctx.reply({content: `Here's a key: \`${prize.prize}\``})
        
        const msg = await ctx.interaction.user.send({
            content: `Please attach a SCREENSHOT of your review for ${prize.name || "Unknown"} to this chat.\nYour key is: \`${prize.prize}\``
        }).catch(console.error)
        ctx.reply({content: `Here's a key: \`${prize.prize}\`${!msg?.id ? '**Make sure to open your direct messages**' : ''}\n\n**Make sure to leave a review and send a screenshot as proof to this bot's direct messages**`, ephemeral: true})

    }
}
