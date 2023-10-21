// Note that ES module loaded in cjs usually have extra closure like require("file-box").FileBox, remind!
// noinspection DuplicatedCode

const secret = require('../config/confLoader');
const fs = require("fs");
const dayjs = require('dayjs');
const DataStorage = require('./dataStorage.api');
const wx_emoji_conversions = require("../config/wx-emoji-map");
const stickerLib = new DataStorage("./sticker_v2.json");
const {
    wxLogger, tgLogger, ctLogger, LogWxMsg, conLogger,
    CommonData, STypes, downloader, processor, delay
} = require('./common')();

const msgMappings = [];
const state = {
    v: { // variables
        msgDropState: 0,
        syncSelfState: 0,
        targetLock: 0,
        timerDataCount: 6,
        msgMergeFailCount: 6,
        globalNetworkErrorCount: 3,
    },
    last: {},
    s: { // session
        lastExplicitTalker: null,
        helpCmdInstance: null,
        selfName: "",
    },
    preRoom: {
        firstWord: "",
        tgMsg: null,
        topic: "",
        msgText: "",
        lastTalker: "",
    },
    prePerson: {
        tgMsg: null,
        name: "",
        msgText: "",
    },
    lastEmotion: {
        md5: "",
        ts: 0
    },
    // store TG messages which need to be revoked after a period of time
    poolToDelete: [],
    // {tgMsg:null,toDelTs:0}
    // store TG messages which failed to deliver due to network problems or so.
    poolFailing: [],
    C2CTemp: [],
};
state.poolToDelete.add = function (tgMsg, delay, receiver) {
    if (tgMsg !== null) {
        tgLogger.debug(`Added message #${tgMsg.message_id} to poolToDelete with timer (${delay})sec.`);
        state.poolToDelete.push({tgMsg: tgMsg, toDelTs: (dayjs().unix()) + delay, receiver});
    } else {
        tgLogger.debug(`Attempting to add message to poolToDelete with timer (${delay})sec, but got null Object.`);
    }
};
const {tgbot, tgBotDo} = require('./tgbot-pre');
const {wxbot, DTypes} = require('./wxbot-pre')(tgBotDo, wxLogger);

// Loading instance modules...
const env = {
    state, tgBotDo, tgLogger, defLogger: ctLogger, wxLogger, secret, wxbot, processor, mod: {}
};
const mod = {
    // autoRespond: require('./autoResponder')(env),
    upyunMiddleware: require('../modsrc/upyunMiddleware')(env),
    audioRecognition: require('../modsrc/audioRecognition')(env),
    wxMddw: require('../modsrc/wxMddw')(env),
    tgProcessor: require('../modsrc/tgProcessor')(env),
}
env.mod = mod;

async function onTGMsg(tgMsg) {
    if (tgMsg.DEPRESS_IDE_WARNING) return;
    if (tgMsg.text && tgMsg.text.replace(secret.tgbot.botName, "") === "/drop_off" && state.v.msgDropState) {
        // Verified as /drop_off command
        state.v.msgDropState = 0;
        tgLogger.info("tg Msg drop lock is now OFF.");
        if (state.s.helpCmdInstance) {
            // former /help instance found, try to delete it...
            await tgBotDo.RevokeMessage(state.s.helpCmdInstance.message_id, tgMsg.matched);
            state.s.helpCmdInstance = null;
        }
        return;
    } else if (state.v.msgDropState) {
        tgLogger.debug(`During TG-side lock ON, recv: ${Object.getOwnPropertyNames(tgMsg).filter(e => !['message_id', 'from', 'chat', 'date'].includes(e)).join(', ')}`);
        return;
    }
    try {
        if (process.uptime() < 4) return;
        if (!secret.tgbot.tgAllowList.includes(tgMsg.from.id)) {
            tgLogger.trace(`Got TG message (#${tgMsg.message_id}) from unauthorized user (${tgMsg.from.id}), Ignoring.`);
            return;
        }

        // Iterate through secret.class to find matches
        tgMsg.matched = null;
        // s=0 -> default, s=1 -> C2C
        with (secret.class) {
            for (const pair of C2C) {
                // thread_id verification without reply-to support
                const thread_verify = (() => {
                    if (pair.threadId) {
                        if (tgMsg.message_thread_id) {
                            return pair.threadId === tgMsg.message_thread_id;
                        } else return false;
                    } else return true;
                })();
                if (tgMsg.chat.id === pair.tgid && thread_verify) {
                    tgMsg.matched = {s: 1, p: pair};
                    tgLogger.trace(`Message from C2C group: ${pair.tgid}, setting message default target to wx(${pair.wx[0]})`);
                    if (pair.flag.includes("mixed") &&
                        ((tgMsg.text && tgMsg.text.startsWith("*")) || (tgMsg.caption && tgMsg.caption.startsWith("*")))
                    ) {
                        tgLogger.debug(`Message started with * and is in mixed C2C chat, skipping...`);
                        return;
                    }
                    break;
                }
            }
            if (tgMsg.chat.id === def.tgid) tgMsg.matched = {s: 0};
            if ((secret.misc.deliverSticker !== false) && tgMsg.chat.id === secret.misc.deliverSticker.tgid) {
                const repl = tgMsg.reply_to_message;
                if (repl && (repl.animation || repl.document) && /#sticker ([0-9,a-f]{3})/.test(repl.caption)) {
                    // Is almost same origin as sticker channel and is reply to a sticker
                    // Ready to modify sticker's hint
                    const matched = repl.caption.match(/#sticker ([0-9,a-f]{3})/), md5 = matched[1];
                    const flib = await stickerLib.get(md5);
                    flib.hint = tgMsg.text;
                    await stickerLib.set(md5, flib);
                    await mod.tgProcessor.replyWithTips("alreadySetStickerHint", secret.misc.deliverSticker, 10, md5);
                    return;
                }
            }
            if (tgMsg.chat.id === push.tgid) {
                tgLogger.info(`Messages sent to Push channel are ignored now.`);
                return; // tgMsg.matched = {s: 2};
            }

            if (!tgMsg.matched) {
                // Skip this message, as no match found
                tgLogger.debug(`Received message from unauthorized origin. Skipping...`);
                tgLogger.trace(`Chat_id: (${tgMsg.chat.id}) Title:(${tgMsg.chat.title})`);
                return;
            }
        }

        { // **Sub:** replaceWXCustomEmojis
            let newText = tgMsg.text;
            if (typeof tgMsg.entities === 'object') for (const entity of tgMsg.entities) {
                if (entity.type === "custom_emoji" && wx_emoji_conversions.hasOwnProperty(entity.custom_emoji_id)) {
                    // Get the []-wrapped text for this custom emoji
                    const wrappedText = wx_emoji_conversions[entity.custom_emoji_id];
                    // Get the ordinary emoji from the text
                    const emoji = tgMsg.text.substring(entity.offset, entity.offset + entity.length);
                    // Replace the ordinary emoji with the []-wrapped text
                    newText = newText.replace(emoji, wrappedText);
                }
            }
            tgMsg.text = newText;
        } // End Sub: replaceWXCustomEmojis

        if (tgMsg.photo) return await deliverTGToWx(tgMsg, tgMsg.photo, "photo");
        if (tgMsg.sticker) return await deliverTGToWx(tgMsg, tgMsg.sticker.thumbnail, "photo");
        if (tgMsg.document) return await deliverTGToWx(tgMsg, tgMsg.document, "document");
        if (tgMsg.video) return await deliverTGToWx(tgMsg, tgMsg.video, "video");
        if (tgMsg.voice) return await deliverTGToWx(tgMsg, tgMsg.voice, "voice!");
        // with (tgMsg) {
        //     const media = photo || (sticker && sticker.thumbnail) || document || video || voice;
        //     const type = photo ? "photo" : (sticker ? "photo" : (document ? "document" : (video ? "video" : "voice!")));
        //     if (media) {
        //         await deliverTGToWx(tgMsg, media, type);
        //     }
        // }


        // Non-text messages must be filtered ahead of below !---------------
        if (!tgMsg.text) {
            tgLogger.info(`A TG message without 'text' passed through text processor, skipped. ` +
                `recv: ${Object.getOwnPropertyNames(tgMsg).filter(e => !['message_id', 'from', 'chat', 'date'].includes(e)).join(', ')}`);
            tgLogger.trace(`The tgMsg detail of which: `, JSON.stringify(tgMsg));
            return;
        }

        for (const pair of secret.filtering.tgContentReplaceList) {
            if (tgMsg.text.includes(pair[0])) {
                tgLogger.trace(`Replacing pattern '${pair[0]}' to '${pair[1]}'.`);
                tgMsg.text = tgMsg.text.replaceAll(pair[0], pair[1]);
            }
        }

        if (tgMsg.reply_to_message) {
            const repl_to = tgMsg.reply_to_message;
            // TODO refactor this area | if (tgMsg.reply_to_message)
            {
                const rp1 = tgMsg.text.replace(secret.tgbot.botName, "");
                if (rp1.includes("/try_edit")) {
                    return await tgBotDo.EditMessageText(rp1.replace("/try_edit ", ""), repl_to, tgMsg.matched);
                }
                if (rp1 === "/spoiler") {
                    // TG-wide command so not put inside the for loop
                    const orig = repl_to;
                    if (orig.photo) {
                        const file_id = orig.photo[orig.photo.length - 1].file_id;
                        const res = await tgBotDo.EditMessageMedia(file_id, orig, true);
                        if (res !== true) {
                            await mod.tgProcessor.replyWithTips("setMediaSpoilerFail", tgMsg.matched, 6, res);
                        }
                    } else {
                        // try to run /spoiler on a text (Experimental)
                        tgLogger.debug(`Changing a message into spoiler format...`);
                        await tgBotDo.EditMessageText(`<span class="tg-spoiler">${orig.text}</span>`, orig, tgMsg.matched);
                    }
                    return;
                }

            }
            if (state.s.helpCmdInstance && repl_to.message_id === state.s.helpCmdInstance.message_id) {
                // Consider this msg as reply to former help instance
                if (tgMsg.text.startsWith("/")) {
                    const res = await tgCommandHandler(tgMsg);
                    if (!res) return;
                }
            }

            tgLogger.trace(`This message has reply flag, searching for mapping...`);
            let success = 0;
            // Filter forum_topic_created repl_to as msg maybe sent flat in topic
            if (tgMsg.reply_to_message.forum_topic_created) {
                success = 1;
            } else for (const mapPair of msgMappings) {
                if (mapPair.tgMsgId === repl_to.message_id && mod.tgProcessor.isSameTGTarget(mapPair.receiver, tgMsg.matched)) {
                    if ((tgMsg.text === "ok" || tgMsg.text === "OK") && mapPair.wxMsg && mapPair.wxMsg.filesize) {
                        // 对wx文件消息做出了确认
                        if (await getFileFromWx(mapPair.wxMsg)) wxLogger.debug(`Download request of wx File completed.`);
                        return tgBotDo.SendChatAction("upload_document");
                    }
                    if (tgMsg.text === "@") {
                        // Trigger special operation: Lock and set as explicit
                        state.v.targetLock = 2;
                        const {name, talker} = mapPair;
                        state.last = {
                            s: STypes.Chat,
                            target: talker,
                            name: name,
                            wxMsg: null,
                            isFile: null
                        };
                        ctLogger.debug(`Upon '@' msg, set '${name}' as last talker and lock-target to 2.`);
                        await mod.tgProcessor.replyWithTips("setAsLastAndLocked", tgMsg.matched, 6, name);
                    } else {
                        if (tgMsg.matched.s === 0) {
                            if (state.v.targetLock === 2) {
                                state.v.targetLock = 0;
                                ctLogger.debug(`After lock=2, a quoted message reset lock=0.`);
                            }
                            state.s.lastExplicitTalker = mapPair.talker;
                            await mapPair.talker.say(tgMsg.text);
                            if (mapPair.name === state.preRoom.topic) {
                                // the explicit talker - Room matches preRoom
                                await mod.tgProcessor.addSelfReplyTs();
                            }
                            tgBotDo.SendChatAction("choose_sticker", tgMsg.matched).then(tgBotDo.empty)
                            ctLogger.debug(`Handled a message send-back to ${mapPair.name}.`);
                            return;
                        } else {
                            ctLogger.info(`In C2C chat found a message with reply flag which is not 'OK' or '@'. Sending...`);
                            success = 1;
                        }
                    }
                }
            }
            if (!success) {
                ctLogger.debug(`Unable to send-back due to no match in msgMappings.`);
                return;
            }
            // !tgMsg.reply_to_message  ------------------
        }

        // Not replacing the original tgMsg.text here
        if (tgMsg.text.startsWith("/")) {
            const res = await tgCommandHandler(tgMsg);
            if (!res) return;
        }

        if (tgMsg.text.indexOf("F$") === 0) {
            // Want to find somebody, and have inline parameters
            let findToken = tgMsg.text.replace("F$", "");
            for (const pair of secret.filtering.wxFindNameReplaceList) {
                if (findToken === pair[0]) {
                    findToken = pair[1];
                    break;
                }
            }
            const res = await findSbInWechat(findToken, 0, tgMsg.matched);
            if (res) await tgBotDo.RevokeMessage(tgMsg.message_id, tgMsg.matched);
            return;
        }

        // Get a copy of program verbose log of 1000 chars by default.
        if (tgMsg.text.indexOf("/log") === 0) {
            const path = `./log/day.${dayjs().format("YY-MM-DD")}.log`;
            let log = (await fs.promises.readFile(path)).toString();
            let chars = 1000;
            if (tgMsg.text.length > 5) {
                chars = parseInt(tgMsg.text.replace("/log ", ""));
            }
            // Output log in markdown mono-width mode
            await tgBotDo.SendMessage(tgMsg.matched, `\`\`\`${log.substring(log.length - chars, log.length)}\`\`\``, true, "MarkdownV2");
            return;
        }


        //inline find someone: (priority higher than ops below)
        // TODO change here when classified is on
        if (tgMsg.matched.s === 0 && /(::|：：)\n/.test(tgMsg.text)) {
            const match = tgMsg.text.match(/^(.{1,12})(::|：：)\n/);
            if (match && match[1]) {
                // Parse Success
                let findToken = match[1], found = false;
                for (const pair of secret.filtering.wxFindNameReplaceList) {
                    if (findToken === pair[0]) {
                        findToken = pair[1];
                        found = true;
                        break;
                    }
                }
                // if settings.enableInlineSearchForUnreplaced is true,
                // then whether findToken is in wxFindNameReplaceList it will continue.
                if (found || secret.misc.enableInlineSearchForUnreplaced) {
                    wxLogger.trace(`Got an attempt to find [${findToken}] in WeChat.`);
                    const res = await findSbInWechat(findToken, tgMsg.message_id, tgMsg.matched);
                    if (res) {
                        // await tgBotDo.RevokeMessage(tgMsg.message_id);
                        tgMsg.text = tgMsg.text.replace(match[0], "");
                        // left empty here, to continue forward message to talker and reuse the code
                    } else return;
                } else {
                    ctLogger.debug(`Message have inline search, but no match in nameFindReplaceList pair.`);
                    return;
                }
            } else {
                ctLogger.debug(`Message have dual colon, but parse search token failed. Please Check.`);
            }
        }


        // Last process block  ------------------------
        if (tgMsg.matched.s === 1) {
            const wxTarget = await getC2CPeer(tgMsg.matched);
            if (!wxTarget) return;
            await wxTarget.say(tgMsg.text);
            tgBotDo.SendChatAction("choose_sticker", tgMsg.matched).then(tgBotDo.empty)
            const wx1 = tgMsg.matched.p.wx;
            if (wx1[1] === true && wx1[0] === state.preRoom.topic) {
                // the C2C Room matches preRoom
                // This function also contains /clear ! do not remove
                await mod.tgProcessor.addSelfReplyTs(wx1[0]);
            } else if (wx1[1] === false && wx1[0] === state.prePerson.name) {
                // the C2C Room matches prePerson, clear latter
                state.prePerson = {
                    firstWord: "",
                    tgMsg: null,
                    name: "",
                };
            }
            ctLogger.debug(`Handled a message send-back to C2C talker:(${tgMsg.matched.p.wx[0]}) on TG (${tgMsg.chat.title}).`);
        } else {
            // No valid COMMAND within msg
            if (Object.keys(state.last).length === 0) {
                // Activate chat & env. set
                await tgbot.sendMessage(tgMsg.chat.id, 'Nothing to do upon your message, ' + tgMsg.chat.id);
                const result = await tgbot.setMyCommands(CommonData.TGBotCommands);
                tgLogger.debug(`I received a message from chatId ${tgMsg.chat.id}, Update ChatMenuButton:${result ? "OK" : "X"}.`);
                return;
            }
            if (state.last.s === STypes.FindMode) {
                ctLogger.trace(`Finding [${tgMsg.text}] in wx by user prior "/find".`);
                // const msgToRevoke1 = state.lastOpt[1];
                let findToken = tgMsg.text;
                for (const pair of secret.filtering.wxFindNameReplaceList) {
                    if (findToken === pair[0]) {
                        findToken = pair[1];
                        break;
                    }
                }
                const lastState = state.last;
                const result = await findSbInWechat(findToken, 0, tgMsg.matched);
                // Revoke the prompt 'entering find mode'
                if (result) {
                    await tgBotDo.RevokeMessage(lastState.userPrompt1.message_id);
                    await tgBotDo.RevokeMessage(lastState.botPrompt1.message_id);
                    await tgBotDo.RevokeMessage(tgMsg.message_id);
                }
                return;
            }
            if (state.last.s === STypes.Chat) {
                if ((tgMsg.text === "ok" || tgMsg.text === "OK") && state.last.isFile) {
                    // 对wx文件消息做出了确认
                    tgBotDo.SendChatAction("typing", tgMsg.matched).then(tgBotDo.empty);
                    await getFileFromWx(state.last.wxMsg);
                    ctLogger.debug(`Handled a file reDownload from ${state.last.name}.`);
                } else {
                    // forward to last talker
                    await state.last.target.say(tgMsg.text);
                    if (state.last.name === state.preRoom.topic) {
                        // the last talker - Room matches preRoom
                        await mod.tgProcessor.addSelfReplyTs();
                    }
                    ctLogger.debug(`Handled a message send-back to speculative talker:(${state.last.name}).`);
                    tgBotDo.SendChatAction("choose_sticker", tgMsg.matched).then(tgBotDo.empty);
                }
            }
            // Empty here.

        }
    } catch (e) {
        tgLogger.warn(`{onTGMsg()}: ${e.message}`);
        tgLogger.debug(`Stack: ${e.stack.split("\n").slice(0, 5).join("\n")}`);
    }

}

tgbot.on('message', onTGMsg);


async function onWxMessage(msg) {
    // 按照距今时间来排除wechaty重启时的重复消息
    // sometimes there are delayed messages `by wechaty` for 150s age or more, so altered this.
    let isMessageDropped = (msg.age() > 40 && process.uptime() < 50) || (msg.age() > 200);
    //将收到的所有消息之摘要保存到wxLogger->trace,消息详情保存至wxMsg文件夹
    if (!secret.misc.savePostRawDataInDetailedLog && msg.type() === wxbot.Message.Type.Attachment && msg.payload.filename.endsWith(".49") && msg.payload.text.length > 8000) {
        // This post message will be delivered, but not save to log, as only one of them would take up to 40KB in log file.
    } else LogWxMsg(msg, isMessageDropped ? 1 : 0);
    if (isMessageDropped) return;

    //基本信息提取-------------
    const contact = msg.talker(); // 发消息人
    let content = msg.text().trim(); // 消息内容
    const room = msg.room(); // 是否是群消息
    const isGroup = room !== undefined;
    let topic = "";
    if (room) topic = await room.topic();
    let name = await contact.name();
    let alias = await contact.alias() || await contact.name(); // 发消息人备注
    let msgDef = {
        isSilent: false,
        forceMerge: false,
        replyTo: null,
        suppressTitle: false,
    }

    msg.DType = DTypes.Default;

    // 提前drop自己的消息, 避免deliver无用消息
    if (state.v.syncSelfState !== 1) if (room) {
        if (msg.self() && topic !== "CyTest") return;
    } else {
        if (msg.self()) return;
    }

    // Start deliver process, start fetching from config
    msg.receiver = null;
    with (secret.class) {
        for (const pair of C2C) {
            let matched = 0;
            if (pair.wx[1] === isGroup && isGroup === true) {
                matched = (pair.wx[0] === topic);
            } else {
                matched = ((pair.wx[0] === alias) || (pair.wx[0] === name)) && isGroup === false && pair.wx[1] === false;
            }
            if (matched) {
                // Matched pair
                msg.receiver = pair;
                break;
            }
        }
        if (!msg.receiver) {
            msg.receiver = def;
        }
    }

    // lock is hard to make; used another strategy.


    {   // do exclude or include according to Config
        const strategy = secret.filtering.wxNameFilterStrategy;
        let ahead;
        const originName = room ? topic : alias,
            contentSub = content.substring(0, (content.length > 50 ? 50 : content.length));
        if (strategy.useBlackList) {
            ahead = true;
            for (const keyword of strategy.blackList) {
                if (originName.includes(keyword)) {
                    wxLogger.debug(`[${originName}]消息因黑名单未递送： ${contentSub}`);
                    ahead = false;
                }
            }
        } else {  // Use whitelist
            ahead = false;
            for (const keyword of strategy.whiteList) {
                if (originName.includes(keyword)) {
                    ahead = true;
                    break;
                }
            }
            if (!ahead) wxLogger.debug(`[${originName}]消息因不符合白名单未递送： ${contentSub}`);
        }

        // Some code must be executed before filtering; so put it here. --------------
        if (room) {
            if (name === topic) if (content.includes("Red packet") || content.includes("红包")) {
                const strategy = secret.misc.deliverRoomRedPacketInAdvance;
                if (strategy === 0) {
                    content = `[🧧]`;
                } else {
                    if (strategy === 2 || (strategy === 1 && ahead)) {
                        // satisfy the condition for deliver in advance
                        await tgBotDo.SendMessage(msg.receiver, `[🧧 in ${topic}]`, 0);
                        tgLogger.debug(`Delivered a room msg in advance as it includes Red Packet.`);
                        return;
                    }
                    tgLogger.info(`A Red Packet Message not handled! topic=(${topic}), strategy=(${strategy}), ahead=(${ahead})`);
                    return;
                }
            }
        } else {

        }
        // End up the filtering block. -----------------
        if (!ahead) return;
    }

    // 已撤回的消息单独处理
    if (msg.type() === wxbot.Message.Type.Recalled) {
        const recalledMessage = await msg.toRecalled();
        wxLogger.debug(`This message was a recaller, original is [ ${recalledMessage} ]`);
        msgDef.isSilent = true;
        LogWxMsg(recalledMessage, 2);
        // content = `❌ [ ${recalledMessage} ] was recalled.`;
        // 匹配消息类型、联系人名称、群名称和消息内容的正则表达式
        const regex = /(\w+)\[🗣Contact<([^>]+)>(?:@👥Room<([^>]+)>)?]\s+(.*?)/;
        const match = `${recalledMessage}`.replace("Message#", "").match(regex);
        if (match) {
            const type = match[1], contactName = match[2], groupName = match[3] || '',
                msgContent = match[4];
            content = `[Recalled ${type}]`
                + (contactName === name ? "" : contactName) + (groupName === topic ? "" : `@${groupName}`)
                + `: ${msgContent}`;
        } else content = `[${recalledMessage}] was recalled.`;
        msg.DType = DTypes.Text;
    }

    // 处理自定义表情,若失败再处理图片
    const CustomEmotionRegex = new RegExp(/&lt;msg&gt;(.*?)md5="(.*?)"(.*?)cdnurl(.*?)"(.*?)" designer/g);
    if (msg.type() === wxbot.Message.Type.Image) {
        try {
            let result = CustomEmotionRegex.exec(content);
            let emotionHref = result[5].replace(/&amp;amp;/g, "&");
            let md5 = result[2];
            content = content.replace(/&lt;msg&gt;(.*?)&lt;\/msg&gt;/, `[CustomEmotion]`);
            msg.DType = DTypes.CustomEmotion;
            //查找是否有重复项,再保存CustomEmotion并以md5命名.消息详情中的filename有文件格式信息
            //Sometimes couldn't get fileExt so deprecate it
            // const fileExt = msg.payload.filename.substring(19, 22) || ".gif";
            const fileExt = ".gif";
            const cEPath = `./downloaded/customEmotion/${md5 + fileExt}`;
            if (secret.misc.deliverSticker === false) {
                wxLogger.debug(`A sticker (md5=${md5}) sent by (${contact}) is skipped due to denial config.`);
                return;
            }
            const stickerUrlPrefix = secret.misc.deliverSticker.urlPrefix;
            {
                // filter duplicate-in-period sticker
                let filtered = false;
                if (processor.isTimeValid(state.lastEmotion.ts, 18) && md5 === state.lastEmotion.md5) {
                    // Got duplicate and continuous Sticker, skipping and CONDEMN that!
                    wxLogger.debug(`${contact} sent a duplicate emotion. Skipped and CONDEMN that !!!`);
                    filtered = true;
                }
                // Regardless match or not, update state.lastEmotion
                state.lastEmotion = {
                    md5: md5,
                    ts: dayjs().unix()
                }
                if (filtered) return;
            }
            let ahead = true;
            {
                // skip stickers that already sent and replace them into text
                const fetched = await stickerLib.get(md5.substring(0, 3));
                if (fetched === null) {
                    ctLogger.trace(`former instance for CuEmo '${md5}' not found, entering normal deliver way.`);
                } else {
                    if (fetched.full_md5 !== md5) {
                        ctLogger.warn(`Sticker Collision Detected! If you rely on sticker delivery then you should check it.\n${md5} is short for (${fetched.full_md5}).`);
                    }
                    // change msg detail so that could be used in merging or so.
                    // content = `[${md5.substring(0, 3)} of #sticker]`;
                    msg.DType = DTypes.Text;
                    msgDef.isSilent = true;
                    ahead = false;
                    msg.md5 = md5.substring(0, 3);
                    if (typeof fetched.msgId === "number") content = secret.c11n.stickerWithLink(stickerUrlPrefix, fetched, msg.md5);
                    else content = `[${md5.substring(0, 3)} of #sticker]`;
                    ctLogger.trace(`Found former instance for sticker '${md5}', replacing to Text. (${content})`);
                }
            }
            if (ahead && !fs.existsSync(cEPath)) {
                if (await downloader.httpNoProxy(emotionHref, cEPath)) {
                    // downloadFile_old(emotionHref, path + ".backup.gif");
                    msg.downloadedPath = cEPath;
                    wxLogger.debug(`Detected as CustomEmotion, Downloaded as: ${cEPath}, and delivering...`);
                    msg.md5 = md5.substring(0, 3);
                    const stream = fs.createReadStream(msg.downloadedPath);
                    const tgMsg2 = await tgBotDo.SendAnimation(`#sticker ${msg.md5}`, stream, true, false);
                    await stickerLib.set(msg.md5, {
                        msgId: tgMsg2.message_id, path: cEPath, hint: "", full_md5: md5,
                    });
                    msg.DType = DTypes.Text;
                    msgDef.isSilent = true;
                    content = `<a href="${stickerUrlPrefix}${tgMsg2.message_id}">[Sticker](${msg.md5})</a>`;
                } else msg.downloadedPath = null;
            } else if (ahead) {
                msg.downloadedPath = cEPath;
                msg.md5 = md5.substring(0, 3);
                const stream = fs.createReadStream(msg.downloadedPath);
                const tgMsg2 = await tgBotDo.SendAnimation(`#sticker ${msg.md5}`, stream, true, false);
                await stickerLib.set(msg.md5, {
                    msgId: tgMsg2.message_id, path: cEPath, hint: "", full_md5: md5,
                });
                msg.DType = DTypes.Text;
                msgDef.isSilent = true;
                content = `<a href="${stickerUrlPrefix}${tgMsg2.message_id}">[Sticker](${msg.md5})</a>`;
            }
        } catch (e) {
            wxLogger.trace(`CustomEmotion Check not pass, Maybe identical photo.(${e.toString()})`);
            //尝试解析为图片
            const fBox = await msg.toFileBox();
            const photoPath = `./downloaded/photo/${processor.filterFilename(`${alias}-${msg.payload.filename}`)}`;
            await fBox.toFile(photoPath);
            if (fs.existsSync(photoPath)) {
                wxLogger.debug(`Detected as Image, Downloaded as: ${photoPath}`);
                msg.DType = DTypes.Image;
                msg.downloadedPath = photoPath;
                msgDef.isSilent = true;
            } else wxLogger.info(`Detected as Image, But download failed. Ignoring.`);

        }
    }

    // 尝试下载语音
    if (msg.type() === wxbot.Message.Type.Audio) try {
        const fBox = await msg.toFileBox();
        // let audioPath = `./downloaded/audio/${alias}-${msg.payload.filename}`;
        let audioPath = `./downloaded/audio/${dayjs().format("YYYYMMDD-HHmmss").toString()}-(${processor.filterFilename(alias)}).mp3`;
        await fBox.toFile(audioPath);
        if (!fs.existsSync(audioPath)) throw new Error("save file error");
        // await recogniseAudio(msg, audioPath);
        await mod.audioRecognition.wx_audio_VTT(msg, audioPath);
        wxLogger.debug(`Detected as Audio, Downloaded as: ${audioPath}`);
        msg.DType = DTypes.Audio;
        msg.downloadedPath = audioPath;
        msgDef.isSilent = false;
    } catch (e) {
        wxLogger.info(`Detected as Audio, But download failed. Ignoring.`);
        msg.DType = DTypes.Text;
        content = "🎤(Fail to download)";
    }
    // 视频消息处理或自动下载
    if (msg.type() === wxbot.Message.Type.Video) {
        msg.videoPresent = 1;
        // await mod.wxMddw.handleVideoMessage(msg, alias);
        content = `🎦(Downloading...)`;
        msg.autoDownload = 1;
        msgDef.isSilent = true;
        // Due to a recent change in web-wx video, method below which can get video length and playlength
        // failed to work now. Using default no-info method now.
        msg.DType = DTypes.File;
    }
    // 文件及公众号消息类型
    if (msg.type() === wxbot.Message.Type.Attachment) {
        if (msg.payload.filename.endsWith(".49")) {
            // wxLogger.trace(`filename has suffix .49, maybe pushes.`);
            wxLogger.debug(`Received Posts from [${name}], title:[${msg.payload.filename.replace(".49", "")}].`);
            const result = await mod.wxMddw.handlePushMessage(content, msg, name);
            if (result !== 0) {
                //Parse successful, ready to overwrite content
                content = result;
                msg.DType = DTypes.Push;
                wxLogger.debug(`Parse successful, ready to send into 'Push' channel.`);
            }
        } else if (msg.payload.filename.endsWith(".url")) {
            wxLogger.trace(`filename has suffix .url, maybe LINK.`);
            const LinkRegex = new RegExp(/&lt;url&gt;(.*?)&lt;\/url&gt;/);
            try {
                let regResult = LinkRegex.exec(content);
                const url = regResult[1].replace(/&amp;amp;/g, "&");
                const caption = msg.payload.filename.replace(".url", "");
                msg.DType = DTypes.Text;
                content = `🔗 [<a href="${url}">${caption}</a>]` + (secret.misc.addHashCtLinkToMsg !== -1 ? `#ctLink` : '');
                msgDef.isSilent = false;
            } catch (e) {
                wxLogger.debug(`Detected as Link, but error occurred while getting content.`);
            }
        } else {
            // const result=await deliverWxToTG();
            const FileRegex = new RegExp(/&lt;totallen&gt;(.*?)&lt;\/totallen&gt;/);
            try {
                let regResult = FileRegex.exec(content);
                msg.filesize = parseInt(regResult[1]);
                msgDef.isSilent = false;
                content = `📎[${msg.payload.filename}], ${(msg.filesize / 1024 / 1024).toFixed(3)}MB.\n`;
                msg.toDownloadPath = `./downloaded/file/${dayjs().unix() % 1000}-${msg.payload.filename}`;
                if (msg.filesize === 0) {
                    wxLogger.warn(`Got a zero-size wx file here, no delivery would present and please check DT log manually.\nSender:{${alias}}, filename=(${msg.payload.filename})`);
                    return;
                } else if (msg.filesize < 50) {
                    // 小于50个字节的文件不应被下载，但是仍会提供下载方式：因为大概率是新的消息类型，
                    // 比如块级链接和服务消息
                    msg.autoDownload = false;
                    msgDef.isSilent = true;
                    content += `Too small, so it maybe not a valid file. Check DT log for detail.`
                    wxLogger.info(`Got a very-small wx file here, please check manually. Sender:{${alias}`);
                } else if (msg.filesize < secret.misc.wxAutoDownloadSizeThreshold) {
                    msg.autoDownload = true;
                    content += `Trying download as size is smaller than threshold.`/*Remember to change the prompt in two locations!*/;
                } else {
                    msg.autoDownload = false;
                    content += `Send a single <code>OK</code> to retrieve that.`;
                }
                msg.DType = DTypes.File;
            } catch (e) {
                wxLogger.debug(`Detected as File, but error occurred while getting filesize.`);
            }
        }
    }

    //文字消息判断:
    if (msg.DType === DTypes.Default && msg.type() === wxbot.Message.Type.Text) msg.DType = DTypes.Text;

    // Pre-processor for Text
    if (msg.DType === DTypes.Text || msg.DType === DTypes.Push) {

        if (contact.type() === wxbot.Contact.Type.Official) {
            msg.DType = DTypes.Push;
            wxLogger.trace(`wechaty says this is from Official Account, so classified into Push channel.`);
        } else
            // 筛选出公众号等通知消息，归类为Push
            for (const testPair of CommonData.wxPushMsgFilterWord) {
                let s = 0;
                for (const testPairElement of testPair) {
                    if (!content.includes(testPairElement)) s = 1;
                }
                if (s === 0) {
                    msg.DType = DTypes.Push;
                    wxLogger.trace(`Matched pair in wxPushMsgFilterWord, so classified into Push channel.`);
                    break;
                }

            }
        if (content.includes("bigheadimgurl") && content.includes("brandIconUrl")) {
            content = await mod.wxMddw.parseOfficialAccountMsg(content);
        }
    }

    // 正式处理消息--------------
    if (msg.DType > 0) {
        const titles = secret.c11n;
        { // **Sub:** Bulk Text Replacement
            if (secret.misc.addHashCtLinkToMsg === 1) content = content.replace(/(?!href=")(https?:\/\/)/g, '(#ctLink)$1');

            if (/\[收到了一个表情，请在手机上查看]|\[Send an emoji, view it on mobile]/.test(content)) {
                msgDef.isSilent = true;
                // Emoji support test: 💠🔖⚗️🧱💿🌁🌠🧩🧊  🔧🕳❎❌ 🗣👥
                content = content.replace(/\[收到了一个表情，请在手机上查看]|\[Send an emoji, view it on mobile]/, titles.unsupportedSticker);
                wxLogger.trace(`Updated msgDef to Silent by keyword '收到了表情'.`);
            }
            if (/\[收到一条视频\/语音聊天消息，请在手机上查看]|\[Receive a video \/ voice chat message, view it on your phone]/.test(content)) {
                content = content.replace(/\[收到一条视频\/语音聊天消息，请在手机上查看]|\[Receive a video \/ voice chat message, view it on your phone]/, titles.recvCall);
                if (await downloader.httpsCurl(secret.notification.incoming_call_webhook(alias)) !== "SUCCESS") {
                    // here means no valid notification hook is set
                } else {
                    msgDef.isSilent = true;
                    // give a silent delivery for this message
                }
                wxLogger.debug(`Sending call notification from (${alias}) to User.`);
            }

            // Weixin, Wechat, MicroMsg: how incredible multiple name! micro-message!!!
            content = content.replace(/\[收到一条微信转账消息，请在手机上查看]|\[Received a micro-message transfer message, please view on the phone]/, titles.recvTransfer);
            content = content.replace(/\[收到一条暂不支持的消息类型，请在手机上查看]|\[收到一条网页版微信暂不支持的消息类型，请在手机上查看]/, titles.msgTypeNotSupported);

            content = mod.tgProcessor.filterMsgText(content,{isGroup, peerName: name});

            for (const pair of secret.filtering.wxContentReplaceList) {
                if (content.includes(pair[0])) {
                    wxLogger.trace(`Replaced wx (${pair[0]}) to (${pair[1]})`);
                    while (content.includes(pair[0])) content = content.replace(pair[0], pair[1]);
                }
            }
        } // End Sub: Bulk Text Replacement

        if (room) {
            // 是群消息 - - - - - - - -

            // 群系统消息设为静音
            if (name === topic) {
                // Did system message have any impact on me? No. So silent them.
                msgDef.isSilent = true;
                msgDef.forceMerge = true;
                // Force override {name} to let system message seems better
                name = titles.systemMsgTitleInRoom;
            }

            try {
                if (processor.isPreRoomValid(state.preRoom, topic, msgDef.forceMerge, secret.misc.mergeResetTimeout.forGroup)) {
                    const result = await mod.tgProcessor.mergeToPrev_tgMsg(msg, true, content, name, alias, msg.DType === DTypes.Text);
                    if (result === true) return;
                } else msg.preRoomNeedUpdate = true;
            } catch (e) {
                wxLogger.info(`Error occurred while merging room msg into older TG msg. Falling back to normal way.\n\t${e.toString()}\n\t${JSON.stringify(state.preRoom)}`);
                state.v.msgMergeFailCount--;
                if (state.v.msgMergeFailCount < 0) await softReboot("merging message failure reaches threshold.");
            }
            // 系统消息如拍一拍
            // if (name === topic) {
            //     wxLogger.debug(`群聊[in ${topic}] ${content}`);
            //     await tgBotDo.SendMessage(`[in ${topic}] ${content}`, 1);
            //     tgLogger.debug(`Delivered a room msg in advance as it is system msg.`);
            //     return;
            // }
            const deliverResult = await deliverWxToTG(true, msg, content, msgDef);
            if (deliverResult) await addToMsgMappings(deliverResult.message_id, room, msg, msg.receiver);
        } else {
            //不是群消息 - - - - - - - -
            if (alias === "微信运动") {
                content = `[微信运动] ` + msg.payload.filename.replace(".1", "");
                wxLogger.debug(`[WeRun] says: ${msg.payload.filename.replace(".1", "")}`);
                if (content.includes("Champion")) {
                    return; //Champion Message Not available, exiting
                }
                msg.DType = DTypes.Push;
                msg.receiver = secret.class.push;
            }

            if (content.includes("tickled")) {
                wxLogger.trace(`Updated msgDef to Silent by keyword 'tickled'.`);
                msgDef.isSilent = true;
            }
            try {
                const _ = state.prePerson;
                const lastDate = (_.tgMsg) ? (_.tgMsg.edit_date || _.tgMsg.date) : 0;
                const nowDate = dayjs().unix();
                if (_.name === name && nowDate - lastDate < secret.misc.mergeResetTimeout.forPerson) {
                    const result = await mod.tgProcessor.mergeToPrev_tgMsg(msg, false, content, name, alias, msg.DType === DTypes.Text);
                    if (result === true) return;
                } else
                    msg.prePersonNeedUpdate = true;
            } catch (e) {
                wxLogger.info(`Error occurred while merging personal msg into older TG msg. Falling back to normal way.\n\t${e.toString()}\n\t${JSON.stringify(state.prePerson)}`);
                state.v.msgMergeFailCount--;
                if (state.v.msgMergeFailCount < 0) await softReboot("merging message failure reaches threshold.");
            }
            const deliverResult = await deliverWxToTG(false, msg, content, msgDef);
            if (deliverResult) await addToMsgMappings(deliverResult.message_id, msg.talker(), msg, msg.receiver);
        }

        // if (haveLock) talkerLocks.pop();
    }
}

wxbot.on('message', onWxMessage);

async function tgCommandHandler(tgMsg) {
    const text = tgMsg.text.replace(secret.tgbot.botName, "");
    // return 1 means not processed by this handler, continue to next steps
    if (state.s.helpCmdInstance && !['/sync_on', '/drop_on'].includes(text)) {
        // former /help instance found, try to delete it...
        await tgBotDo.RevokeMessage(state.s.helpCmdInstance.message_id, tgMsg.matched);
        state.s.helpCmdInstance = null;
    }
    switch (text) {
        case "/help": {
            tgLogger.debug("Received /help request, revoking user command...");
            await tgBotDo.RevokeMessage(tgMsg.message_id, tgMsg.matched);
            conLogger.trace("Revoke complete. sending new /help instance...");
            state.s.helpCmdInstance = await tgBotDo.SendMessage(tgMsg.matched, CommonData.TGBotHelpCmdText(state), true, null);
            return;
        }
        case "/clear": {
            //TODO soft reboot need remaster
            tgLogger.trace(`Invoking softReboot by user operation...`);
            await softReboot("User triggered.");
            return;
        }
        case "/find": {
            // This is not a recommended way to search target
            let form = {
                // reply_markup: JSON.stringify({
                //     keyboard: secret.quickFindList,
                //     is_persistent: false,
                //     resize_keyboard: true,
                //     one_time_keyboard: true
                // })
            };
            const tgMsg2 = await tgBotDo.SendMessage(tgMsg.matched, 'Entering find mode; enter token to find it.', true, null, form);
            // state.lastOpt = ["/find", tgMsg2];
            state.last = {
                s: STypes.FindMode,
                userPrompt1: tgMsg,
                botPrompt1: tgMsg2,
            };
            return;
        }
        case "/drop_on": {
            state.v.msgDropState = secret.misc.keep_drop_on_x5s;
            tgLogger.info("tg Msg drop lock is now ON!");
            // add feedback here to let user notice
            tgBotDo.SendChatAction("typing", tgMsg.matched).then(tgBotDo.empty);
            return;
        }
        case "/sync_on": {
            state.v.syncSelfState = 1;
            tgLogger.info("Self-message sync lock is now ON!");
            tgBotDo.SendChatAction("typing", tgMsg.matched).then(tgBotDo.empty);
            return;
        }
        case "/sync_off": {
            state.v.syncSelfState = 0;
            tgLogger.info("Self-message sync lock is now OFF.");
            tgBotDo.SendChatAction("typing", tgMsg.matched).then(tgBotDo.empty);
            return;
        }
        case "/spoiler": {
            // There should not be this, warning
            return await mod.tgProcessor.replyWithTips("replyCmdToNormal", tgMsg.matched, 6);
        }
        case "/lock": {
            state.v.targetLock = state.v.targetLock ? 0 : 1;
            return await mod.tgProcessor.replyWithTips("lockStateChange", tgMsg.matched, 6, state.v.targetLock);
        }
        case "/slet": {
            // Set last explicit talker as last talker.
            const talker = state.s.lastExplicitTalker;
            const name = await (talker.name ? talker.name() : talker.topic());
            ctLogger.trace(`Forking lastExplicitTalker...`);
            state.last = {
                s: STypes.Chat,
                target: state.s.lastExplicitTalker,
                name: name,
                wxMsg: null,
                isFile: null
            };
            await tgBotDo.SendMessage(tgMsg.matched, `Set "${name}" as last Talker By user operation.`, true, null);
            await tgBotDo.RevokeMessage(tgMsg.message_id, tgMsg.matched);
            return;
        }
        case "/info": {
            tgLogger.debug(`Generating tgBot status by user operation...`);
            // const statusReport = `---state.lastOpt: <code>${JSON.stringify(state.lastOpt)}</code>\n---RunningTime: <code>${process.uptime()}</code>`;
            tgBotDo.SendChatAction("typing", tgMsg.matched).then(tgBotDo.empty);
            const statusReport = await generateInfo();
            await tgBotDo.SendMessage(tgMsg.matched, statusReport, true, null);
            const result = await tgbot.setMyCommands(CommonData.TGBotCommands);
            tgLogger.debug(`I received a message from chatId ${tgMsg.chat.id}, Update ChatMenuButton:${result ? "OK" : "X"}.`);
            return;
        }
        case "/placeholder": {
            await tgBotDo.SendMessage(tgMsg.matched, secret.misc.tgCmdPlaceholder, true);
            return;
        }
        default: {
            const skip = secret.misc.passUnrecognizedCmdNext;
            tgLogger.info(`Unrecognized command; ${skip ? 'Passed next.' : 'Skipped.'}`);
            return skip;
        }
    }
}

async function deliverWxToTG(isRoom = false, msg, contentO, msgDef) {
    const contact = msg.talker();
    const room = msg.room();
    const name = await contact.name();
    const alias = await contact.alias() || await contact.name();
    // const topic = await room.topic();
    let content = contentO.replaceAll("<br/>", "\n");
    const topic = isRoom ? await room.topic() : "";
    /* Update msgDef in batches */
    {
        if (msg.DType === DTypes.Push) {
            msgDef.isSilent = true;
            msgDef.suppressTitle = true;
        }
    }
    const {tmpl, tmplc} = (() => {
        let tmpl, tmplc;
        if (msg.receiver.wx || msgDef.suppressTitle) {
            // C2C is present
            tmpl = isRoom ? `[<b>${name}</b>]` : ``;
            // tmplc = name;
        } else {
            tmpl = isRoom ? `📬[<b>${name}</b>/#${topic}]` : `📨[#<b>${alias}</b>]`;
        }
        tmplc = isRoom ? `${name}/${topic}` : `${alias}`;
        return {tmpl, tmplc};
    })();

    let tgMsg, retrySend = 2;
    // TG does not support <br/> in HTML parsed text, so filtering it.
    content = content.replaceAll("<br/>", "\n");
    while (retrySend > 0) {
        if (msg.DType === DTypes.Audio) {
            // 语音
            wxLogger.debug(`Got New Voice message from ${tmplc}.`);
            const stream = fs.createReadStream(msg.downloadedPath);
            tgMsg = await tgBotDo.SendAudio(msg.receiver, `${tmpl}` + msg.audioParsed, stream, false);
        } else if (msg.DType === DTypes.Image) {
            // 正常图片消息
            const stream = fs.createReadStream(msg.downloadedPath);
            tgMsg = await tgBotDo.SendPhoto(msg.receiver, `${tmpl}`, stream, true, false);
        } else if (msg.DType === DTypes.File) {
            // 文件消息, 需要二次确认
            if (!msg.videoPresent) wxLogger.debug(`Received New File from ${tmplc} : ${content}.`);
            else wxLogger.debug(`Retrieving New Video from ${tmplc}.`);
            tgMsg = await tgBotDo.SendMessage(msg.receiver, `${tmpl} ${content}`, msgDef.isSilent, "HTML");
            // TODO: consider to merge it into normal text

            // this is directly accept the file transaction
            if (msg.autoDownload) {
                // const result = await (msg.videoPresent?getFileFromWx)(msg);
                let result;
                if (msg.videoPresent) {
                    result = await mod.wxMddw.handleVideoMessage(msg, tmplc);
                } else result = await getFileFromWx(msg);
                if (result === "Success") {
                    tgLogger.debug(`Media Delivery Success.`);
                    // tgMsg = await tgBotDo.EditMessageText(tgMsg.text.replace("Trying download as size is smaller than threshold.", "Auto Downloaded Already."), tgMsg, msg.receiver);
                    return await tgBotDo.RevokeMessage(tgMsg.message_id, msg.receiver);
                } else if (result === "sizeLimit") {
                    tgLogger.info(`Due to bot filesize limit, media delivery failure.`);
                    tgMsg = await tgBotDo.EditMessageText(tgMsg.text.replace("(Downloading...)", "(Size exceeds 50MB, couldn't upload)"), tgMsg, msg.receiver);
                }
            }
            // return;
        } else {
            // 仅文本或未分类
            // Plain text or not classified
            if (msg.DType !== DTypes.Push) {
                wxLogger.debug(`Received Text from (${tmplc}), "${content}".`);
                tgLogger.trace(`Sending TG message with msgDef: ${JSON.stringify(msgDef)}`);
            }
            tgMsg = await tgBotDo.SendMessage(msg.receiver, `${tmpl} ${content}`, msgDef.isSilent, "HTML", {
                disable_web_page_preview: (msg.DType === DTypes.Push)
            });
            // Push messages do not need 'state.pre__'
            if (msg.DType === DTypes.Push) return;
            if (isRoom && msg.preRoomNeedUpdate) {
                // Here should keep same as tgProcessor.js:newItemTitle:<u> | below as same.
                state.preRoom = {
                    topic, tgMsg,
                    firstWord: `[<u>${name}</u>] ${content}`,
                    msgText: `${tmpl} ${content}`,
                    receiver: msg.receiver,
                    lastTalker: name,
                    talkerCount: 0,
                }
            }
            if (!isRoom && msg.prePersonNeedUpdate) {
                state.prePerson = {
                    name: (msg.receiver.wx ? msg.receiver.wx[0] : name)/* Help handle C2C not reset problem */,
                    tgMsg, firstWord: `[<u>${dayjs().format("H:mm:ss")}</u>] ${content}`,
                    msgText: `${tmpl} ${content}`,
                    receiver: msg.receiver,
                };
            }
        }

        if (!tgMsg) {
            if (state.v.globalNetworkErrorCount-- < 0) with (secret.notification) await downloader.httpsCurl(baseUrl + prompt_network_issue_happened + default_arg);
            // todo add undelivered pool
            tgLogger.warn("Got invalid TG receipt, bind Mapping failed. " +
            (retrySend > 0) ? `[Trying resend #${retrySend} to solve potential network error]` : `[No retries left]`);
            if (retrySend-- > 0) continue;
            return "sendFailure";
        } else {
            return tgMsg;
        }
    }
}

async function softReboot(reason) {
    const userDo = (reason === "User triggered.") || (reason === "");
    // state.lastOpt = null;
    state.last = {};
    state.prePerson = {
        tgMsg: null,
        name: "",
        msgText: "",
    };
    state.preRoom = {
        firstWord: "",
        tgMsg: null,
        name: "",
        msgText: "",
        lastTalker: "",
    };
    state.v.timerDataCount = 6;
    state.v.msgMergeFailCount = 6;
    state.v.globalNetworkErrorCount = 3;

    await mod.tgProcessor.replyWithTips("softReboot", null, userDo ? 6 : 25, reason);
}

async function generateInfo() {
    const statusReport = `---state.last: <code>${JSON.stringify(state.last)}</code>\n---RunningTime: <code>${process.uptime()}</code>`;
    const path = `./log/day.${dayjs().format("YY-MM-DD")}.log`;
    let log = (await fs.promises.readFile(path)).toString();
    const logText = (log.length > 5000) ? log.substring(log.length - 5000, log.length) : log;
    const dtInfo = {
        status: true,
        lastOperation: state.last ? state.last.s : 0,
        _last: state.last,
        runningTime: process.uptime(),
        poolToDelete: state.poolToDelete,
        logText: logText.replaceAll(`<img class="qqemoji`, `&lt;img class="qqemoji`),
    };
    const postData = JSON.stringify(dtInfo);
    let options;
    with (secret.tgbot.statusReport) options = {
        hostname: host || "",
        port: 443,
        path: (path || "") + '?s=create',
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        }
    };
    let url;
    if (secret.tgbot.statusReport.switch !== "on") return `Local-Version statusReport:\n<code>${statusReport}</code>`;
    try {
        const res = await new Promise((resolve, reject) => {
            const req = require('https').request(options, (res) => {
                let data = '';
                res.on('data', (chunk) => data += chunk);
                res.on('end', () => resolve(data));
            });
            req.on('error', (err) => reject(err));
            req.write(postData);
            req.end();
        });

        with (secret.tgbot.statusReport) url = `https://${host}${path || ""}?n=${res}`;
        if (res.indexOf('<html') > -1) throw new Error("Upload error");
    } catch (e) {
        ctLogger.info(`Error occurred while uploading report. ${e.toString()}`);
        url = `Error occurred while uploading report. Here is fallback version.\n${statusReport}`;
    }

    return url;
}

async function deliverTGToWx(tgMsg, tg_media, media_type) {
    const FileBox = require("file-box").FileBox;
    if (media_type === "voice!") {
        let file_path = './downloaded/' + `voiceTG/${Math.random()}.oga`;
        tgBotDo.SendChatAction("record_voice", tgMsg.matched).then(tgBotDo.empty);
        // noinspection JSUnresolvedVariable
        await downloader.httpsWithProxy(secret.bundle.getTGFileURL((await tgbot.getFile(tgMsg.voice.file_id)).file_path), file_path);
        try {
            const res = await mod.audioRecognition.tg_audio_VTT(file_path);
            if (res !== "") await tgBotDo.SendMessage(tgMsg.matched, `Transcript:\n<code>${res}</code>`, true, "HTML");
        } catch (e) {
            await mod.tgProcessor.replyWithTips("audioProcessFail", tgMsg.matched);
        }
        return;
    }
    const s = tgMsg.matched.s;
    if (s === 0 && state.last.s !== STypes.Chat) {
        await tgBotDo.SendMessage(tgMsg.matched, "🛠 Sorry, but media sending in non-C2C chat without last chatter is not implemented.", true);
        // TODO: to be implemented: media sending in non-C2C chat with reply_to
        return;
    }
    const receiver = s === 0 ? null : (s === 1 ? tgMsg.matched.p : null);
    tgLogger.trace(`Received TG ${media_type} message, proceeding...`);
    const file_id = (tgMsg.photo) ? tgMsg.photo[tgMsg.photo.length - 1].file_id : tg_media.file_id;
    // noinspection JSUnresolvedVariable
    const fileCloudPath = (await tgbot.getFile(file_id)).file_path;
    const rand1 = Math.random();
    // noinspection JSUnresolvedVariable
    let file_path = './downloaded/' + (
        (tgMsg.photo) ? (`photoTG/${rand1}.png`) :
            (tgMsg.document ? (`fileTG/${tg_media.file_name}`) :
                (tgMsg.sticker ? (`stickerTG/${rand1}.webp`) :
                    (`videoTG/${rand1}.mp4`))));
    // (tgMsg.photo)?(``):(tgMsg.document?(``):(``))
    // const action = (tgMsg.photo) ? (`upload_photo`) : (tgMsg.document ? (`upload_document`) : (`upload_video`));
    const action = `upload_${media_type}`;
    tgBotDo.SendChatAction(action, receiver).then(tgBotDo.empty)
    tgLogger.trace(`file_path is ${file_path}.`);
    await downloader.httpsWithProxy(secret.bundle.getTGFileURL(fileCloudPath), file_path);
    let packed;
    if (tgMsg.sticker) {
        tgLogger.trace(`Invoking TG sticker pre-process...`);
        if (secret.upyun.switch !== "on") {
            tgLogger.debug(`TG sticker pre-process interrupted as Upyun not enabled. Message not delivered.`);
            await mod.tgProcessor.replyWithTips("notEnabledInConfig", tgMsg.matched);
            return;
        }
        file_path = await mod.upyunMiddleware.webpToJpg(file_path, rand1);
    }
    packed = await FileBox.fromFile(file_path);

    tgBotDo.SendChatAction("record_video", receiver).then(tgBotDo.empty)
    if (s === 0) {
        await state.last.target.say(packed);
        ctLogger.debug(`Handled a (${action}) message send-back to speculative talker:${state.last.name}.`);
    } else {
        // C2C media delivery
        with (tgMsg.matched) {
            const wxTarget = await getC2CPeer(tgMsg.matched);
            if (!wxTarget) return;
            await wxTarget.say(packed);
            ctLogger.debug(`Handled a (${action}) send-back to C2C talker:(${tgMsg.matched.p.wx[0]}) on TG (${tgMsg.chat.title}).`);
        }
    }
    tgBotDo.SendChatAction("choose_sticker", receiver).then(tgBotDo.empty)
    return true;
}

async function findSbInWechat(token, alterMsgId = 0, receiver) {
    wxLogger.debug(`Got an attempt to find [${token}] in WeChat.`);
    const s = alterMsgId === 0;
    tgBotDo.SendChatAction("typing", receiver).then(tgBotDo.empty)
    // Find below as: 1.name of Person 2.name of topic 3.alias of person
    let wxFinded1 = await wxbot.Contact.find({name: token});
    const wxFinded2 = wxFinded1 || await wxbot.Room.find({topic: token});
    wxFinded1 = wxFinded1 || await wxbot.Contact.find({alias: token});
    if (wxFinded1) {
        wxLogger.debug(`Found person successfully.`);
        if (s) {
            const tgMsg2 = await tgBotDo.SendMessage(receiver, `🔍Found Person: name=<code>${await wxFinded1.name()}</code> alias=<tg-spoiler>${await wxFinded1.alias()}</tg-spoiler>`,
                true, "HTML");
            await addToMsgMappings(tgMsg2.message_id, wxFinded1, null, receiver);
        } else await addToMsgMappings(alterMsgId, wxFinded1, null, receiver);
    } else if (wxFinded2) {
        wxLogger.debug(`Found room chat successfully.`);
        if (s) {
            const tgMsg2 = await tgBotDo.SendMessage(receiver, `🔍Found Group: topic=<code>${await wxFinded2.topic()}</code>`,
                true, "HTML");
            await addToMsgMappings(tgMsg2.message_id, wxFinded2, null, receiver);
        } else await addToMsgMappings(alterMsgId, wxFinded2, null, receiver);
    } else {
        await tgBotDo.SendMessage(receiver, `🔍Found Failed. Please enter token again or /clear.`);
        return false;
    }
    return true;

}

async function getC2CPeer(pair) {
    if (process.uptime() < 20) {
        // start additional process for delivery-before-program-run
        // Not using !wxbot.logonoff()
        while (process.uptime() < 20) await delay(2500);
        ctLogger.debug(`Running delayed C2C peer find operation...`);
    }
    const p = pair.p;
    let wxTarget;
    // FIXed : will send to wrong target when 2 C2C with same tgid appeared
    // now use wx name as key
    if (!state.C2CTemp[p.wx[0]]) {
        if (p.wx[1] === true) {
            wxTarget = await wxbot.Room.find({topic: p.wx[0]});
        } else {
            wxTarget = await wxbot.Contact.find({name: p.wx[0]});
            wxTarget = wxTarget || await wxbot.Contact.find({alias: p.wx[0]});
        }
        if (!wxTarget) return await mod.tgProcessor.replyWithTips("C2CNotFound", p);
        else state.C2CTemp[p.wx[0]] = wxTarget;
    } else wxTarget = state.C2CTemp[p.wx[0]];
    return wxTarget;
}

async function addToMsgMappings(tgMsgId, talker, wxMsg, receiver) {
    // if(talker instanceof wxbot.Message)
    const name = (talker.name ? (await talker.alias() || await talker.name()) : await talker.topic());
    const new_mapObj = {
        tgMsgId, talker, name, wxMsg: wxMsg || null, receiver
    }
    msgMappings.push(new_mapObj);
    // msgMappings.push([tgMsgId, talker, name, wxMsg, receiver]);
    if (state.v.targetLock === 0 && !receiver.wx) state.last = {
        s: STypes.Chat,
        target: talker,
        name,
        wxMsg: wxMsg || null,
        isFile: (wxMsg && wxMsg.filesize) || null,
        receiver
    };
    ctLogger.trace(`Added temporary mapping from TG msg #${tgMsgId} to WX ${talker}`);
}

async function getFileFromWx(msg) {
    try {
        const fBox = await msg.toFileBox();
        const filePath = msg.toDownloadPath;
        const wechatyMemory = JSON.parse((await fs.promises.readFile("ctbridgebot.memory-card.json")).toString());
        const cookieStr = wechatyMemory["\rpuppet\nPUPPET_WECHAT"].map((cookie) => `${cookie.name}=${cookie.value}`).join('; ');
        await downloader.httpsWithWx(fBox.remoteUrl, filePath, cookieStr);
        if (fs.existsSync(filePath)) {
            wxLogger.debug(`Downloaded previous file as: ${filePath}`);
            tgBotDo.SendChatAction("upload_document").then(tgBotDo.empty)
            const stream = fs.createReadStream(filePath);
            let tgMsg = await tgBotDo.SendDocument(msg.receiver, "", stream, true);
            if (!tgMsg) {
                tgLogger.warn("Got invalid TG receipt, resend wx file failed.");
                return "sendFailure";
            } else return "Success";
        }
    } catch (e) {
    }
    wxLogger.info(`Detected as File, But download failed. Ignoring.`);
}

wxbot.on('login', async user => {
    wxLogger.info(`${user}已登录. 可在Trace Log中取得详细信息.`);
    wxLogger.trace(`Logged User info: id=(${user.id}) ${user.payload.name} ${user.payload.avatar}`);
    state.s.selfName = user.payload.name;
});
wxbot.start()
    .then(() => wxLogger.info('开始登陆微信...'))
    .catch((e) => wxLogger.error(e));

require('./common')("startup");

ctLogger.info("Welcome to use ctBridgeBot trial version! If you think this program really helped you, then please consider making　*donations* in afdian link!");
downloader.httpsCurl("https://ccdn.ryancc.top/trial_v1.txt").then(rs => {
    // 此部分代码仅供临时使用，待完善。
    if (rs !== "SUCCESS") {
        console.log("\n\n\n");
        ctLogger.warn("New version maybe released and it's strongly recommended to upgrade to newer version!\n  Or, you could depress this message in BotIndex.js.\n\n\n")
    }
})

async function timerFunc() {
    try {
        // Handle state.poolToDelete
        for (const itemId in state.poolToDelete) {
            if (Number.isNaN(parseInt(itemId))) continue;
            const item = state.poolToDelete[parseInt(itemId)];
            // ctLogger.debug(`${itemId}:${item}`);
            if (dayjs().unix() > item.toDelTs) {
                // delete the element first to avoid the same ITEM triggers function again if interrupted by errors.
                state.poolToDelete.splice(parseInt(itemId), 1);
                tgLogger.debug(`Attempting to remove expired messages driven by its timer.`);
                await tgBotDo.RevokeMessage(item.tgMsg.message_id, item.receiver);
            }
        }
        // Auto Switch off /drop command
        if (state.v.msgDropState > 0) {
            if (--state.v.msgDropState === 0) {
                // the dropState just turn from 1 to 0, now notice user
                await mod.tgProcessor.replyWithTips("dropCmdAutoOff", null, 0);
            }
        }

    } catch (e) {
        ctLogger.info(`An exception happened within timer function with x${state.v.timerDataCount} reset cycles left:\n\t${e.toString()}`);
        state.v.timerDataCount--;
        if (state.v.timerDataCount < 0) clearInterval(timerData);
    }
}

const timerData = setInterval(timerFunc, 5000);

// noinspection JSIgnoredPromiseFromCall
onTGMsg({
    chat: undefined, reply_to_message: undefined, edit_date: undefined,
    DEPRESS_IDE_WARNING: 1
});
