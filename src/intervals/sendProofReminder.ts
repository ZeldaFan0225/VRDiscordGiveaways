import { Pool } from "pg";
import { GiveawayClient } from "../classes/client";

export async function sendProofReminder(db: Pool, client: GiveawayClient) {
    const pending_review = await db.query(`SELECT * FROM freekeys WHERE proof_url IS NULL AND NOT alert_send AND received_at IS NOT NULL AND (CURRENT_TIMESTAMP - received_at) > interval '${process.env["PROOF_REMINDER_DELAY"] || "7 day"}'`).catch(console.error)

    if(!pending_review?.rowCount) return;

    for(let key of pending_review.rows) {
        const user = await client.users.fetch(key.user_id).catch(() => null)
        if(!user) continue;
        const components = [{type: 1, components: [{type: 2, label: "View Handout", style: 5, url: `https://discord.com/channels/${process.env["GUILD_ID"]}/${key.channel_id}/${key.id}`}]}]
        await client.log(`${user.username} \`${user.id}\` failed to upload proof of review for the handout \`${key.id}\` within ${process.env["PROOF_REMINDER_DELAY"] || "7 day"}`, [], components)
        await user.send({content: `You have not uploaded proof of review for the handout \`${key.id}\` within ${process.env["PROOF_REMINDER_DELAY"] || "7 day"}.`, components}).catch(() => null)
        await db.query(`UPDATE freekeys SET alert_send=true WHERE id='${key.id}' AND user_id='${key.user_id}'`).catch(console.error)
    }
}