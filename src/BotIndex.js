// Note that ES module loaded in cjs usually have extra closure like require("file-box").FileBox, remind!
// noinspection DuplicatedCode

const secret = require('../config/confLoader');
const fs = require("fs");
const dayjs = require('dayjs');
const DataStorage = require('./dataStorage.api');
const wx_emoji_conversions = require("../config/wx-emoji-map");
const stickerLib = new DataStorage("./data/sticker_l4.json");
const {
    wxLogger, tgLogger, ctLogger, LogWxMsg, conLogger, errorLog,
    CommonData, STypes, downloader, processor, delay
} = require('./common')();
//
const msgMappings = [];
const state = {
    v: { // variables
        msgDropState: 0,
        syncSelfState: 0,
        targetLock: 0,
        timerData: [6, 3, 0, 0], // 0~1: fails countdown; 2~3: setInterval ID.
        msgMergeFailCount: 6,
        globalNetworkErrorCount: 3,
        wxStat: {
            MsgTotal: 0,
            // Add counter on wx Message Total number, and reflect when encounter wx error;
            // because every time boot will load history messages, so no need for persistence
            puppetDoneInitTime: 0,
            notSelfTotal: 0,
            // wx Message count that excluded self messages.
        },
        extra: 250,
        keepalive: {
            msgCounter_prev: 0,
            idle_start_ts: 0,
            state: 0,
            last_resume_ts: 0,
        }
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
        stat: {
            "tsStarted": 0,
            "mediaCount": 0,
            "messageCount": 0,
        },
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
const {tgbot, tgBotDo} = require('./init-tg');
// const {FileBox} = require("file-box");
const {basename} = require("node:path");
const {wxbot, DTypes} = require('./init-wx')(tgBotDo, wxLogger);

// Loading instance modules...
const env = {
    state, tgBotDo, tgLogger, defLogger: ctLogger, wxLogger, secret, wxbot, processor, mod: {}
};
const mod = {
    // autoRespond: require('./autoResponder')(env),
    upyunMiddleware: require('./upyunMiddleware')(env),
    audioRecognition: require('./audioRecognition')(env),
    wxMddw: require('./wxMddw')(env),
    tgProcessor: require('./tgProcessor')(env),
    keepalive: require('./m_keepalive')(env),
}
env.mod = mod;

// End of loading instance modules...

async function onTGMsg(tgMsg) {
    if (tgMsg.DEPRESS_IDE_WARNING) return;
    if (tgMsg.text && ["/drop_off", "/drop_toggle"].includes(tgMsg.text.replace(secret.tgbot.botName, "")) && state.v.msgDropState) {
        // Verified as /drop_off command
        state.v.msgDropState = 0;
        tgLogger.info("tg Msg drop lock is now OFF.");
        if (state.s.helpCmdInstance) {
            // former /help instance found, try to delete it...
            await tgBotDo.RevokeMessage(state.s.helpCmdInstance[0].message_id, state.s.helpCmdInstance[1]);
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
            let timerLabel;
            if (secret.misc.debug_add_console_timers) {
                timerLabel = `tgMsg origin dispatcher - Debug timer #${process.uptime().toFixed(2)}`;
                console.time(timerLabel);
            }
            const thread_verify = function (pair) {
                if (pair.threadId) {
                    if (tgMsg.message_thread_id) {
                        return pair.threadId === tgMsg.message_thread_id;
                    } else return false;
                } else return true;
            };
            for (const pair of C2C) {
                // thread_id verification without reply-to support
                if (tgMsg.chat.id === pair.tgid && thread_verify(pair)) {
                    // match this C2C pair
                    tgMsg.matched = {s: 1, p: pair};
                    tgLogger.trace(`Message from C2C group: ${pair.tgid}, setting message default target to wx(${pair.wx[0]})`);
                    if (pair.opts.mixed &&
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
                if (repl && (repl.animation || repl.document) && /#sticker ([0-9,a-f]{4})/.test(repl.caption)) {
                    // Is almost same origin as sticker channel and is reply to a sticker
                    // Ready to modify sticker's hint
                    const matched = repl.caption.match(/#sticker ([0-9,a-f]{4})/), md5 = matched[1];
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
            if (timerLabel) console.timeEnd(timerLabel);
        }

        if (tgMsg.matched.s === 1 && tgMsg.matched.p.opts.onlyReceive) {
            // onlyReceive is on, ignoring this message!
            tgLogger.debug(`A TG message from (${tgMsg.chat.title}) is skipped due to C2C.onlyReceive is active.`);
            return;
        }
        { // **Sub:** replaceWXCustomEmojis
            let newText = tgMsg.text;
            if (typeof tgMsg.entities === 'object') for (const entity of tgMsg.entities) {
                if (entity.type === "custom_emoji" && wx_emoji_conversions.hasOwnProperty(entity.custom_emoji_id)) {
                    if (`ourhardworkbythesewordsguardedpleasedontsteal(c)`.charCodeAt(state.v.extra % 10) * 514 % 3 !== 0) {
                        conLogger.trace(`Since you are a Telegram Premium user who purchased to Durov and can send custom emoji on TG, why not donate the author? ` +
                          `The WX emoji conversion function will be enabled upon donation, or come to the code and bypass my limit manually T_T.`)
                    } else {
                        // Get the []-wrapped text for this custom emoji
                        const wrappedText = wx_emoji_conversions[entity.custom_emoji_id];
                        // Get the ordinary emoji from the text
                        const emoji = tgMsg.text.substring(entity.offset, entity.offset + entity.length);
                        // Replace the ordinary emoji with the []-wrapped text
                        newText = newText.replace(emoji, wrappedText);
                    }
                }
            }
            tgMsg.text = newText;
        } // End Sub: replaceWXCustomEmojis

        if (tgMsg.photo) return await deliverTGToWx(tgMsg, tgMsg.photo, "photo");
        if (tgMsg.sticker) {
            // We want to enable video_sticker.webm full support here, but almost all libraries require ffmpeg,
            // which is difficult to implement now. TODO webm conversion here
            const timerLabel1 = (!secret.misc.debug_add_console_timers) ? "" : `Sticker delivery from tg to wx | #${process.uptime().toFixed(2)} used`;
            if (timerLabel1) console.time(timerLabel1);
            await deliverTGToWx(tgMsg, tgMsg.sticker.thumbnail, "photo");
            if (timerLabel1) console.timeEnd(timerLabel1);
            return true;
        }
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
            if (state.s.helpCmdInstance && repl_to.message_id === state.s.helpCmdInstance[0].message_id) {
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
                        if ((await continueDeliverFileFromWx(mapPair.wxMsg)) !== "Success") wxLogger.error(`A download request of wx file failed. Please check your log!`);
                        else if (secret.misc.remove_file_placeholder_msg_after_success) {
                            // Revoking placeholder message and the user-reply "OK" message.
                            await tgBotDo.RevokeMessage(tgMsg.message_id, tgMsg.matched);
                            await tgBotDo.RevokeMessage(repl_to.message_id, tgMsg.matched);
                            tgLogger.debug(`File delivery successful, revoked placeholder message (${tgMsg.message_id}) and user-reply "OK" message (${repl_to.message_id}).`);
                            return;
                        }
                        return; //tgBotDo.SendChatAction("upload_document");
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
                            ctLogger.debug(`TG[Default] DirectReply--> WX(${mapPair.name}): ${tgMsg.text}`);
                            return;
                        } else {
                            ctLogger.debug(`In C2C chat found a message with reply flag which is not 'OK' or '@'. Sending...`);
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
            if (tgMsg.quote?.is_manual) tgMsg.text = secret.c11n.tgTextQuoteAddition(tgMsg.quote.text, tgMsg.text);
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
            //Reference: wxLogger.debug(`📥WX(${tmplc})[Text]-->TG, "${content}".`);📤
            ctLogger.debug(`TG(${tgMsg.chat.title}) 📤[Text]--> WX(${tgMsg.matched.p.wx[0]}): ${tgMsg.text}`);
        } else {
            // No valid COMMAND within msg
            if (Object.keys(state.last).length === 0) {
                // Activate chat & env. set
                await tgbot.sendMessage(tgMsg.chat.id, 'Nothing to do upon your message, ' + tgMsg.chat.id);
                // const result = await tgbot.setMyCommands(CommonData.TGBotCommands);
                tgLogger.debug(`I received a message from chatId ${tgMsg.chat.id}, but done NOTHING.`); // Update ChatMenuButton:${result ? "OK" : "X"}
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
                    await continueDeliverFileFromWx(state.last.wxMsg);
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
        errorLog(tgLogger, `{onTGMsg()}: ${e.message}`, e);
    }
}

tgbot.on('message', onTGMsg);

async function onWxMessage(msg) {
    state.v.wxStat.MsgTotal++;
    // NOTE deprecating DROP part because new puppet do not send old messages now.
    try {
        //基本信息提取-------------
        const contact = msg.talker(); // 发消息人
        let content = msg.text().trim(); // 消息内容
        const room = msg.room(), isGroup = room !== undefined; // 是否是群消息
        let topic = room ? await room.topic() : "";
        if (msg.payload.talkerId?.includes("@openim")) return wxLogger.debug("Dropped a WXWork message (not implemented).");
        let name = await contact.name(), alias = await contact.alias() || name;
        let dname = alias; // [msg.dname]  // Display Name, which will be overwritten with c2c.opts.nameType
        let msgDef = {
            isSilent: false,
            forceMerge: false,
        }

        msg.DType = DTypes.Default;
        {   // Sub: prepare data for LogWxMsg
            msg.log_payload = `Type(${isGroup ? ('G,"' + topic + '"') : 'P)'} from talker [${alias}].`;
            LogWxMsg(msg, 0);
        }

        // 提前drop自己的消息
        // Integrated with misc.wechat_synced_group, check if current group is in the list
        if ((() => {
            let S = msg.self() ? 1 : 0;
            if (state.v.syncSelfState === 1) return 0;
            if (room && secret.misc.wechat_synced_group.includes(topic)) S = 0;
            if (msg.type() === wxbot.Message.Type.Audio && secret.misc.do_not_skip_voice_from_mobile_wx) S = 0;
            return S;
        })()) return;
        state.v.wxStat.notSelfTotal++;
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
            // rewrite dname, with msg.receiver.opts.nameType
            // now only apply to group
            if (isGroup) switch (msg.receiver.opts.nameType) {
                case 2:
                    dname = await room.alias(contact) || alias;
                    break;
                case 0:
                    dname = name;
                    break;
                default:    // 1 or other value
                    dname = alias;
            }
            msg.dname = dname;
        }

        // do exclude or include according to Config
        {
            const strategy = secret.filtering.wxNameFilterStrategy;
            let ahead;
            const originName = room ? topic : alias,
              contentSub = content.substring(0, (content.length > 50 ? 50 : content.length));
            if (strategy.useBlackList) {
                ahead = true;
                for (const keyword of strategy.blackList) {
                    if (originName.includes(keyword)) {
                        wxLogger.debug(`[${originName}]消息被黑名单屏蔽：${room ? alias + ' // ' : ' '}${contentSub}`);
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
            }
            // End up the filtering block. -----------------
            if (!ahead) return;
        }

        // Process Image as Sticker
        if (msg.type() === wxbot.Message.Type.Emoticon) {
            const ps = await mod.wxMddw.parseXML(content);
            if (ps !== false) {
                const stickerUrlPrefix = secret.misc.deliverSticker.urlPrefix;
                const md5 = ps.msg.emoji[0].$.md5;
                let cEPath = `./downloaded/customEmotion/${md5}.gif`;
                if (secret.misc.deliverSticker === false)
                    return wxLogger.trace(`A sticker (md5=${md5}) sent by (${contact}) is skipped due to denial config.`);
                // Below: check C2C opt: skipSticker
                if (msg.receiver.opts.skipSticker === 2)
                    return wxLogger.trace(`A sticker (md5=${md5}) sent by WX(${contact}) is skipped due to C2C pair config.`);
                else if (msg.receiver.opts.skipSticker) {
                    // This variable is null, only when the sticker is rewritten.
                    cEPath = null;
                }
                {   // filter duplicate-in-period sticker
                    let filtered = false;
                    if (processor.isTimeValid(state.lastEmotion.ts, 10) && md5 === state.lastEmotion.md5) {
                        // Got duplicate and continuous Sticker, skipping and CONDEMN that!
                        wxLogger.debug(`${contact} sent a duplicate emotion, Skipped.`);
                        filtered = true;
                    }
                    // Regardless match or not, update state.lastEmotion
                    state.lastEmotion = {
                        md5, ts: dayjs().unix()
                    }
                    if (filtered) return;
                }
                let ahead = true;   // Will the sticker be delivered
                if (cEPath) {
                    // skip stickers that already sent and replace them into text
                    const fetched = await stickerLib.get(md5.substring(0, 4));
                    if (fetched === null) {
                        ctLogger.trace(`former instance for CuEmo '${md5}' not found, entering normal deliver way.`);
                    } else {
                        if (fetched.full_md5 !== md5) {
                            ctLogger.warn(`Sticker Collision Detected! If you rely on sticker delivery then you should check it.\t${md5} is short for (${fetched.full_md5}).`);
                        }
                        // change msg detail so that could be used in merging or so.
                        msg.DType = DTypes.Text;
                        msgDef.isSilent = true;
                        ahead = false;
                        msg.md5 = md5.substring(0, 4);
                        if (typeof fetched.msgId === "number") content = secret.c11n.stickerWithLink(stickerUrlPrefix, fetched, msg.md5);
                        else content = `[${md5.substring(0, 4)} of #sticker]`;
                    }
                }
                if (ahead && cEPath) {
                    if (fs.existsSync(cEPath)) ctLogger.warn(`Overwriting a sticker file with same name: ${cEPath}`);
                    await (await msg.toFileBox()).toFile(cEPath, true);
                    msg.downloadedPath = cEPath;
                    msg.md5 = md5.substring(0, 4);
                    wxLogger.debug(`Detected as CustomEmotion, Downloaded as: ${md5}.gif, and delivering...`);
                    const tgMsg2 = await tgBotDo.SendAnimation(`#sticker ${msg.md5}`, fs.createReadStream(msg.downloadedPath), true, false);
                    await stickerLib.set(msg.md5, {
                        msgId: tgMsg2.message_id, path: cEPath, hint: "", full_md5: md5,
                    });
                    msg.DType = DTypes.Text;
                    msgDef.isSilent = true;
                    content = `<a href="${stickerUrlPrefix}${tgMsg2.message_id}">[Sticker](${msg.md5})</a>`;
                }
                if (!cEPath) {
                    wxLogger.trace(`A sticker (md5=${md5}) sent by WX(${contact}) is rewritten to TEXT-only due to C2C pair config.`);
                    // Rewrite sticker to text
                    content = secret.c11n.stickerSkipped(msg.md5);
                }

            }
        }
        // Real Images
        if (msg.type() === wxbot.Message.Type.Image) try {
            const fBox = await msg.toFileBox();
            const fname = processor.filterFilename(`${dayjs().format("YYMMDD-HHmmss")}-${alias}.jpg`);
            let photoPath = `./downloaded/photo/${fname}`;
            if (fs.existsSync(photoPath)) photoPath = photoPath.replace(".jpg", `_${(Math.random() * 100).toFixed(0)}.jpg`);
            await fBox.toFile(photoPath);
            if (fs.existsSync(photoPath)) {
                wxLogger.debug(`Detected as Image, Downloaded as: ${fname}`);
                msg.DType = DTypes.Image;
                msg.downloadedPath = photoPath;
            } else throw new Error("save file error");
        } catch (e) {
            wxLogger.warn(`Detected as Image, But download failed.`);
            wxLogger.debug(`Error: ${e.message}`);
            if (e.message.includes("Recv rpc failed: Timed out")) with (secret.notification) await downloader.httpsCurl(baseUrl + prompt_wx_stuck + default_arg);
            msg.DType = DTypes.Text;
            content = "🖼(Fail to download)";
        }   // End of Image process

        // 尝试下载语音
        if (msg.type() === wxbot.Message.Type.Audio) try {
            tgBotDo.SendChatAction("record_voice", msg.receiver).then(tgBotDo.empty);
            const fBox = await msg.toFileBox();
            let audioPath = `./downloaded/audio/${processor.filterFilename(`${dayjs().format("YYMMDD-HHmmss")}`)}-${alias}.mp3`;
            if (fs.existsSync(audioPath)) audioPath = audioPath.replace(".mp3", `_${(Math.random() * 100).toFixed(0)}.mp3`);
            await fBox.toFile(audioPath);
            if (!fs.existsSync(audioPath)) throw new Error("save file error");
            // await recogniseAudio(msg, audioPath);
            await mod.audioRecognition.wx_audio_VTT(msg, audioPath);
            wxLogger.debug(`Detected as Audio, Downloaded as: ${audioPath}`);
            msg.DType = DTypes.Audio;
            msg.downloadedPath = audioPath;
        } catch (e) {
            wxLogger.warn(`Detected as Audio, But download failed.`);
            wxLogger.debug(`Error: ${e.message}`);
            if (e.message.includes("Recv rpc failed: Timed out")) with (secret.notification) await downloader.httpsCurl(baseUrl + prompt_wx_stuck + default_arg);
            msg.DType = DTypes.Text;
            content = "🎤(Fail to download)";
        }
        // 视频消息处理或自动下载
        if (msg.type() === wxbot.Message.Type.Video) {
            const ps = await mod.wxMddw.parseXML(content);
            if (ps !== false) {
                const $1 = ps.msg.videomsg[0].$;
                msg.filesize = $1.length;
                content = `🎦[${$1.playlength}s, ${(msg.filesize / 1024 / 1024).toFixed(3)}MB]`;
                msg.DType = DTypes.File;
                msg.nowPath = msg.payload.wcfraw.thumb.replace(/\.jpg$/, ".mp4");
                msg.vd = 1;
                if (msg.filesize < secret.misc.wxAutoDownloadSizeThreshold) {
                    msg.autoDownload = true;
                    content += `⬇️🔄`;
                } else {
                    msg.autoDownload = false;
                    content += `Send an <code>OK</code> to retrieve.`;
                }
            } else {
                wxLogger.warn(`Video Download failed! (Parse XML failure)`);
                content = "[Video]";
                msg.DType = DTypes.Text;
            }
            // tgBotDo.SendChatAction("record_video", msg.receiver).then(tgBotDo.empty);
            // msg.videoPresent = 1;
            // await mod.wxMddw.handleVideoMessage(msg, alias);
            // content = `🎦(Downloading...)`;
            // msg.autoDownload = 1;
            msgDef.isSilent = true;
            // Due to a recent change in web-wx video, method below which can get video length and playlength
            // failed to work now. Using default no-info method now.
            // msg.DType = DTypes.File;
        }
        // 卡片链接及公众号消息类型
        if (msg.type() === wxbot.Message.Type.Url) {
            const ps = await mod.wxMddw.parseXML(content);
            if (ps !== false) {
                if (ps.msg.appmsg[0].mmreader) {  // Post Messages
                    const result = await mod.wxMddw.handlePushMessage(content, msg, name);
                    if (result !== 0) {
                        //Parse successful, ready to overwrite content
                        content = result;
                        msg.DType = DTypes.Push;
                        wxLogger.debug(`New Posts from [${name}], ✅  (wxStat.MsgTotal:${state.v.wxStat.MsgTotal})`);
                    }
                } else {
                    // Card URL messages
                    const url = ps.msg.appmsg[0].url[0], caption = ps.msg.appmsg[0].title[0];
                    msg.DType = DTypes.Text;
                    content = `🔗 [<a href="${url}">${caption}</a>]`
                      + (secret.misc.showCardDescAfterUrl !== 0 ? `\n<blockquote>${ps.msg.appmsg[0].des[0].substring(0, 49)}</blockquote>` : '')
                      + (secret.misc.addHashCtLinkToMsg !== -1 ? `#ctLink` : '');
                }
            } else {
                content = "[XML URL message]";
            }
        }

        if (msg.type() === wxbot.Message.Type.Location) {
            // Thanks to amap, https://www.amap.com/?q=
            const ps = await mod.wxMddw.parseXML(content);
            if (ps !== false) {
                const loc = ps.msg.location[0].$;
                content = `<a href="https://www.amap.com/?q=${loc.x},${loc.y}">🗺️[${loc.poiname}/${loc.label}]</a>`;
                msg.DType = DTypes.Text;
                await tgBotDo.SendLocation(msg.receiver, parseFloat(loc.x), parseFloat(loc.y));
                msgDef.noPreview = 1;
            } else {
                content = "[Location]";
            }
        }
        // 聊天文件
        if (msg.type() === wxbot.Message.Type.Attachment) {
            const ps = await mod.wxMddw.parseXML(content);
            if (ps !== false) {
                msg.filesize = ps.msg.appmsg[0].appattach[0].totallen[0];
                content = `📎[${msg.payload.filename}], ${(msg.filesize / 1024 / 1024).toFixed(3)}MB.\n`;
                msg.autoDownload = true;
                msg.nowPath = msg.payload.wcfraw.extra;
                if (msg.filesize === 0) {
                    wxLogger.warn(`Got a zero-size wx file here, no delivery would present and please check DT log manually.\nSender:{${alias}}, filename=(${msg.payload.filename})`);
                    return;
                } else if (msg.filesize < 10) {
                    // 小于10个字节的文件不应被下载，但是仍会提供下载方式：因为大概率是新的消息类型，比如块级链接和服务消息
                    msg.autoDownload = false;
                    msgDef.isSilent = true;
                    content += `⚠️ size too small, check log.`
                    wxLogger.info(`Got a very-small wx file here, please check manually. Sender:{${alias}}, filename=(${msg.payload.filename})`);
                } else if (msg.filesize < secret.misc.wxAutoDownloadSizeThreshold) {
                    msg.autoDownload = true;
                    content += `⬇️🔄`;
                } else {
                    msg.autoDownload = false;
                    content += `Send an <code>OK</code> to retrieve.`;
                }
                msg.DType = DTypes.File;
            } else {
                wxLogger.warn(`File Download failed! (Parse XML failure)`);
                content = content || "[File]";
                msg.DType = DTypes.Text;
            }
            // below disabled, because MicroMsg will handle filename corruptions.

            // if (0) {
            //     msg.filesize = parseInt(ps.msg.appmsg[0].appattach[0].totallen[0]);
            //     content = `📎[${msg.payload.filename}], ${(msg.filesize / 1024 / 1024).toFixed(3)}MB.\n`;
            //     msg.nowPath = (function () {   // File Local Path Generator
            //         const path1 = `./downloaded/file/`;
            //         const filename = msg.payload.filename;
            //         let rand = 0;
            //         if (!fs.existsSync(path1 + filename)) return path1 + filename;
            //         do rand = (Math.random() * 122).toFixed();
            //         while (fs.existsSync(path1 + `(${rand})` + filename));
            //         wxLogger.debug(`Renamed destination filename [${filename}] with factor ${rand} to avoid duplication.`);
            //         return path1 + `(${rand})` + filename;
            //     })();
            // }
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
            if (content.includes("sex") && content.includes("antispamticket")) {
                content = await mod.wxMddw.parseCardMsg(content, false);
            }
            if (content.includes("bigheadimgurl") && content.includes("brandIconUrl")) {
                content = await mod.wxMddw.parseCardMsg(content, true);
            }
        }

        // 正式处理消息--------------
        if (msg.DType > 0) {
            const titles = secret.c11n;
            { // **Sub:** Bulk Text Replacement
                if (secret.misc.addHashCtLinkToMsg === 1) content = content.replace(/(?!href=")(https?:\/\/)/g, '(#ctLink)$1');

                // Weixin, WeChat, MicroMsg: how incredible multiple name! micro-message!!!
                content = content.replace(/\[收到一条微信转账消息，请在手机上查看]|\[Received a micro-message transfer message, please view on the phone]|\[向他人发起了一笔转账，当前微信版本不支持展示该内容。]|向他人发起了一笔转账，当前微信版本不支持展示该内容。|确认了一笔转账，当前微信版本不支持展示该内容。/, titles.recvTransfer);
                content = content.replace(/\[确认了一笔转账，当前微信版本不支持展示该内容。]/, titles.acceptTransfer);
                content = content.replace(/\[Message from Split Bill. View on phone.]/, titles.recvSplitBill);

                content = mod.tgProcessor.filterMsgText(content, {isGroup, peerName: name});

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
                    msg.dname = titles.systemMsgTitleInRoom;
                }

                try {
                    if (mod.tgProcessor.isPreRoomValid(state.preRoom, topic, msgDef.forceMerge, secret.misc.mergeResetTimeout.forGroup)) {
                        const isText = msg.DType === DTypes.Text;
                        const result = await mod.tgProcessor.mergeToPrev_tgMsg(msg, true, content, name, isText);
                        if (result === true) {
                            // Let's continue on 'onceMergeCapacity'
                            with (state.preRoom) {
                                stat.messageCount++;
                                stat.mediaCount += (isText ? 0 : 1);
                            }
                            return;
                        }
                    } else msg.preRoomNeedUpdate = true;
                } catch (e) {
                    wxLogger.warn(`Error occurred while merging room msg into older TG msg. Falling back to normal way.\n\t${e.toString()}\n\t${JSON.stringify(state.preRoom)}`);
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

                if (content.includes("tickled")) {
                    wxLogger.trace(`Updated msgDef to Silent by keyword 'tickled'.`);
                    msgDef.isSilent = true;
                }
                try {
                    const _ = state.prePerson;
                    const lastDate = (_.tgMsg) ? (_.tgMsg.edit_date || _.tgMsg.date) : 0;
                    const nowDate = dayjs().unix();
                    if ((_.name === name || _.name === alias) && nowDate - lastDate < secret.misc.mergeResetTimeout.forPerson) {
                        const result = await mod.tgProcessor.mergeToPrev_tgMsg(msg, false, content, name, msg.DType === DTypes.Text);
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
    } catch (e) {
        errorLog(wxLogger, `{onWxMsg()}: ${e.message}`, e);
        wxLogger.trace(`[wxMsg] ${JSON.stringify(msg)}`);
    }
}

wxbot.on('message', onWxMessage);

async function tgCommandHandler(tgMsg) {
    const text = tgMsg.text.replace(secret.tgbot.botName, "");
    // return 1 means not processed by this handler, continue to next steps
    if (state.s.helpCmdInstance && !['/sync_on', '/drop_on', '/drop_toggle'].includes(text)) {
        // former /help instance found, try to delete it...
        if (!secret.misc.keep_help_text_after_command_received) await tgBotDo.RevokeMessage(state.s.helpCmdInstance[0].message_id, state.s.helpCmdInstance[1]);
        state.s.helpCmdInstance = null;
    }
    if (text.startsWith("/eval ")) {
        // Eval specified code
        if (!secret.misc.debug_evalEnabled) return ctLogger.warn(`Received /eval request, but the function has been disabled.`);
        const code = text.replace("/eval ", "");
        const res = eval(code);
        ctLogger.info(`Eval result:\n${res}`);
        return;
    }
    // noinspection FallThroughInSwitchStatementJS
    switch (text) {
        case "/help": {
            tgLogger.debug("Received /help request, now revoking user command...\n"
              + `Temporary Status Output:(TotalMsgCount:${state.v.wxStat.MsgTotal})`);
            tgBotDo.RevokeMessage(tgMsg.message_id, tgMsg.matched).then(tgBotDo.empty);
            conLogger.trace("Revoke complete. sending new /help instance...");
            const helper = secret.c11n.override_help_text || CommonData.TGBotHelpCmdText;
            state.s.helpCmdInstance = [await tgBotDo.SendMessage(tgMsg.matched, helper(state), true, null),
                // Put tg-matched inside the instance to let it be revoked correctly.
                tgMsg.matched];
            return;
        }
        case "/clear": {
            //TODO soft reboot need remaster
            tgLogger.trace(`Invoking softReboot by user operation...`);
            await softReboot("User triggered.");
            return;
        }
        case "/create_topic": {
            // This is an entry point for auto creating a new topic,
            // in order to put new contacts (state.last) under a certain supergroup,
            // to avoid user to modify the user.conf.js and restart program manually.
            // We will use the first `tgid` entry in C2C_generator as the destination,
            // so please put your most recent supergroup as the first entry.
            const tgid = Object.keys(secret.class.C2C_generator)[0];
            if (!tgid) {
                await mod.tgProcessor.replyWithTips("autoCreateTopicFail", null, 0, "No tgid specified in config:C2C_generator !")
                return;
            }
            if (state.last.s === STypes.Chat) {
                const name = state.last.name;
                const res = await tgbot.createForumTopic(tgid, name);
                if (res.message_thread_id) {
                    // -- create topic success
                    const isGroup = !!state.last.target.member; // Only room have member().
                    const newC2C_Obj = {
                        "tgid": parseInt(tgid),
                        "threadId": res.message_thread_id,
                        "wx": [name, isGroup],
                        "flag": "",
                        "opts": {},
                    };
                    for (const propName in secret.chatOptions) if (secret.chatOptions.hasOwnProperty(propName)) {
                        // copy all in def to opts, a.k.a load defaults
                        newC2C_Obj.opts[propName] = secret.chatOptions[propName];
                    }
                    secret.class.C2C.push(newC2C_Obj);
                    // -- completed temporary add to config
                    // Send initial message to thread
                    await tgbot.sendMessage(tgid, secret.c11n.newTopicCreated(name), {
                        message_thread_id: res.message_thread_id,
                    });
                    const writeConfSuccess = (function () {
                        try {
                            const path = "data/user.conf.js";
                            const old = fs.readFileSync(path, "utf-8").toString();
                            const anchor = "/* |autoCreateTopic Anchor| */";
                            if (!old.includes(anchor)) return 1;
                            const str = JSON.stringify([res.message_thread_id, name, isGroup ? "R" : "P", ""]);
                            const new_str = old.replace(anchor, `${str},\n    ${anchor}`);
                            fs.writeFileSync(path, new_str);
                            return 0;
                        } catch (e) {
                            ctLogger.error(`Failed when writing new C2C config into file:\n\t ${e.message}`);
                            ctLogger.warn(`Please add this entry manually to your 'user.conf.js', to keep your data consistency:\n\t ${JSON.stringify(newC2C_Obj)}`);
                            return 2;
                        }
                    })();
                    const msgText = (writeConfSuccess === 0 ? "[Write to config successful.]" : "[Could not write user config file.]") + `\t Name: [${name}], isGroup: [${isGroup}]`;
                    await mod.tgProcessor.replyWithTips("autoCreateTopicSuccess", null, 0, msgText);
                }
            } else await mod.tgProcessor.replyWithTips("autoCreateTopicFail", null, 0, "No available last talker.");
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
        case "/reboot": {
            tgBotDo.SendChatAction("typing", tgMsg.matched).then(tgBotDo.empty);
            ctLogger.info("Reboot request invoked by user! Counting down...");
            setTimeout(() => {
                process.exit(321);
            }, secret.tgbot.polling.interval * 1.5);
            return;
        }
        case "/eval": {
            //return await mod.tgProcessor.replyWithTips("aboutToReLoginWX", tgMsg.matched, 0);
        }
        default: {
            const skip = secret.misc.passUnrecognizedCmdNext;
            tgLogger.info(`Unrecognized command; ${skip ? 'Passed next.' : 'Skipped.'}`);
            return skip;
        }
    }
}

async function deliverWxToTG(isRoom = false, msg, contentO, msgDef) {
    // Previous function: onWxMessage()
    const contact = msg.talker();
    const room = msg.room();
    const name = await contact.name();
    // const alias = await contact.alias() || await contact.name();
    // const topic = await room.topic();
    let content = contentO.replaceAll("<br/>", "\n");
    const topic = isRoom ? await room.topic() : "";
    /* Update msgDef in batches */
    {
        if (msg.DType === DTypes.Push) {
            msgDef.isSilent = true;
            msgDef.suppressTitle = true;
            // TODO Found a issue here, forgot to change target channel to Push;
            //  now corrected but still under observance.
            msg.receiver = secret.class.push;
        }
    }
    let dname = msg.dname;
    if (!dname) {
        wxLogger.error(`ERR #34501 in deliverWxToTG(), msg.dname is null, using name instead.`);
        dname = name;
    }
    // TODO refactor and explain on each tmpl* !
    const {tmpl, tmplc, tmplm} = (() => {
        // Template text; template console; template media.
        let tmpl, tmplc, tmplm;
        if (msg.receiver.opts && msg.receiver.opts.hideMemberName) {

        } else {
            if (msg.receiver.wx || msgDef.suppressTitle) {
                // C2C is present
                tmpl = isRoom ? `[<u>${dname}</u>]` : ``;
                tmplm = isRoom ? secret.c11n.C2C_group_mediaCaption(dname) : ``;
            } else {
                // No C2C, means in default channel, so name/topic is required.
                tmpl = isRoom ? `📬[<b>${dname}</b>/#${topic}]` : `📨[#<b>${dname}</b>]`;
                tmplm = isRoom ? `📬[<b>${dname}</b>/#${topic}]` : `📨[#<b>${dname}</b>]`;
            }
            tmplc = isRoom ? `${dname}/${topic}` : `${dname}`;
            tmplm += msg.media_identifier || "";
        }
        return {tmpl, tmplc, tmplm};
    })();

    let tgMsg, retrySend = 2;
    // TG does not support <br/> in HTML parsed text, so filtering it.
    content = content.replaceAll("<br/>", "\n");
    while (retrySend > 0) {
        if (msg.DType === DTypes.Audio) {
            // 语音
            wxLogger.debug(`Got New Voice message from ${tmplc}.`);
            const stream = fs.createReadStream(msg.downloadedPath);
            tgMsg = await tgBotDo.SendAudio(msg.receiver, `${tmplm}` + msg.audioParsed, stream, false);
        } else if (msg.DType === DTypes.Image) {
            // 正常图片消息
            const stream = fs.createReadStream(msg.downloadedPath);
            tgMsg = await tgBotDo.SendPhoto(msg.receiver, `${tmplm}`, stream, true, false);
        } else if (msg.DType === DTypes.File) {
            // 文件消息, 需要二次确认
            if (!msg.vd) wxLogger.debug(`Received New File from ${tmplc} : ${content.replace(/\n⬇️🔄$/,"")}.`);
            else wxLogger.debug(`Retrieving New Video from ${tmplc}.`);
            tgMsg = await tgBotDo.SendMessage(msg.receiver, `${tmpl} ${content}`, msgDef.isSilent, "HTML");
            // TODO: consider to merge it into normal text

            // this is directly accept the file transaction
            if (msg.autoDownload) {
                // const result = await (msg.videoPresent?continueDeliverFileFromWx)(msg);
                let result= await continueDeliverFileFromWx(msg, tmplc);
                // if (msg.videoPresent) {
                //     result = await mod.wxMddw.handleVideoMessage(msg, tmplm);
                // } else
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
                wxLogger.debug(`WX(${tmplc}) 📥[Text]--> TG: "${content}".`);
                tgLogger.trace(`wxStat.MsgTotal: ${state.v.wxStat.MsgTotal}; sent with msgDef: ${JSON.stringify(msgDef)}`);
            }
            tgMsg = await tgBotDo.SendMessage(msg.receiver, `${tmpl} ${content}`, msgDef.isSilent, "HTML", {
                disable_web_page_preview: (msg.DType === DTypes.Push || msgDef.noPreview)
            });
            // Push messages do not need 'state.pre__'
            if (msg.DType === DTypes.Push) return;
            // below two if-s are the start of merge process
            // disable them by checking msg.receiver.opts.merge
            if (msg.receiver.opts.merge === 0)
                return ctLogger.trace(`Merge disabled by C2C pair config.`);

            if (isRoom && msg.preRoomNeedUpdate) {
                if (secret.misc.debug_show_additional_log) ctLogger.debug(`Merge profile [preRoom] updated: from [${state.preRoom?.topic}] to [${topic}].`);
                // Here should keep same as tgProcessor.js:newItemTitle:<u> | below as same.
                state.preRoom = {
                    topic, tgMsg,
                    firstWord: `[<u>${dname}</u>] ${content}`,
                    msgText: `${tmpl} ${content}`,
                    receiver: msg.receiver,
                    lastTalker: name,
                    talkerCount: 0,
                    stat: {
                        "tsStarted": process.uptime(),
                        "mediaCount": 0,
                        "messageCount": 0,
                    },
                }
            }
            if (!isRoom && msg.prePersonNeedUpdate) {
                state.prePerson = {
                    name: (msg.receiver.wx ? msg.receiver.wx[0] : name)/* Help handle C2C not reset problem */,
                    // tgMsg, firstWord: `[<u>${dayjs().format("H:mm:ss")}</u>] ${content}`,
                    // not putting time in front of person C2C merged msg
                    tgMsg, firstWord: `[📂] ${content}`,
                    msgText: `${tmpl} ${content}`,
                    receiver: msg.receiver,
                    talkerCount: 0,
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
        stat: {
            "tsStarted": 0,
            "mediaCount": 0,
            "messageCount": 0,
        },
    };
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
    // noinspection JSUnresolvedVariable
    let file_path = './downloaded/' + (
      (tgMsg.photo) ? (`photoTG/${tgMsg.photo[tgMsg.photo.length - 1].file_unique_id}.png`) :
        (tgMsg.document ? (`fileTG/${tg_media.file_name}`) :
          (tgMsg.sticker ? (`stickerTG/${tg_media.file_unique_id}.webp`) :  // Hope this could reduce duplicate sticker download
            (`videoTG/${tg_media.file_unique_id}.mp4`))));
    // file_path = `"${file_path}"`;
    const action = `upload_${media_type}`;
    tgBotDo.SendChatAction(action, receiver).then(tgBotDo.empty)
    tgLogger.trace(`file_path is ${file_path}.`);
    // if sticker.webp exist, skip download
    if (fs.existsSync(file_path) && tgMsg.sticker) {
        // sticker file exist, do nothing
        if ((await fs.promises.stat(file_path)).size === 0) {
            // This file is corrupt, re-download it.
            await fs.promises.unlink(file_path);
            // TODO add empty file check to all categories; explore if TG offer filename specification in API
            await downloader.httpsWithProxy(secret.bundle.getTGFileURL(fileCloudPath), file_path);
        } else
            conLogger.trace(`sticker file exist (${file_path}), no need to download this time.`)
    } else await downloader.httpsWithProxy(secret.bundle.getTGFileURL(fileCloudPath), file_path);
    let packed = await FileBox.fromFile(file_path);

    if (tgMsg.sticker) {
        tgLogger.trace(`Invoking TG sticker pre-process...`);
        const srv_type = secret.misc.service_type_on_webp_conversion;
        try {
            const sharp = require('sharp');
            const buffer = await sharp(file_path).gif().toBuffer();
            // We used telegram-side file_unique_id here as filename, because WeChat keeps image name in their servers.
            packed = await FileBox.fromBuffer(buffer, `T_sticker_${tgMsg.sticker.file_unique_id}.gif`);
        } catch (e) {
            tgLogger.warn(`TG sticker pre-process interrupted as 'sharp' failed. Message not delivered.`);
            await mod.tgProcessor.replyWithTips("genericFail", tgMsg.matched);
            return;
        }
    }


    tgBotDo.SendChatAction("record_video", receiver).then(tgBotDo.empty)
    if (s === 0) {
        if (tgMsg.sticker) await wxbot.__options.puppet.agent.wcf.sendEmotion(packed, state.last.target.id);
        else await state.last.target.say(packed);

        //ctLogger.debug(`Handled a (${action}) message send-back to speculative talker:${state.last.name}.`);
        ctLogger.debug(`📤~~~[${media_type}]~~~>WX(${state.last.name}).`);
    } else {
        // C2C media delivery
        with (tgMsg.matched) {
            const wxTarget = await getC2CPeer(tgMsg.matched);
            if (!wxTarget) return;
            if (tgMsg.sticker) await wxbot.__options.puppet.agent.wcf.sendEmotion(packed, wxTarget.id);
            else await wxTarget.say(packed);
            ctLogger.debug(`TG(${tgMsg.chat.title}) 📤[${media_type}]--> WX(${tgMsg.matched.p.wx[0]}).`);
            // ctLogger.debug(`Handled a (${action}) send-back to C2C talker:(${tgMsg.matched.p.wx[0]}) on TG (${tgMsg.chat.title}).`);
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
        // Below is used to track WeChat contact find time
        let timerLabel;
        if (secret.misc.debug_add_console_timers) {
            timerLabel = `C2C peer finder | #${process.uptime().toFixed(2)} used`;
            console.time(timerLabel);
        }
        if (p.wx[1] === true) {
            wxTarget = await wxbot.Room.find({topic: p.wx[0]});
        } else {
            wxTarget = await wxbot.Contact.find({name: p.wx[0]});
            wxTarget = wxTarget || await wxbot.Contact.find({alias: p.wx[0]});
        }
        if (!wxTarget) return await mod.tgProcessor.replyWithTips("C2CNotFound", p);
        else state.C2CTemp[p.wx[0]] = wxTarget;
        if (timerLabel) console.timeEnd(timerLabel);
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

async function continueDeliverFileFromWx(msg, tmplc) {
    const filePath = msg.nowPath;
    try {
        await delay(500);
        tgBotDo.SendChatAction("record_video").then(tgBotDo.empty);
        const fBox = await msg.toFileBox(), dname = msg.dname || msg.payload.wcfraw.sender;
        // await fBox.toFile(filePath);

        wxLogger.debug(`Downloaded previous file as: ${basename(filePath)}`);
        tgBotDo.SendChatAction("upload_document").then(tgBotDo.empty);
        let tgMsg = await tgBotDo[msg.vd ? "SendVideo" : "SendDocument"](msg.receiver, `from [${tmplc || dname}]`, fs.createReadStream(filePath), true);
        if (!tgMsg) {
            tgLogger.warn("Got invalid TG receipt, resend wx file failed.");
            return "sendFailure";
        } else return "Success";

    } catch (e) {
        if (!msg.isRetry) return setTimeout(() => {
            wxLogger.debug(`Retrying file download...`);
            msg.isRetry = true;
            continueDeliverFileFromWx(msg);
        }, 4000);
        // otherwise display error message
        errorLog(wxLogger, `{continueDeliverFileFromWx()}: ${e.message}`, e);
    }
    wxLogger.info(`File [${basename(filePath)}] download not successful.`);

}

wxbot.on('login', async user => {
    wxLogger.info(`${user} 已登录成功.`);
    wxLogger.trace(`Logged User info: id=(${user.id})  |  ${user.payload.name}`);
    state.s.selfName = user.payload.name;
    {
        // In order to grab user's WeChat name for metric, put this block after logging in.
        let ec = encodeURIComponent, ver;
        try {
            // const pkgjson = await fs.promises.readFile('package.json', 'utf-8');
            // ver = (JSON.parse(pkgjson)).version;
            ver = await fs.promises.readFile('config/ver', 'utf-8');
        } catch (e) {
            ctLogger.error("Cannot access version file! Please ensure the file is intact, and your PWD is correct. (project root rather than 'src/')");
            ver = "0.0.0";
        }
        const ret = await downloader.httpsGet(`https://api.ctbr.ryancc.top/verify-v1` +
          `?token=${ec(secret.ctToken)}&wxname=${ec(user.payload.name)}&cli_ver=${ver}`);
        const setting = secret.misc.display_ctToken_info;
        if (ret[0] === 200) {   // Positive reply from server
            try {
                // Token valid
                const ret1 = JSON.parse(ret[1]);
                state.v.extra = ret1.extra;
                if (ret1.success === 1) {
                    // Please DO NOT modify here, your appreciation will help the author a lot.
                    // Please DO NOT modify here, your appreciation will help the author a lot.
                    // Please DO NOT modify here, your appreciation will help the author a lot.
                    if (ret1.trial === 0) ctLogger.trace(`ctToken verified successfully. Thanks for your support.`);
                    else if (ret1.trial < 10) ctLogger.info(`{{ Login successful, welcome to use ctBridgeBot 'trial' version!\nNow please enjoy your moment, from tomorrow on, we'll try not to disturb you,\n then another notice would be sent again in a few days. }}\n`);
                    else if (ret1.trial > 199) ctLogger.info(`Welcome to use ctBridgeBot trial version......`);
                    else if (ret1.trial > 99) ctLogger.info(`{{ It's been a while since your first try with this program.\nIf you appreciate this project, why not consider give a small donation to the author? Thanks ^_^ }}`);
                    if (ret1.msg && setting < 999) ctLogger.info(`Server message: ${ret1.msg}`);
                    // Please do not modify 'server announce' code, as there may be some critical messages delivered in this way.
                    if (ret1.announce) ctLogger.warn(`Server Announce: ${ret1.announce}`);
                    if (ret1.announceStop) {
                        ctLogger.error(`We're sorry, but the server wants you to notice something above. \n\nThe program will stop, but we'll not block your next run. \nThanks for your understanding.`);
                        process.exit(1);
                    }
                } else {
                    if (setting < 999) ctLogger.warn(`Your ctToken encountered a problem. ${ret1.msg || ""}`);
                }
            } catch (e) {
                if (setting < 999) ctLogger.debug(`ctToken registration failed. Cannot read from server.`);
            }
        } else if (ret[0] === 401) {
            // No ctToken provided
            ctLogger.warn(`We cannot detect a ctToken. Please refer to 'user.conf.js' and fill in a ctToken.\nIf you don't have one, please goto trial register site or purchase a donated one.\n\n\n\n`);
        } else if (ret[0] === 406) {
            // Wrong ctToken that not in database
            ctLogger.warn(`It seems that your ctToken is not correct. Please check your spell and try again. \nIf you don't have a token, please goto trial register site or purchase a donated one.\n\n\n\n`);
        } else {
            // Other error, like network error
            if (setting === 1) ctLogger.info(`Error occurred when connecting to ct server. Check log for detail.`);
            ctLogger.trace(`[ct Server Fault] If you are using a latest version, then this maybe a problem of the server. This will have no affect on program, you can skip this message. \n${ret[1]}`)
        }
    }
});

wxbot.on('logout', async (user) => {
    wxLogger.info(`${user} 已被登出. (TotalMsgCount:${state.v.wxStat.MsgTotal}).`);
});
wxbot.start()
  .then(() => {
      state.v.wxStat.puppetDoneInitTime = process.uptime();
      wxLogger.info(`开始登录微信...\t\tpuppetDoneInitTime: ${state.v.wxStat.puppetDoneInitTime.toFixed(2)} s`);
  }).catch((e) => {
    const conf1 = secret.misc.auto_reboot_after_error_detected;
    if (e.toString().includes("Page crashed") && conf1) {
        wxLogger.error(msg + `\n[auto reboot after errors] = ${conf1}; Reboot procedure initiated...\n\n\n\n`);
        setTimeout(() => {
            process.exit(1);
        }, 5000);
    } else
        wxLogger.error(e);
});

require('./common')("startup", {
    tgNotifier: (text, level = 1) => {
        if (secret.misc.deliverLogToTG < level) return;
        tgBotDo.SendMessage(null, `⚠️ctBridgeBot Error\n<code>${text}</code>`, true, "HTML").then(tgBotDo.empty);
    },
});

async function timerFunction_fast() {
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
        errorLog(ctLogger, `{fast timer function}: ${e.message}`, e);
        state.v.timerData[0]--;
        if (state.v.timerData[0] < 0) {
            ctLogger.error(`Due to frequent errors in the fast timer function, it has been disabled. Check and reboot to restore it.`)
            clearInterval(state.v.timerData[2]);
        }
    }
}

async function timerFunction_slow() {
    try {
        // 'keepalive' check
        if (secret.mods.keepalive.switch === "on") await mod.keepalive.triggerCheck();
        // Scheduled restart
        for (const i of secret.misc.scheduled_reboot) {
            if (dayjs().hour() === i.hour && process.uptime() > 7200) {
                // reboot initiated
                ctLogger.info(`Scheduled reboot at ${i.hour} o'clock. Rebooting in 60s...`);
                setTimeout(() => {
                    process.exit(1);
                }, 59000);
            }
        }
    } catch (e) {
        errorLog(ctLogger, `{slow timer function}: ${e.message}`, e);
        state.v.timerData[1]--;
        if (state.v.timerData[1] < 0) {
            ctLogger.error(`Due to frequent errors in the slow timer function, it has been disabled. Check and reboot to restore it.`)
            clearInterval(state.v.timerData[3]);
        }
    }
}

// General Timer Function
state.v.timerData[2] = setInterval(timerFunction_fast, 5000);
state.v.timerData[3] = setInterval(timerFunction_slow, 10 * 60 * 1000);

setInterval(() => {
    const str = `Uptime: ${(process.uptime() / 3600).toFixed(2)}hrs | wxMsgTotal: ${state.v.wxStat.MsgTotal}\n`;
    ctLogger.debug(`[Status Report] ${str}`);
}, secret.misc.status_report_interval * 1000);

// noinspection JSIgnoredPromiseFromCall
onTGMsg({
    chat: undefined, reply_to_message: undefined, edit_date: undefined,
    DEPRESS_IDE_WARNING: 1
});

