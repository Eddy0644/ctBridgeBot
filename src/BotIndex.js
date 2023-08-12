// Note that ES module loaded in cjs usually have extra closure like require("file-box").FileBox, remind!
// noinspection DuplicatedCode

const secret = require('../config/confLoader');
const FileBox = require("file-box").FileBox;
const fs = require("fs");
const dayjs = require('dayjs');
const DataStorage = require('./dataStorage.api');
const stickerLib = new DataStorage("./sticker_v2.json");
const {
    wxLogger, tgLogger, ctLogger, LogWxMsg, conLogger,
    CommonData, STypes, downloader, processor,
} = require('./common')();

let msgMappings = [];
let tgDisabled = 0;
const state = {
    last: {},
    lastExplicitTalker: null,
    lockTarget: 0,
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
const {wxbot, DTypes} = require('./wxbot-pre')(tgbot, wxLogger);

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
    if (tgMsg.text && tgMsg.text === "/enable" && tgDisabled) {
        tgDisabled = 0;
        tgLogger.info("tgDisable lock is now OFF.");
        return;
    } else if (tgDisabled) {
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
                        if (tgMsg.reply_to_message) {
                            return pair.threadId === tgMsg.reply_to_message.message_id;
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

        if (tgMsg.photo) return await deliverTGToWx(tgMsg, tgMsg.photo, "photo");
        if (tgMsg.sticker) return await deliverTGToWx(tgMsg, tgMsg.sticker.thumbnail, "photo");
        if (tgMsg.document) return await deliverTGToWx(tgMsg, tgMsg.document, "document");
        if (tgMsg.video) return await deliverTGToWx(tgMsg, tgMsg.video, "video");
        if (tgMsg.voice) return await deliverTGToWx(tgMsg, tgMsg.voice, "voice!");

        // Non-text messages must be filtered ahead of below !---------------
        if (!tgMsg.text) {
            tgLogger.info(`A TG message with empty text has passed through text Processor. Skipped.`);
            tgLogger.trace(`The detail of tgMsg which caused error: `, JSON.stringify(tgMsg));
            return;
        }

        for (const pair of secret.filtering.tgContentReplaceList) {
            if (tgMsg.text.includes(pair[0])) {
                tgLogger.trace(`Replacing pattern '${pair[0]}' to '${pair[1]}'.`);
                tgMsg.text = tgMsg.text.replaceAll(pair[0], pair[1]);
            }
        }

        if (tgMsg.reply_to_message) {
            // TODO refactor this area
            if (tgMsg.text === "/spoiler") {
                // TG-wide command so not put inside the for loop
                const orig = tgMsg.reply_to_message;
                if (orig.photo) {
                    const file_id = orig.photo[orig.photo.length - 1].file_id;
                    const res = await tgBotDo.EditMessageMedia(file_id, orig, true);
                    if (res !== true) {
                        const tgMsg2 = await tgBotDo.SendMessage(tgMsg.matched, `Error occurred while setting spoiler for former message :\n<code>${res}</code> `, true, "HTML");
                        state.poolToDelete.add(tgMsg2, 6, tgMsg.matched);
                    }
                }//todo else is text
                return;
            }
            tgLogger.trace(`This message has reply flag, searching for mapping...`);
            let success = 0;
            for (const mapPair of msgMappings) {
                if (mapPair[0] === tgMsg.reply_to_message.message_id/*fixme also verify chat_id here*/ && mod.tgProcessor.isSameTGTarget(mapPair[4], tgMsg.matched)) {
                    if ((tgMsg.text === "ok" || tgMsg.text === "OK") && mapPair[3] && mapPair[3].filesize) {
                        // 对wx文件消息做出了确认
                        if (await getFileFromWx(mapPair[3])) wxLogger.debug(`Download request of wx File completed.`);
                        return tgBotDo.SendChatAction("upload_document");
                    }
                    if (tgMsg.text === "@") {
                        // Trigger special operation: Lock and set as explicit
                        state.lockTarget = 2;
                        const name = mapPair[2], talker = mapPair[1];
                        state.last = {
                            s: STypes.Chat,
                            target: talker,
                            name: name,
                            wxMsg: null,
                            isFile: null
                        };
                        ctLogger.debug(`Upon '@' msg, set '${name}' as last talker and lock-target to 2.`);
                        const tgMsg2 = await tgBotDo.SendMessage(tgMsg.matched, `Already set '${name}' as last talker and locked.`, true);
                        state.poolToDelete.add(tgMsg2, 6, tgMsg.matched);
                    } else {
                        if (tgMsg.matched.s === 0) {
                            if (state.lockTarget === 2) {
                                state.lockTarget = 0;
                                ctLogger.debug(`After lock=2, a quoted message reset lock=0.`);
                            }
                            state.lastExplicitTalker = mapPair[1];
                            await mapPair[1].say(tgMsg.text);
                            if (mapPair[2] === state.preRoom.topic) {
                                // the explicit talker - Room matches preRoom
                                await mod.tgProcessor.addSelfReplyTs();
                            }
                            tgBotDo.SendChatAction("choose_sticker", tgMsg.matched).then(tgBotDo.empty)
                            ctLogger.debug(`Handled a message send-back to ${mapPair[2]}.`);
                            return;
                        } else {
                            ctLogger.info(`In C2C chat found a message with reply flag which is not OK or @. Sending...`);
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
            wxLogger.debug(`Got an attempt to find [${findToken}] in WeChat.`);
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

    //提前筛选出自己的消息,避免多次下载媒体
    if (room) {
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
                    wxLogger.debug(`来自[${originName}]的消息因名称符合黑名单关键词“${keyword}”，未递送： ${contentSub}`);
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
            if (!ahead) wxLogger.debug(`来自[${topic}]的消息因名称不符合任何白名单关键词，未递送： ${contentSub}`);
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
        content = `[${`${recalledMessage}`.replaceAll("Message#", "")}] was recalled.`;
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
                    if (typeof fetched.msgId === "number") content = secret.misc.titles.stickerWithLink(stickerUrlPrefix, fetched, msg.md5);
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
            const photoPath = `./downloaded/photo/${alias}-${msg.payload.filename}`;
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
        let audioPath = `./downloaded/audio/${dayjs().format("YYYYMMDD-HHmmss").toString()}-(${alias}).mp3`;
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
                content = `🔗 [<a href="${url}">${caption}</a>]`;
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

        // 筛选出公众号等通知消息，归类为Push
        for (const testPair of CommonData.wxPushMsgFilterWord) {
            let s = 0;
            for (const testPairElement of testPair) {
                if (!content.includes(testPairElement)) s = 1;
            }
            if (s === 0) {
                msg.DType = DTypes.Push;
                break;
            }
        }
    }

    // 正式处理消息--------------
    if (msg.DType > 0) {
        const titles = secret.misc.titles;
        if (content.includes("[收到了一个表情，请在手机上查看]") || content.includes("[Send an emoji, view it on mobile]")) {
            msgDef.isSilent = true;
            // Emoji support test: 💠🔖⚗️🧱💿🌁🌠🧩🧊  🔧🕳❎❌ 🗣👥
            content = content.replace("[收到了一个表情，请在手机上查看]", titles.unsupportedSticker).replace("[Send an emoji, view it on mobile]", titles.unsupportedSticker);
            wxLogger.trace(`Updated msgDef to Silent by keyword '收到了表情'.`);
        }
        if (content.includes("[收到一条视频/语音聊天消息，请在手机上查看]")) {
            content = content.replace("[收到一条视频/语音聊天消息，请在手机上查看]", titles.recvCall);
            if (await downloader.httpsCurl(secret.notification.incoming_call_webhook(alias)) !== "SUCCESS") {
                // here means no valid notification hook is set
            } else {
                msgDef.isSilent = true;
                // give a silent delivery for this message
            }
            wxLogger.debug(`Sending call notification from (${alias}) to User.`);
        }

        content = content.replace("[收到一条微信转账消息，请在手机上查看]", titles.recvTransfer);
        content = content.replace("[收到一条暂不支持的消息类型，请在手机上查看]", titles.msgTypeNotSupported);

        content = mod.tgProcessor.filterMsgText(content);

        for (const pair of secret.filtering.wxContentReplaceList) {
            if (content.includes(pair[0])) {
                wxLogger.trace(`Replaced wx (${pair[0]}) to (${pair[1]})`);
                while (content.includes(pair[0])) content = content.replace(pair[0], pair[1]);
            }
        }

        if (room) {
            // 是群消息 - - - - - - - -

            // 群系统消息设为静音
            if (name === topic) {
                // Did system message have any impact on me? No. So silent them.
                msgDef.isSilent = true;
                msgDef.forceMerge = true;
                // Force override {name} to let system message seems better
                name = titles.systemMsgInRoom;
            }

            try {
                if (processor.isPreRoomValid(state.preRoom, topic, msgDef.forceMerge, secret.misc.mergeResetTimeout.forGroup)) {
                    const result = await mod.tgProcessor.mergeToPrev_tgMsg(msg, true, content, name, msg.DType === DTypes.Text);
                    if (result === true) return;
                } else msg.preRoomNeedUpdate = true;
            } catch (e) {
                wxLogger.info(`Error occurred while merging room msg into older TG msg. Falling back to normal way.\n\t${e.toString()}\n\t${JSON.stringify(state.preRoom)}`);
                msgMergeFailCount--;
                if (msgMergeFailCount < 0) await softReboot("merging message failure reaches threshold.");
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
                    const result = await mod.tgProcessor.mergeToPrev_tgMsg(msg, false, content, name, msg.DType === DTypes.Text);
                    if (result === true) return;
                } else
                    msg.prePersonNeedUpdate = true;
            } catch (e) {
                wxLogger.info(`Error occurred while merging personal msg into older TG msg. Falling back to normal way.\n\t${e.toString()}\n\t${JSON.stringify(state.prePerson)}`);
                msgMergeFailCount--;
                if (msgMergeFailCount < 0) await softReboot("merging message failure reaches threshold.");
            }
            const deliverResult = await deliverWxToTG(false, msg, content, msgDef);
            if (deliverResult) await addToMsgMappings(deliverResult.message_id, msg.talker(), msg, msg.receiver);
        }

        // if (haveLock) talkerLocks.pop();
    }
}

wxbot.on('message', onWxMessage);

async function tgCommandHandler(tgMsg) {
    // return 1 means not processed by this handler, continue to next steps
    switch (tgMsg.text.replace(secret.tgbot.botName, "")) {
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
        case "/disable": {
            tgDisabled = 1;
            tgLogger.info("tgDisable lock is now ON!");
            // add feedback here to let user notice
            tgBotDo.SendChatAction("typing", tgMsg.matched).then(tgBotDo.empty);
            return;
        }
        case "/spoiler": {
            // There should not be this, warning
            return await mod.tgProcessor.replyWithTips("replyCmdToNormal", tgMsg.matched, 6);
        }
        case "/lock": {
            state.lockTarget = state.lockTarget ? 0 : 1;
            return await mod.tgProcessor.replyWithTips("lockStateChange", tgMsg.matched, 6, state.lockTarget);
        }
        case "/help": {
            //TODO save stat to memory; recall the former msg when command executed
            const tgMsg2 = await tgBotDo.SendMessage(tgMsg.matched, CommonData.TGBotHelpCmdText, true, null);
            return;
        }
        case "/slet": {
            // Set last explicit talker as last talker.
            const talker = state.lastExplicitTalker;
            const name = await (talker.name ? talker.name() : talker.topic());
            ctLogger.trace(`Forking lastExplicitTalker...`);
            state.last = {
                s: STypes.Chat,
                target: state.lastExplicitTalker,
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
                    result = await mod.wxMddw.handleVideoMessage(msg, alias);
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
                wxLogger.debug(`Received Text from (${tmplc}).`);
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
                    name, tgMsg,
                    firstWord: `[<u>${dayjs().format("H:mm:ss")}</u>] ${content}`,
                    msgText: `${tmpl} ${content}`,
                    receiver: msg.receiver,
                };
            }
        }

        if (!tgMsg) {
            if (globalNetworkErrorCount-- < 0) with (secret.notification) await downloader.httpsCurl(baseUrl + prompt_network_issue_happened + default_arg);
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
    timerDataCount = 6;
    msgMergeFailCount = 6;
    globalNetworkErrorCount = 3;

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

        url = `https://${options.hostname}${secret.tgbot.statusReport[1]}?n=${res}`;
        if (res.indexOf('<html') > -1) throw new Error("Upload error");
    } catch (e) {
        ctLogger.info(`Error occurred while uploading report. ${e.toString()}`);
        url = `Error occurred while uploading report. Here is fallback version.\n${statusReport}`;
    }

    return url;
}

async function deliverTGToWx(tgMsg, tg_media, media_type) {
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
    const s = alterMsgId === 0;
    tgBotDo.SendChatAction("typing", receiver).then(tgBotDo.empty)
    // Find below as: 1.name of Person 2.name of topic 3.alias of person
    let wxFinded1 = await wxbot.Contact.find({name: token});
    const wxFinded2 = wxFinded1 || await wxbot.Room.find({topic: token});
    wxFinded1 = wxFinded1 || await wxbot.Contact.find({alias: token});
    if (wxFinded1) {
        wxLogger.debug(`Found person successfully, sending...(view log for detail)`);
        if (s) {
            const tgMsg2 = await tgBotDo.SendMessage(receiver, `🔍Found Person: name=<code>${await wxFinded1.name()}</code> alias=<tg-spoiler>${await wxFinded1.alias()}</tg-spoiler>`,
                true, "HTML");
            await addToMsgMappings(tgMsg2.message_id, wxFinded1, null, receiver);
        } else await addToMsgMappings(alterMsgId, wxFinded1, null, receiver);
    } else if (wxFinded2) {
        wxLogger.debug(`Found person successfully, sending...(view log for detail)`);
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
    //TODO check if bot is online
    const p = pair.p;
    let wxTarget;
    if (!state.C2CTemp[p.tgid]) {
        if (p.wx[1] === true) {
            wxTarget = await wxbot.Room.find({topic: p.wx[0]});
        } else {
            wxTarget = await wxbot.Contact.find({name: p.wx[0]});
            wxTarget = wxTarget || await wxbot.Contact.find({alias: p.wx[0]});
        }
        if (!wxTarget) return await mod.tgProcessor.replyWithTips("C2CNotFound", p);
        else state.C2CTemp[p.tgid] = wxTarget;
    } else wxTarget = state.C2CTemp[p.tgid];
    return wxTarget;
}

async function addToMsgMappings(tgMsgId, talker, wxMsg, receiver) {
    // if(talker instanceof wxbot.Message)
    const name = (talker.name ? (await talker.alias() || await talker.name()) : await talker.topic());
    msgMappings.push([tgMsgId, talker, name, wxMsg, receiver]);
    if (state.lockTarget === 0 && !receiver.wx) state.last = {
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
            let tgMsg = await tgBotDo.SendDocument(msg.receiver, "", stream, true, false);
            if (!tgMsg) {
                tgLogger.warn("Got invalid TG receipt, resend wx file failed.");
                return "sendFailure";
            } else return "Success";
        } else {
            wxLogger.info(`Detected as File, But download failed. Ignoring.`);
        }
    } catch (e) {
        wxLogger.info(`Detected as File, But download failed. Ignoring.`);
    }
}

wxbot.on('login', async user => {
    wxLogger.info(`${user}已登录.`);
});
wxbot.start()
    .then(() => wxLogger.info('开始登陆微信...'))
    .catch((e) => wxLogger.error(e));

require('./common')("startup");

const timerData = setInterval(async () => {
    try {
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
    } catch (e) {
        ctLogger.info(`An exception happened within timer function with x${timerDataCount} reset cycles left:\n\t${e.toString()}`);
        timerDataCount--;
        if (timerDataCount < 0) clearInterval(timerData);
    }
}, 5000);
let timerDataCount = 6;
let msgMergeFailCount = 6;
let globalNetworkErrorCount = 3;

// noinspection JSIgnoredPromiseFromCall
onTGMsg({
    chat: undefined, reply_to_message: undefined, edit_date: undefined,
    DEPRESS_IDE_WARNING: 1
});
