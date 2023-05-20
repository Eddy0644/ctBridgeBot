const secretConfig = require('../config/secret');
const TelegramBot = require("node-telegram-bot-api");
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const {tgLogger} = require('./common')();
const isPolling = (!(process.argv.length >= 3 && process.argv[2] === "hook"));
let tgbot;
if (isPolling) {
    tgbot = new TelegramBot(secretConfig.botToken,
        {polling: {interval: 1488}, request: {proxy: require("../config/proxy")},});
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
        request: {proxy: require("../config/proxy")}
    });
    tgbot.setWebHook(`${secretConfig.webHookUrlPrefix}${process.argv[3]}/bot${secretConfig.botToken}`, {
        drop_pending_updates: true
        /* Please, remove this line after the bot have ability to control messages between instances!!! */
    });
    tgbot.openWebHook();
}

module.exports = {
    tgbot: tgbot,
    tgBotDo: {
        SendMessage: async (msg, isSilent = false, parseMode = null, form = {}) => {
            await delay(100);
            if (isSilent) form.disable_notification = true;
            if (parseMode) form.parse_mode = parseMode;
            return await tgbot.sendMessage(secretConfig.target_TG_ID, msg, form).catch((e) => tgLogger.error(e.toString()));
        },
        RevokeMessage: async (msgId) => {
            await delay(100);
            return await tgbot.deleteMessage(secretConfig.target_TG_ID, msgId).catch((e) => {
                tgLogger.error(e.toString());
            });
        },
        SendChatAction: async (action) => {
            await delay(100);
            return await tgbot.sendChatAction(secretConfig.target_TG_ID, action).catch((e) => {
                tgLogger.error(e.toString());
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
            return await tgbot.sendAnimation(secretConfig.target_TG_ID, path, form, {contentType: 'image/gif'}).catch((e) => tgLogger.error(e.toString()));
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
            return await tgbot.sendPhoto(secretConfig.target_TG_ID, path, form, {contentType: 'image/jpeg'}).catch((e) => tgLogger.error(e.toString()));
        },
        EditMessageText: async (text, formerMsg) => {
            // await delay(100);
            let form = {
                chat_id: secretConfig.target_TG_ID,
                message_id: formerMsg.message_id,
                parse_mode: "HTML"
            };
            return await tgbot.editMessageText(text, form).catch((e) => tgLogger.error(e.toString()));
        },
        SendAudio: async (msg, path, isSilent = false) => {
            await delay(100);
            let form = {
                caption: msg,
                parse_mode: "HTML",
            };
            if (isSilent) form.disable_notification = true;
            return await tgbot.sendVoice(secretConfig.target_TG_ID, path, form, {contentType: 'audio/mp3'}).catch((e) => tgLogger.error(e.toString()));
        },
        SendDocument: async (msg, path, isSilent = false) => {
            await delay(100);
            let form = {
                caption: msg,
                parse_mode: "HTML",
            };
            if (isSilent) form.disable_notification = true;
            return await tgbot.sendDocument(secretConfig.target_TG_ID, path, form, {contentType: 'application/octet-stream'}).catch((e) => tgLogger.error(e.toString()));
        }
    }
}