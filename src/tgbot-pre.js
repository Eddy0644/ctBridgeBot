const secretConfig = require('../config/secret');
const TelegramBot = require("node-telegram-bot-api");
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const {tgLogger} = require('./common')();
const isPolling = (!(process.argv.length >= 3 && process.argv[2] === "hook"));
process.env["NTBA_FIX_350"] = "1";

let tgbot;
if (isPolling) {
    tgbot = new TelegramBot(secretConfig.botToken,
        {polling: {interval: 2000}, request: {proxy: require("../proxy")},});
    tgbot.deleteWebHook();
} else {
    tgbot = new TelegramBot(secretConfig.botToken, {
        webHook: {
            port: 8443,
            max_connections: 3,
            healthEndpoint: "/health",
            key: "config/srv.pem",
            cert: "config/cli.pem",
        },
        request: {proxy: require("../proxy")}
    });
    tgbot.setWebHook(`${secretConfig.webHookUrlPrefix}${process.argv[3]}/bot${secretConfig.botToken}`, {
        drop_pending_updates: true
        /* Please, remove this line after the bot have ability to control messages between instances!!! */
    });
    tgbot.openWebHook();
}
const tgBotDo = {
    SendMessage: async (msg, isSilent = false, parseMode = null, form = {}) => {
        await delay(100);
        if (isSilent) form.disable_notification = true;
        if (parseMode) form.parse_mode = parseMode;
        return await tgbot.sendMessage(secretConfig.target_TG_ID, msg, form).catch((e) => tgLogger.warn(e.toString()));
    },
    RevokeMessage: async (msgId) => {
        await delay(100);
        return await tgbot.deleteMessage(secretConfig.target_TG_ID, msgId).catch((e) => {
            tgLogger.warn(e.toString());
        });
    },
    SendChatAction: async (action) => {
        await delay(100);
        return await tgbot.sendChatAction(secretConfig.target_TG_ID, action).catch((e) => {
            tgLogger.warn(e.toString());
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
        if (isSilent) form.disable_notification = true;
        return await tgbot.sendAnimation(secretConfig.target_TG_ID, path, form, {contentType: 'image/gif'}).catch((e) => tgLogger.warn(e.toString()));
    },
    SendPhoto: async (msg, path, isSilent = false, hasSpoiler = false) => {
        await delay(100);
        let form = {
            caption: msg,
            has_spoiler: hasSpoiler,
            width: 100,
            height: 100,
            parse_mode: "HTML",
        };
        if (isSilent) form.disable_notification = true;
        return await tgbot.sendPhoto(secretConfig.target_TG_ID, path, form, {contentType: 'image/jpeg'}).catch((e) => tgLogger.warn(e.toString()));
    },
    EditMessageText: async (text, formerMsg) => {
        // await delay(100);
        let form = {
            chat_id: secretConfig.target_TG_ID,
            message_id: formerMsg.message_id,
            parse_mode: "HTML"
        };
        return await tgbot.editMessageText(text, form).catch((e) => tgLogger.warn(e.toString()));
    },
    EditMessageMedia: async (file_id, formerMsg, hasSpoiler = false) => {
        // await delay(100);
        let form = {
            chat_id: secretConfig.target_TG_ID,
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
            tgLogger.warn(e.toString());
            return e.toString();
        }
        return "Unknown Error.";
    },
    SendAudio: async (msg, path, isSilent = false) => {
        await delay(100);
        let form = {
            caption: msg,
            parse_mode: "HTML",
        };
        if (isSilent) form.disable_notification = true;
        return await tgbot.sendVoice(secretConfig.target_TG_ID, path, form, {contentType: 'audio/mp3'}).catch((e) => tgLogger.warn(e.toString()));
    },
    SendDocument: async (msg, path, isSilent = false) => {
        await delay(100);
        let form = {
            caption: msg,
            parse_mode: "HTML",
        };
        if (isSilent) form.disable_notification = true;
        return await tgbot.sendDocument(secretConfig.target_TG_ID, path, form, {contentType: 'application/octet-stream'}).catch((e) => tgLogger.warn(e.toString()));
    }
};

tgbot.on('polling_error', async (e) => {
    tgLogger.warn("Polling - " + e.message.replace("Error: ", ""));
});
tgbot.on('webhook_error', async (e) => {
    tgLogger.warn("Webhook - " + e.message.replace("Error: ", ""));
});


module.exports = {
    tgbot,
    tgBotDo

}