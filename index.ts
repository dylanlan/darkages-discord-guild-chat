import dotenv from "dotenv";
import https from "https";
// @ts-ignore until we update darkages package to typescript
import Darkages from 'darkages';
import { Client, GatewayIntentBits, Message, OmitPartialGroupDMChannel } from "discord.js";

// actually 64 max length, 61-64 character messages don't pop up
const MAX_GUILD_CHAT_MESSAGE_LENGTH = 60;
const DOTENV_DELIMITER = ","

// load config
dotenv.config();

// The Aisling that listens and posts to in-game guild chat
const darkAgesUsername = loadParam("MESSENGER_NAME")[0];
const darkAgesPassword = loadParam("MESSENGER_PASSWORD")[0];
const ignoredNames = loadParam("IGNORED_NAMES");
const discordMessagesUrl = loadParam("DISCORD_MESSAGES_WEBHOOK_URLS");
const discordLoginsUrl = loadParam("DISCORD_LOGINS_WEBHOOK_URLS")
const discordBotToken = loadParam("DISCORD_BOT_TOKEN")[0];
const discordEchoChannelId = loadParam("DISCORD_ECHO_CHANNEL_IDS");

const client = new Darkages.Client(darkAgesUsername, darkAgesPassword);

function loadParam(key: string): string[] {
    if (process.env[key]) {
        if (process.env[key].includes(DOTENV_DELIMITER)) {
            return process.env[key].split(DOTENV_DELIMITER);
        }
        return [process.env[key]];
    }

    // return the environment key or exit
    console.log(`.env key "${key}" not found, please fix this and run again`);
    process.exit(1);
}

async function sendToDarkAges(messages: string[]): Promise<void> {
    for (const message of messages) {
        const response = new Darkages.Packet(0x19);
        response.writeString8('!'); // name to whisper
        response.writeString8(message); //message to send
        client.send(response);
        // wait 1 second
        await new Promise((res) => setTimeout(res, 1000));
    }
}

// Function to send the given message string to the channel configured by the webhook
function sendToDiscord(message: string, webhookUrl: string): void {
    const body = JSON.stringify({
        content: message
    });

    const request = https.request(webhookUrl, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Content-Length': Buffer.byteLength(body)
        }
    });

    request.write(body);
    request.end();
}

function waterSpiritRoast(message: OmitPartialGroupDMChannel<Message>): void {
    // Roast the water spirit anywhere, lol
    if (message.content.toLowerCase().includes('water spirit')) {
        const responses = [
            "Water Spirit is moist lol",
            "Water Spirit sucks, Gatorade Spirit is better",
            "Look at me I like the lame Water Spirit"
        ]
        let rand = Math.floor(Math.random() * responses.length)
        message.channel.send(responses[rand]);
    }
}

function convertDiscordMessage(message: OmitPartialGroupDMChannel<Message>): void {
    // Remove any non-ascii characters
    const messages = [];
    const sanitizedMessage = message.content.replace(/[^\x00-\x7F]/g, '');

    const whisperMessage = `${message.author.displayName}" ${sanitizedMessage}`;
    if (whisperMessage.length <= MAX_GUILD_CHAT_MESSAGE_LENGTH) {
        sendToDarkAges([whisperMessage]).then()
    } else if (sanitizedMessage.includes(" ")) {
        let words = sanitizedMessage.split(" ");
        let newMessage = `${message.author.displayName}"`;
        for (const word of words) {
            // if the word will cause the chat to exceed max length
            if (newMessage.length + word.length + 1 > MAX_GUILD_CHAT_MESSAGE_LENGTH) {
                messages.push(newMessage)
                newMessage = `${message.author.displayName}" ${word}`;
            } else {
                newMessage += ` ${word}`;
            }
        }
        messages.push(newMessage);
        sendToDarkAges(messages).then()
    } else {
        // no spaces lol
        let maxLength = MAX_GUILD_CHAT_MESSAGE_LENGTH - message.author.displayName.length - 2
        let counter = 0
        while (counter + maxLength < sanitizedMessage.length) {
            let newMessage = `${message.author.displayName}" ${sanitizedMessage.substring(counter, counter + maxLength)}`;
            messages.push(newMessage);
            counter += maxLength;
        }
        messages.push(`${message.author.displayName}" ${sanitizedMessage.substring(counter)}`)
        sendToDarkAges(messages).then()
    }
}


// Listen for whispers and guild chats in-game
client.events.on(0x0A, (packet: { readByte: () => any; readString16: () => string; }): void => {
    const channel = packet.readByte();
    const message = packet.readString16();
    let guildChatRegExp = /^.* member .* has entered Temuair$/;
    let newMemberRegExp = /^.* has a new member! Welcome .* to the clan$/;
    let worldShoutRegExp = /^\[.*]: .*$/;
    let masterRegExp = /^.* has shown to be worth to wear the mantle of Master.$/;
    let gameMasterShoutRegExp = /^.*! .*$/;

    console.log(`In-game message: '${message}'`);

    // don't force the constant tick to get regexpd
    if (message === ' ') {
        return;
    // If it's a guild chat not from the messenger Aisling, then send to discord
    } else if (message.startsWith('<!') && !message.startsWith(`<!${darkAgesUsername}`)) {
        for (const username of ignoredNames) {
            if (message.startsWith(username)) {
                return
            }
        }
        for (let url of discordMessagesUrl) {
            sendToDiscord(message, url)
        }
    // Send "entered Temuair" messages to discord
    } else if (guildChatRegExp.test(message)) {
        for (let url of discordLoginsUrl) {
            sendToDiscord(message, url);
        }
        // Send "New member" messages to discord
    } else if (newMemberRegExp.test(message)) {
        for (let url of discordMessagesUrl) {
            sendToDiscord(message, url)
        }
        // GM Shouts to discord
    } else if (gameMasterShoutRegExp.test(message)) {
        for (let url of discordMessagesUrl) {
            sendToDiscord(message, url)
        }
    }

    // TODO: any special whisper commands?
});

// Login the messenger Aisling in Darkages
client.connect();


const discordClient = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
    ],
});


discordClient.once("ready", () => {
    console.log(`Logged in as ${discordClient.user?.tag} in Discord!`);
});

// Listen for discord messages
discordClient.on("messageCreate", (message: OmitPartialGroupDMChannel<Message>) => {
    // Ignore messages from bots, to avoid loops
    if (message.author.bot) return;

    // TODO: figure out server-specific display name
    console.log(`Discord message from displayName: ${message.author.displayName} ` +
        `id: ${message.author.id} global name: ${message.author.globalName} ` +
        `discriminator: ${message.author.discriminator} id: ${message.author.id}, in ` +
        `channel ${message.channel}, content: ${message.content}`);

    // If the discord message is from the guild chat channel, send it to the game
    if (discordEchoChannelId.includes(message.channel.id)) {
        convertDiscordMessage(message);
    }

    waterSpiritRoast(message);
});

// Login the Discord bot
discordClient.login(discordBotToken).catch(
    (err) => {
        console.error(err)
    });
