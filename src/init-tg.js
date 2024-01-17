const secret = require('../config/confLoader');
const TelegramBot = require("node-telegram-bot-api");
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const {tgLogger} = require('./common')();
const isPolling = (!(process.argv.length >= 3 && process.argv[2] === "hook"));
process.env["NTBA_FIX_350"] = "1";

const {downloader} = require("./common")();

let tgbot;
if (isPolling) {
    tgbot = new TelegramBot(secret.tgbot.botToken,
        {polling: {interval: secret.tgbot.polling.interval}, request: {proxy: require("../proxy")},});
    tgbot.deleteWebHook().then(() => {
    });
} else {
    tgbot = new TelegramBot(secret.tgbot.botToken, {
        webHook: {
            port: 8443,
            max_connections: 3,
            healthEndpoint: "/health",
            key: "config/srv.pem",
            cert: "config/cli.pem",
        },
        request: {proxy: require("../proxy")}
    });
    tgbot.setWebHook(secret.bundle.getTGBotHookURL(process.argv[3]), {
        drop_pending_updates: true
        /* Please, remove this line after the bot have ability to control messages between instances!!! */
    }).then(() => {
    });
    tgbot.openWebHook().then(() => {
    });
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
        return await retryWithLogging(async () => {
            return await tgbot.sendMessage(parseRecv(receiver, form), msg, form);
        }, 3, 3000);
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
    SendAnimation: async (msg, path, isSilent = false, hasSpoiler = false) => {
        await delay(100);
        let form = {
            caption: msg,
            has_spoiler: hasSpoiler,
            width: 100,
            height: 100,
            parse_mode: "HTML",
        };
        const receiver = (() => {
            const s = secret.misc.deliverSticker;
            if (s === false) return 0; // already filtered in main js
            if (s === true) return secret.class.push;
            if (s.tgid) return s;
        })();
        if (isSilent) form.disable_notification = true;
        // Temp. change for classifying stickers
        return await retryWithLogging(async () => {
            return await tgbot.sendAnimation(parseRecv(receiver, form), path, form, {contentType: 'image/gif'})
        }, 3, 3000);
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
        return await retryWithLogging(async () => {
            return await tgbot.sendPhoto(parseRecv(receiver, form), path, form, {contentType: 'image/jpeg'});
        }, 3, 3000);
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
        return await retryWithLogging(async () => {
            return await tgbot.sendDocument(parseRecv(receiver, form), path, form, {contentType: 'application/octet-stream'})
        }, 3, 3000);
    },
    SendVideo: async (receiver = null, msg, path, isSilent = false) => {
        let form = {
            caption: msg,
            parse_mode: "HTML",
        };
        if (isSilent) form.disable_notification = true;
        return await tgbot.sendVideo(parseRecv(receiver, form), path, form, {contentType: 'video/mp4'}).catch(e => logErrorDuringTGSend(e));
    },
    empty: () => {
    }
};
let errorStat = 0;
tgbot.on('polling_error', async (e) => {
    let msg = "Polling - " + e.message.replace("Error: ", ""), msg2 = `[${process.uptime().toFixed(2)}]\t`, msg3 = "[Err]\t";
    if (errorStat === 0) {
        errorStat = 1;
        setTimeout(async () => {
            if (errorStat > secret.tgbot.polling.pollFailNoticeThres) {
                // Following error count exceed the threshold after the timer set up by first error
                tgLogger.warn(`Frequent network issue detected! (${errorStat} errors in past 30 seconds) Please check network!\n${msg}`);
                with (secret.notification) await downloader.httpsCurl(baseUrl + prompt_network_problematic + default_arg);
            } else {
                // no other error during this period, discarding notify initiation
                errorStat = 0;
                tgLogger.info(`There may be a temporary network issue but now disappeared. If possible, please check your network config.`);

            }
        }, 42000);
        console.warn(msg3 + msg);
    } else if (errorStat > 0) {
        errorStat++;
        msg = msg.replace("Client network socket disconnected before secure TLS connection was established", "E_Socket_Disconnected").replace("EFATAL: ", "");

        console.warn(msg2 + msg);
    } else {
        console.warn(msg2 + msg);
    }
});
tgbot.on('webhook_error', async (e) => {
    tgLogger.warn("Webhook - " + e.message.replace("Error: ", ""));
});
const retryWithLogging = async (func, maxRetries, retryDelay = 10000) => {
    let retries = 0;
    while (retries <= maxRetries) {
        try {
            const res = await func();
            errorStat = 0;
            return res;
        } catch (error) {
            let errorMessage = `(${retries + 1}/${maxRetries}) MsgSendFail:` + error.message.replace(/(Error:)/g, '').trim();
            tgLogger.warn(errorMessage);
            if (error.code === 'ETELEGRAM') {
                return; // Directly exit if the error code is 'ETELEGRAM'
            }
            await delay(retryDelay);
            retries++;
        }
    }
    // If the maximum number of retries is reached, you can handle it here if needed.
    tgLogger.warn("Maximum retries reached. Could not complete the operation.");
};

function logErrorDuringTGSend(err) {
    let err2 = err.toString().replaceAll("Error:", "");
    tgLogger.warn(`MsgSendFail: ${err2}`);
}

module.exports = {
    tgbot,
    tgBotDo
}