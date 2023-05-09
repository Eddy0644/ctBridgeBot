const secretConfig = require('./config/secret');
const TelegramBot = require("node-telegram-bot-api");
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const {tgLogger,Config} = require('./common')();
const tgbot = new TelegramBot(secretConfig.botToken,
    {polling: {interval: 750}, request: {proxy: require("./config/proxy")},});

module.exports = {
    tgbot: tgbot,
    tgBotDo: {
        SendMessage: async (msg, isSilent = false, parseMode = null, form = {}) => {
            /*Debug Only;no TG messages delivered*/
            // return tgLogger.info(`Blocked Msg: ${msg}`);
            await delay(100);
            // let form = {};
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
            return await tgbot.sendAnimation(secretConfig.target_TG_ID, path, form, {contentType: 'image/gif'}).catch((e) => tgLogger.error(e));
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
            return await tgbot.sendPhoto(secretConfig.target_TG_ID, path, form, {contentType: 'image/jpeg'}).catch((e) => tgLogger.error(e));
        },
        EditMessageText: async (text,formerMsg) => {
            await delay(100);
            let form = {
                chat_id:secretConfig.target_TG_ID,
                message_id:formerMsg.message_id,
                parse_mode:"HTML"
            };
            return await tgbot.editMessageText(text,form).catch((e) => tgLogger.error(e));
        },
        SendAudio: async (msg, path, isSilent = false) => {
            await delay(100);
            let form = {
                caption: msg,
                parse_mode: "HTML",
            };
            if (isSilent) form.disable_notification = true;
            return await tgbot.sendVoice(secretConfig.target_TG_ID, path, form, {contentType: 'audio/mp3'}).catch((e) => tgLogger.error(e));
        },
        SendDocument: async (msg, path, isSilent = false) => {
            await delay(100);
            let form = {
                caption: msg,
                parse_mode: "HTML",
            };
            if (isSilent) form.disable_notification = true;
            return await tgbot.sendDocument(secretConfig.target_TG_ID, path, form, {contentType: 'application/octet-stream'}).catch((e) => tgLogger.error(e));
        }
    }
}