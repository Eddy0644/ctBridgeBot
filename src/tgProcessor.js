// noinspection JSUnreachableSwitchBranches

const dayjs = require("dayjs");
const {tgBotDo} = require("./init-tg");
const secret = require("../config/confLoader");
const nativeEmojiMap = require('../config/native_emoji_map.js');

let env;

// async function a() {
//     const {} = env;
// }

async function mergeToPrev_tgMsg(msg, isGroup, content, name = "", dname = "", isText) {
    const {state, defLogger, tgBotDo, secret} = env;
    // Time-based identifier
    const timed_id = Date.now().toString(16).slice(-5, -1);
    if (!isText) {
        const DTypeName = ((value) => {
            const DTypes = {Image: 2, Audio: 3, File: 5, Push: 6};
            for (const name in DTypes) if (DTypes[name] === value) return name;
            return "Media";
        })(msg.DType);
        // Temporary override 'content' to inject into merged msg in this function
        if ((secret.misc.add_identifier_to_merged_image - !isGroup) && DTypeName === "Image") {
            content = `[${DTypeName}] %${timed_id}`;
            defLogger.trace(`[${DTypeName}] %${timed_id} is added to content.`);
            msg.media_identifier = timed_id;
        } else if (DTypeName === "File") content = `[${DTypeName}] ${msg.payload.filename}`;
        else content = `[${DTypeName}]`;
    }
    const word = isGroup ? "Room" : "Person";
    const _ = isGroup ? state.preRoom : state.prePerson;
    // the 'newFirstTitle' is 0 when inside C2C
    const newFirstTitle = (msg.receiver.wx) ? 0 : (isGroup ? _.topic : dname);
    const who = isGroup ? `${name}/${_.topic}` : name;
    const newItemTitle = (() => {
        const s = secret.c11n.titleForSameTalkerInMergedRoomMsg;
        if (s === false || (isGroup && _.lastTalker !== name)) {
            _.talkerCount = 0;
            _.lastTalker = name;
            const notDropTitle = secret.misc.PutStampBeforeFirstMergedMsg || isGroup;
            return notDropTitle ? `[<u>${isGroup ? dname : dayjs().format("H:mm:ss")}</u>]` : '';
        }
        _.talkerCount++;
        if (typeof s === "function") return s(_.talkerCount);
        defLogger.error(`Invalid configuration found for {settings.c11n.titleForSameTalkerInMergedRoomMsg}!`);
        return `|→ `;
    })();
    msg[`pre${word}NeedUpdate`] = false;
    content = filterMsgText(content, {isGroup, peerName: name});
    // from same talker check complete, ready to merge
    if (_.firstWord === "") {
        // Already merged, so just append newer to last
        const newString = `${_.msgText}\n${newItemTitle} ${content}`;
        _.msgText = newString;
        _.tgMsg = await tgBotDo.EditMessageText(newString, _.tgMsg, _.receiver);
        // defLogger.debug(`Merged msg from ${word}: ${who}, "${content}" into former.`);
        defLogger.debug(`(${who}) 🔗+ -->📂: "${content}"`);
        return isText; // !isText?false:true
    } else {
        // Ready to modify first msg, refactoring it.
        ///* newFirstTitle = 0 --> C2C msg, do not need header */
        const newString = (newFirstTitle === 0 ? `` : `📨⛓️ [#<b>${newFirstTitle}</b>] - - - -\n`) +
          `${_.firstWord}\n${newItemTitle} ${content}`;
        _.msgText = newString;
        _.firstWord = "";
        _.tgMsg = await tgBotDo.EditMessageText(newString, _.tgMsg, _.receiver);
        // Ref: wxLogger.debug(`📥WX(${tmplc})\t--[Text]-->TG, "${content}".`);
        defLogger.debug(`(${who}) 🔗---->📂: "${content}"`);
        //defLogger.debug(`Merged msg from ${word}: ${who}, "${content}" into first.`);
        return isText;
    }
}

async function replyWithTips(tipMode = "", target = null, timeout = 6, additional = null) {
    const {tgLogger, state, defLogger, tgBotDo} = env;
    let message = "", form = {};
    switch (tipMode) {
      // cannot use this now!
      // case "needRelogin":
      //     message = `Your WX credential expired, please refer to log or go with this [QRServer] link:\n${additional}`;
      //     timeout = 180;
      //     break;
        case "globalCmdToC2C":
            message = `You sent a global command to a C2C chat. The operation has been blocked and please check.`;
            break;
        case "replyCmdToNormal":
            message = `Invalid pointer! Are you missing target for this command? `;
            break;
        case "C2CNotFound":
            message = `Your C2C peer could not be found. Please Check!`;
            break;
        case "wrongMYSTAT_setter":
            message = `You sent a global command to a C2C chat. The operation has been blocked and please check.`;
            break;
        case "mystat_changed":
            message = `Changed myStat into ${additional}.`;
            break;
        case "lockStateChange":
            message = `Now conversation lock state is ${additional}.`;
            break;
        case "softReboot":
            message = `Soft Reboot Successful.\nReason: <code>${additional}</code>`;
            form = {reply_markup: {}};
            break;
        case "nothingToDo":
            message = `Nothing to do upon your message, ${target}`;
            break;
        case "dropCmdAutoOff":
            message = `The 'drop' lock has been on for ${secret.misc.keep_drop_on_x5s * 5}s, thus been switched off automatically.`;
            break;
        case "audioProcessFail":
            message = `Audio transcript request received, But error occurred when processing.`;
            break;
        case "alreadySetStickerHint":
            message = `Successfully set hint for Sticker (${additional})!`;
            break;
        case "notEnabledInConfig":
            message = `One or more action interrupted as something is not configured properly. See log for detail.`;
            break;
        case "setMediaSpoilerFail":
            message = `Error occurred while setting spoiler for former message :\n<code>${additional}</code> `;
            break;
        case "setAsLastAndLocked":
            message = `Already set '${additional}' as last talker and locked.`;
            break;
        case "autoCreateTopicFail":
            message = `Attempt of '/create_topic' failed.\t Reason: ${additional}.`;
            timeout = 60;
            break;
        case "autoCreateTopicSuccess":
            message = `Successfully created topic. \n${additional}`;
            break;
        case "aboutToReLoginWX":
            message = `You are about to trigger relogin of WeChat. The program will try to exit after you send /reloginWX_2 , and if the program is run under docker or other monitor tool, it would be started again and soon later you will receive new qrcode to scan. If you don't respond, then nothing will happen.`;
            timeout = 180;
            break;

        default:
            tgLogger.error(`Wrong call of tg replyWithTips() with invalid 'tipMode'. Please check arguments.\n${tipMode}\t${target}`);
            return;
    }
    try {
        const tgMsg = await tgBotDo.SendMessage(target, message, true, "HTML", form);
        defLogger.info(`Sent out following tips: {${message}}`);
        if (timeout !== 0) {
            tgLogger.debug(`Added message #${tgMsg.message_id} to poolToDelete with timer (${timeout})sec.`);
            state.poolToDelete.push({tgMsg: tgMsg, toDelTs: (dayjs().unix()) + timeout, receiver: target});
        }
    } catch (e) {
        defLogger.warn(`Sending Tip failed in post-check, please check!`);
    }
    // if (timeout !== 0) state.poolToDelete.add(tgMsg, timeout);

}

async function addSelfReplyTs(name = null) {
    const {processor, state, defLogger, secret} = env;
    if (name === null) name = state.last.name;
    if (isPreRoomValid(state.preRoom, name, false, secret.misc.mergeResetTimeout.forGroup) && state.preRoom.firstWord === "") {
        // preRoom valid and already merged (more than 2 msg)
        const _ = state.preRoom;
        const newString = `${_.msgText}\n← [${dayjs().format("H:mm:ss")}] {My Reply}`;
        if (secret.misc.addSelfReplyTimestampToRoomMergedMsg) {
            _.tgMsg = await tgBotDo.EditMessageText(newString, _.tgMsg, _.receiver);
            defLogger.debug(`Delivered myself reply stamp into Room:${_.topic} 's former message, and cleared its preRoom.`);
        }
        // at first this function is used to add reply timestamp on merged msg when user reply, but it became a resetter for merge
        // after user reply. now because of a neglect, the preRoom have no 'stat', which will cause a bug.
        state.preRoom = {
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
        };
    } else {
        if (secret.misc.addSelfReplyTimestampToRoomMergedMsg) defLogger.debug(`PreRoom not valid, skip delivering myself reply stamp into former message.`);
    }
}

function filterMsgText(inText, args = {}) {
    const {state, defLogger} = env;
    let txt = inText;
    let appender = "";
    txt = txt.replaceAll("<br/>", "\n");

    { // Emoji dual processor

        // Process qqemoji (WeChat exclusive emoji)
        let qqemojiRegex = /<img class="qqemoji qqemoji(.*?)" text="(.*?)" src="\/zh_CN\/htmledition\/v2\/images\/spacer.gif" \/>/g;
        txt = txt.replace(qqemojiRegex, (match, emojiId, text) => {
            text = text.replace('_web', '');
            return text;
        });

        // Process emoji (WeChat modified, native emoji)
        let flag = 0;
        let emojiRegex = /<img class="emoji emoji(.*?)" text="(.*?)" src="\/zh_CN\/htmledition\/v2\/images\/spacer.gif" \/>/g;
        txt = txt.replace(emojiRegex, (match, emojiId, text) => {
            flag = 1;
            return `[emoji${emojiId}]`; // Replace with bracketed form
        });

        // Iterate over nativeEmojiMap and replace bracketed emojis
        if (flag) {
            const timerLabel = `Emoji processor - timer #${process.uptime().toFixed(2)}`;
            console.time(timerLabel);
            for (let key in nativeEmojiMap) {
                // Regexp is much slower than regular replacement!
                // In my test on a 10th gen-i5 machine, it takes 42s to complete a single check.
                // ####################let regex = new RegExp(key, 'g');
                const val = nativeEmojiMap[key][0]
                txt = txt.replaceAll(key, val);
                // This logging below causes many useless logs in logfile! removing.
                // defLogger.trace(`[Verbose] replaced '${key}' to '${val}' in WX message.`);
            }
            console.timeEnd(timerLabel);
        }
    } // END: Emoji dual processor


    // process quoted message
    if (/"(.{1,20}): \n?([\s\S]*)"\n- - - - - - - - - - - - - - -\n/.test(txt)) {
        // Filter Wx ReplyTo / Quote      Parameter: (quote-ee name must within [1,10])
        const match = txt.match(/"(.{1,20}): \n?([\s\S]*)"\n- - - - - - - - - - - - - - -\n/);
        // 0 is all match, 1 is orig-msg sender, 2 is orig-msg
        const origMsgClip = (match[2].length > 8) ? match[2].substring(0, 8) : match[2];
        // In clip, we do not need <br/> to be revealed
        const origMsgClip2 = origMsgClip.replaceAll("\n", " ");
        txt = txt.replace(match[0], ``);
        // to let this <i> not escaped by "Filter <> for recaller"

        if (args.peerName && !args.isGroup) {
            // P2P chat, not group, applying quote replacement
            const sets = secret.c11n.quotedMsgSuffixLineInPersonChat;
            if (secret.misc.debug_show_additional_log) defLogger.trace(`#23382 Quoted message name debug: ${match[1]} / ${state.s.selfName} / ${args.peerName}`);
            if (match[1] === state.s.selfName) match[1] = sets ? sets[0] : match[1];
            if (match[1] === args.peerName) match[1] = sets ? sets[0] : match[1];
        }

        appender += `\n` + secret.c11n.wxQuotedMsgSuffixLine(match[1], origMsgClip2);
    }
    // if (txt.includes("<br/>")) {
    //     // Telegram would not accept this tag in all mode! Must remind.
    //     tgLogger.warn(`Unsupported <br/> tag found and cleared. Check Raw Log for reason!`);
    //     txt = txt.replaceAll("<br/>", "\n");
    // }

    // Filter <> for recaller!
    // txt = txt.replaceAll("<", "&lt;").replaceAll(">", "&gt;");
    // This function helps reduce the possibility of mistaken substitution
    txt = (t => {
        // Improved regular expression to support Chinese characters.
        // noinspection RegExpUnnecessaryNonCapturingGroup
        const tagRegex = /<\/?([\w\u4e00-\u9fff]+)(?:\s+[\w\-.:]+\s*=\s*(?:(?:"[^"]*")|(?:'[^']*')|[^>\s]+))*\s*\/?>/g;
        // Replace all HTML entities with &__; except excluded tags.
        return t.replace(tagRegex, (match, tagName) => {
            const isExcludedTag = ['a', 'b', 'i', 'u', 's', 'code'].includes(tagName.toLowerCase());
            if (!isExcludedTag) {
                // Complete tag with non-excluded tag name, encode it.
                return match.replace(/</g, '&lt;').replace(/>/g, '&gt;');
            }
            // Excluded tag, leave it unchanged.
            return match;
        });
    })(txt);
    return txt + appender;
}


function isSameTGTarget(in1, in2) {
    const {secret} = env;
    const parser = in0 => {
        // in <-- <C2C-pair> / secret.class.def  ( msg.receiver )
        if (in0.tgid) {
            // if (in0.threadId) return [in0.tgid, 1, in0.threadId];
            // else return [in0.tgid, 0];
            return in0;
        }
        // in <-- tgMsg.matched <-- s=?, p={}
        if (typeof in0.s === "number") {/* s may be 0 so must do like this! */
            if (in0.s === 1) return in0.p;
            else if (in0.s === 0) return secret.class.def;
        }
    };
    const p1 = parser(in1), p2 = parser(in2);
    // thread verify maybe fixed here
    if (p1.tgid === p2.tgid) {
        if (!p1.threadId && !p2.threadId) return true;
        return p1.threadId === p2.threadId;

    }
}

function isPreRoomValid(preRoomState, targetTopic, forceMerge = false, timeout) {
    const {secret, tgLogger} = env;
    try {
        const _ = preRoomState;
        // noinspection JSUnresolvedVariable
        const lastDate = (_.tgMsg) ? (_.tgMsg.edit_date || _.tgMsg.date) : 0;
        const nowDate = dayjs().unix();
        if (_.topic === targetTopic && (nowDate - lastDate < timeout || forceMerge)) {
            // Let's continue check for 'onceMergeCapacity'
            const exist = _.stat, limit = secret.misc.onceMergeCapacity;
            if (process.uptime() - exist.tsStarted > limit.timeSpan) {
                tgLogger.debug(`[Merge] time span reached limit, resetting merge...`);
                return false;
            }
            if (exist.mediaCount >= limit.mediaCount) {
                tgLogger.debug(`[Merge] mediaCount reached limit, resetting merge...`);
                return false;
            }
            if (exist.messageCount >= limit.messageCount) {
                tgLogger.debug(`[Merge] messageCount reached limit, resetting merge...`);
                return false;
            }
            return true;
        } else return false;
    } catch (e) {
        // console.error(`Maybe bug here!`);
        tgLogger.error(`Error occurred while validating preRoomState.\n\t${e.toString()}`);
        return false;
    }
}

module.exports = (incomingEnv) => {
    env = incomingEnv;
    return {addSelfReplyTs, replyWithTips, mergeToPrev_tgMsg, isSameTGTarget, filterMsgText, isPreRoomValid};
};
