import { Button } from "../classes/button";
import { ButtonContext } from "../classes/buttonContext";



export default class Test extends Button {
    constructor() {
        super()
        this.name = "remove_proof"
        this.regex = /remove_proof_\d+/
        this.staffOnly = false
    }
    async run(ctx: ButtonContext): Promise<any> {
        const id = ctx.interaction.customId.split("_")[2]

        const prize = await ctx.sql.query("SELECT * FROM freekeys WHERE id=$1 AND user_id=$2", [id, ctx.interaction.user.id]).catch(console.error)
        if(!prize) return ctx.error("Unable to find proof")

        const confirm = await ctx.sql.query("UPDATE freekeys SET proof_url=NULL, proof_submitted_at=NULL WHERE id=$1 AND user_id=$2", [id, ctx.interaction.user.id]).catch(console.error)

        if(!confirm?.rowCount) return ctx.error("Unable to remove proof")

        return ctx.interaction.update({
            content: "Proof removed, **please submit the proof again**",
            components: []
        })
    }
}
