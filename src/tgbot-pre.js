const secret = require('../config/secret');
const TelegramBot = require("node-telegram-bot-api");
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const {tgLogger} = require('./common')();
const isPolling = (!(process.argv.length >= 3 && process.argv[2] === "hook"));
process.env["NTBA_FIX_350"] = "1";

const {downloader} = require("./common")();

let tgbot;
if (isPolling) {
    tgbot = new TelegramBot(secret.botToken,
        {polling: {interval: 2000}, request: {proxy: require("../proxy")},});
    tgbot.deleteWebHook();
} else {
    tgbot = new TelegramBot(secret.botToken, {
        webHook: {
            port: 8443,
            max_connections: 3,
            healthEndpoint: "/health",
            key: "config/srv.pem",
            cert: "config/cli.pem",
        },
        request: {proxy: require("../proxy")}
    });
    tgbot.setWebHook(`${secret.webHookUrlPrefix}${process.argv[3]}/bot${secret.botToken}`, {
        drop_pending_updates: true
        /* Please, remove this line after the bot have ability to control messages between instances!!! */
    });
    tgbot.openWebHook();
}

function parseRecv(receiver, form) {
    if (receiver && receiver.s && receiver.s === 0) {
        if (secret.class.def.threadId) form.message_thread_id = secret.class.def.threadId;
        return secret.class.def.tgid;
    } else if (receiver && receiver.s) {
        // incoming object is tgMsg.matched
        return receiver.p.tgid;
    } else if (receiver && receiver.tgid) {
        if (receiver.threadId) form.message_thread_id = receiver.threadId;
        return receiver.tgid;
    } else if (typeof receiver === "number") {
        return receiver;
    } else {
        return secret.class.def.tgid;
    }
}

const tgBotDo = {
    SendMessage: async (receiver = null, msg, isSilent = false, parseMode = null, form = {}) => {
        if (isSilent) form.disable_notification = true;
        if (parseMode) form.parse_mode = parseMode;
        return await tgbot.sendMessage(parseRecv(receiver, form), msg, form).catch(e => logErrorDuringTGSend(e));
    },
    RevokeMessage: async (msgId, receiver = null) => {
        return await tgbot.deleteMessage(parseRecv(receiver, {}), msgId).catch((e) => {
            logErrorDuringTGSend(e);
        });
    },
    SendChatAction: async (action, receiver = null) => {
        return await tgbot.sendChatAction(parseRecv(receiver, {}), action).catch((e) => {
            logErrorDuringTGSend(e);
        });
    },
    SendAnimation: async (msg, path, isSilent = false, hasSpoiler = true) => {
        await delay(100);
        let form = {
            caption: msg,
            has_spoiler: hasSpoiler,
            width: 100,
            height: 100,
            parse_mode: "HTML",
        };
        const receiver = (() => {
            const s = secret.settings.deliverStickerSeparately;
            if (s === false) return 0; //TODO
            if (s === true) return secret.class.push;
            if (s.tgid) return s;
        })();
        if (isSilent) form.disable_notification = true;
        // Temp. change for classifying stickers
        return await tgbot.sendAnimation(parseRecv(receiver, form), path, form, {contentType: 'image/gif'}).catch(e => logErrorDuringTGSend(e));
    },
    SendPhoto: async (receiver = null, msg, path, isSilent = false, hasSpoiler = false) => {
        await delay(100);
        let form = {
            caption: msg,
            has_spoiler: hasSpoiler,
            width: 100,
            height: 100,
            parse_mode: "HTML",
        };
        if (isSilent) form.disable_notification = true;
        return await tgbot.sendPhoto(parseRecv(receiver, form), path, form, {contentType: 'image/jpeg'}).catch(e => logErrorDuringTGSend(e));
    },
    EditMessageText: async (text, former_tgMsg, receiver = null) => {
        let form = {
            chat_id: parseRecv(receiver || former_tgMsg.matched, {}),
            message_id: former_tgMsg.message_id,
            parse_mode: "HTML"
        };
        return await tgbot.editMessageText(text, form).catch(e => logErrorDuringTGSend(e));
    },
    EditMessageMedia: async (file_id, formerMsg, hasSpoiler = false, receiver = null) => {
        let form = {
            chat_id: parseRecv(receiver, {}),
            message_id: formerMsg.message_id,
            parse_mode: "HTML",
        };
        try {
            const res = await tgbot.editMessageMedia({
                type: "photo",
                media: file_id,
                has_spoiler: hasSpoiler,
                parse_mode: "HTML",
                caption: formerMsg.caption
            }, form);
            if (res) return true;
        } catch (e) {
            logErrorDuringTGSend(e);
            return e.toString();
        }
        return "Unknown Error.";
    },
    SendAudio: async (receiver = null, msg, path, isSilent = false) => {
        let form = {
            caption: msg,
            parse_mode: "HTML",
        };
        if (isSilent) form.disable_notification = true;
        return await tgbot.sendVoice(parseRecv(receiver, form), path, form, {contentType: 'audio/mp3'}).catch(e => logErrorDuringTGSend(e));
    },
    SendDocument: async (receiver = null, msg, path, isSilent = false) => {
        let form = {
            caption: msg,
            parse_mode: "HTML",
        };
        if (isSilent) form.disable_notification = true;
        return await tgbot.sendDocument(parseRecv(receiver, form), path, form, {contentType: 'application/octet-stream'}).catch(e => logErrorDuringTGSend(e));
    },
    SendVideo: async (receiver = null, msg, path, isSilent = false) => {
        let form = {
            caption: msg,
            parse_mode: "HTML",
        };
        if (isSilent) form.disable_notification = true;
        return await tgbot.sendVideo(parseRecv(receiver, form), path, form, {contentType: 'video/mp4'}).catch(e => logErrorDuringTGSend(e));
    }
};
let errorStat = 0;
tgbot.on('polling_error', async (e) => {
    const msg = "Polling - " + e.message.replace("Error: ", ""), msg2 = "[Error]\t";
    if (errorStat === 0) {
        errorStat = 1;
        setTimeout(async () => {
            if (errorStat === 2) {
                // still have errors after the timer been set up triggered by first error
                await downloader.httpsCurl(secret.notification.baseUrl + secret.notification.prompt_network_problematic);
                tgLogger.warn(`Frequent network issue detected! Please check network!\n${msg}`);
            } else {
                // no other error during this period, discarding notify initiation
                errorStat = 0;
                tgLogger.info(`There may be a temporary network issue but now disappeared. If possible, please check your network config.`);

            }
        }, 10000);
        console.warn(msg2 + msg);
    } else if (errorStat === 1) {
        errorStat = 2;
        console.warn(msg2 + msg);
    } else {
        console.warn(msg2 + msg);
    }
});
tgbot.on('webhook_error', async (e) => {
    tgLogger.warn("Webhook - " + e.message.replace("Error: ", ""));
});

function logErrorDuringTGSend(err) {
    let err2 = err.toString().replaceAll("Error:", "");
    tgLogger.warn(`MsgSendFail: ${err2}`);
}

module.exports = {
    tgbot,
    tgBotDo

}