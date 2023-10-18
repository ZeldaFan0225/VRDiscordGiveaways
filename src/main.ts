import { ApplicationCommand, Attachment, ChannelType, CommandInteraction, ComponentType, GuildMember, IntentsBitField, Partials } from "discord.js"
import { readFileSync, existsSync, readdirSync } from "fs"
import { GiveawayClient } from "./classes/client"
import { CommandContext } from "./classes/commandContext"
import pg from "pg"
import { ButtonContext } from "./classes/buttonContext"
import { syncDB } from "./intervals/syncdb"
import { determineWinner } from "./intervals/determineWinners"
import { rerollPrizes } from "./intervals/rerollPrizes"
import { sendProofReminder } from "./intervals/sendProofReminder"

const RE_INI_KEY_VAL = /^\s*([\w.-]+)\s*=\s*(.*)?\s*$/

if (existsSync(`${process.cwd()}/.env`))
    for (const line of readFileSync(`${process.cwd()}/.env`, 'utf8').split(/[\r\n]|\r\n/)) {
        let [, key, value] = line.match(RE_INI_KEY_VAL) || []
        if (!key) continue

        process.env[key] = value?.trim() || ''
}


const token = process.env["DISCORD_TOKEN"]
    , clientId = `${Buffer.from((token ?? "").split('.')[0] ?? "", 'base64')}`

const client = new GiveawayClient({
    intents: new IntentsBitField([
        "Guilds",
        "DirectMessages"
    ]),
    partials: [Partials.Channel, Partials.Message]
})


let connection = new pg.Pool({
    user: process.env["DB_USERNAME"]!,
    host: process.env["DB_IP"]!,
    database: process.env["DB_NAME"]!,
    password: process.env["DB_PASSWORD"]!,
    port: Number(process.env["DB_PORT"]!),
})

readdirSync("./dist/commands")
.forEach(c => {
    const cmd = new ((require(`./commands/${c}`)).default)()
    cmd.client = client
    client.commands.set(cmd.name, cmd)
})

readdirSync("./dist/buttons")
.forEach(c => {
    const cmd = new ((require(`./buttons/${c}`)).default)()
    cmd.client = client
    client.buttons.set(cmd.name, cmd)
})

const keepAlive = async () => {
    //await connection.query("SELECT * FROM giveaways LIMIT 1").then(console.log).catch(() => null)
    //let res = await connection.query("DROP TABLE giveaways")
    //console.log(await connection.query("ALTER TABLE giveaways ADD name VARCHAR(1000) NOT NULL DEFAULT ''"))
    //console.log(await connection.query("ALTER TABLE freekeys ADD proof_url text"))
    //console.log(await connection.query("ALTER TABLE freekeys ADD received_at timestamp"))
    //console.log(await connection.query("ALTER TABLE freekeys ADD alert_send boolean not null default false"))
    //console.log(await connection.query("ALTER TABLE freekeys ADD proof_submitted_at timestamp"))
    //console.log(await connection.query("ALTER TABLE freekeys ADD name text"))
    await connection.query("CREATE TABLE IF NOT EXISTS giveaways (id varchar(21) not null primary key, duration bigint not null, users text[] not null default '{}', won_users text[] default '{}', winners int not null, channel_id varchar(21) not null, rolled boolean not null, name VARCHAR(1000) NOT NULL DEFAULT '', prize_description VARCHAR(1000) NOT NULL DEFAULT '')")
    await connection.query("CREATE TABLE IF NOT EXISTS prizes (index SERIAL, id varchar(21) not null, prize varchar(255) not null, user_id varchar(21), changed bigint)")
    await connection.query("CREATE TABLE IF NOT EXISTS freekeys (index SERIAL, id varchar(21) not null, prize varchar(255) not null, user_id varchar(21), channel_id varchar(21) not null, proof_url text, received_at timestamp, alert_send boolean not null default false, proof_submitted_at timestamp, name text)")
}

const giveawayController = async () => {
    await syncDB(connection, client)
    await determineWinner(connection, client)
    await rerollPrizes(connection, client)
    if(process.env["ENABLE_REVIEW_PROOF_SUBMISION"] === "1") await sendProofReminder(connection, client)
}

client.login(token)

connection.connect()
.then(async () => await keepAlive())
.then(async () => giveawayController())
.catch(console.error)

setInterval( giveawayController, 1000*60 )



client.on("interactionCreate", async (interaction): Promise<any> => {

    if(interaction.isCommand() && interaction.isChatInputCommand()) {
        if(interaction.channel?.type === ChannelType.DM)
        return (interaction as CommandInteraction).reply({content: "You can't use commands in DMs"})
        const command = client.commands.get(interaction.commandName)
        if(!command) return
        let member: GuildMember | undefined = undefined
        if(interaction.member?.permissions) {
            member = await interaction.guild?.members.fetch(interaction.member?.user.id!)!
        }
        const context = new CommandContext(client, interaction, member, connection)
        if(command.staffOnly && !member?.roles.cache.has(process.env["STAFF_ROLE_ID"]!)) return context.error("You are not staff")
        command.run(context).catch(console.error)
    } else if (interaction.isButton()) {
        const command = client.buttons.find(c => c.regex.test(interaction.customId))
        if(!command) return
        let member: GuildMember | undefined = undefined
        if(interaction.member?.permissions) {
            member = await interaction.guild?.members.fetch(interaction.member?.user.id!)!
        }
        const context = new ButtonContext(client, interaction, member, connection)
        if(command.staffOnly && !member?.roles.cache.has(process.env["STAFF_ROLE_ID"]!)) return context.error("You are not staff")
        command.run(context).catch(console.error)
    }
})

.on("ready", async () => {
    console.log(`Bot is ready - Logged in as ${client.user?.username}`)
    await client.application?.commands.set(client.commands.map(c => c.command), process.env["GUILD_ID"]!).catch(console.error)
})


if(process.env["ENABLE_REVIEW_PROOF_SUBMISION"] === "1") {
    client.on("messageCreate", async (message) => {
        if(message.channel.type === ChannelType.DM) {
            const possible = await connection.query("SELECT * FROM freekeys WHERE user_id=$1 AND proof_url IS NULL AND received_at IS NOT NULL", [message.author.id]).catch(console.error)
            if(!possible?.rowCount) return;
            if(!message.attachments.first()?.contentType?.startsWith("image")) {
                await message.reply({content: "Please send an image as proof."})
                return;
            }
            if(message.attachments.size !== 1) {
                await message.reply({content: "Please only upload one image."})
                return;
            }
    
            if(possible.rowCount === 1) {
                await saveProofSubmission(possible.rows[0].id, possible.rows[0].channel_id, possible.rows[0].name, message.attachments.first()!)
                return;
            }
    
            const components = []
            const ids = possible.rows.map(r => ({id: r.id, name: r.name})).slice()
            if(ids.length > 125) {
                await message.reply({content: "There are too many pending review proof submissions."})
                return;
            }
    
            let ind = 0;
    
            while(ids.length) {
                components.push({
                    type: 1,
                    components: [{
                        type: 3,
                        options: ids.splice(0, 25).map(r => ({
                            label: r.name || `Handout ${++ind}`,
                            value: `${r.id}`
                        })).slice(0, 25),
                        placeholder: "Select a handout",
                        customId: `select_${ind}`
                    }]
                })
            }
    
            const msg = await message.reply({
                content: `Please select the handout you want to submit proof for\n${possible.rows.map((r, i) => `[${r.name || `Handout ${i+1}`}](https://discord.com/channels/${process.env["GUILD_ID"]}/${r.channel_id}/${r.id})`).join("\n")}`,
                components
            })
    
            const selectinteraction = await msg.awaitMessageComponent({time: 1000 * 60 * 15, componentType: ComponentType.StringSelect}).catch(console.error)
    
            if(!selectinteraction?.values[0]) {
                await msg.edit({content: "Prompt timed out, please send again.", components: []})
                return;
            }
    
            selectinteraction?.deferUpdate()
            selectinteraction.deleteReply()
    
            const prize = possible.rows.find(r => r.id === selectinteraction.values[0])
    
            await saveProofSubmission(prize.id, prize.channel_id, prize.name || "Unknown", message.attachments.first()!)
    
            async function saveProofSubmission(id: string, channel_id: string, name: string, attachment: Attachment) {
                const logmsg = await client.log(`${message.author.username} (\`${message.author.id}\`) submitted proof of review \`${id}\``, [attachment], [{type: 1, components: [{type: 2, label: "View Message", style: 5, url: `https://discord.com/channels/${process.env["GUILD_ID"]}/${channel_id}/${id}`}]}])
                if(!logmsg) return message.reply({content: "Unable to save image. Please try again later."})
                const save = await connection.query("UPDATE freekeys SET proof_url=$1, proof_submitted_at=CURRENT_TIMESTAMP WHERE id=$2 AND user_id=$3", [logmsg.url, id, message.author.id]).catch(console.error)
                if(!save?.rowCount) return message.reply({content: "Unable to save proof submission. Please try again later."})
                await message.reply({
                    content: `Thank you for reviewing ${name}.\nDo not delete your message else your submission will be invalid.\nTo check or remove your submission press the \"Click to get a Key\" button in the channel for ${name}.`,
                    components: [{type: 1, components: [{type: 2, label: "View Message", style: 5, url: `https://discord.com/channels/${process.env["GUILD_ID"]}/${channel_id}/${id}`}]}]
                })
            }
        }
    })
}