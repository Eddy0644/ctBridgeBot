// noinspection JSUnreachableSwitchBranches

const dayjs = require("dayjs");
const {tgBotDo} = require("../src/tgbot-pre");
let env;

// async function a() {
//     const {} = env;
// }

async function mergeToPrev_tgMsg(qdata, isGroup, content, name = "") {
    const {state, defLogger, tgBotDo} = env;
    const word = isGroup ? "Room" : "Person";
    const newItemTitle = isGroup ? name : dayjs().format("H:mm:ss");
    //TODO: add template string separately!!!
    const _ = isGroup ? state.preRoom : state.prePerson;
    qdata[`pre${word}NeedUpdate`] = false;
    // from same person, ready to merge
    // noinspection JSObjectNullOrUndefined
    if (_.firstWord === "") {
        // 已经合并过，标题已经更改，直接追加新内容
        const newString = `${_.msgText}\n[${newItemTitle}] ${content}`;
        _.msgText = newString;
        _.tgMsg = await tgBotDo.EditMessageText(newString, _.tgMsg/*, _.tg_chat_id*/);
        defLogger.debug(`Delivered new message "${content}" from ${word}: ${name} into 2nd message.`);
        return true;
    } else {
        // 准备修改先前的消息，去除头部
        // const newString = (/* C2C msg do not need header */qdata.receiver.qTarget ? `` :
        //     `📨⛓️ [<b>${name}</b>] - - - -\n`) + `${_.firstWord}\n[${newItemTitle}] ${content}`;
        const newString = `📨⛓️ [<b>${name}</b>] - - - -\n${_.firstWord}\n[${newItemTitle}] ${content}`;
        _.msgText = newString;
        _.tgMsg = await tgBotDo.EditMessageText(newString, _.tgMsg/*, _.tg_chat_id*/);
        _.firstWord = "";
        defLogger.debug(`Delivered new message "${content}" from ${word}: ${name} into first message.`);
        return true;
    }
}

async function replyWithTips(tipMode = "", target = null, timeout = 6, additional = null) {
    const {tgLogger, state, secret, defLogger, tgBotDo} = env;
    let message = "", form = {};
    switch (tipMode) {
        case "globalCmdToC2C":
            message = `You sent a global command to a C2C chat. The operation has been blocked and please check.`;
            break;
        case "wrongMYSTAT_setter":
            message = `You sent a global command to a C2C chat. The operation has been blocked and please check.`;
            break;
        case "mystat_changed":
            message = `Changed myStat into ${additional}.`;
            break;
        case "lockStateChange":
            message = `Already set lock state to ${additional}.`;
            break;
        case "softReboot":
            message = `Soft Reboot Successful.\nReason: <code>${additional}</code>`;
            form = {reply_markup: {}};
            break;
        case "nothingToDo":
            message = `Nothing to do upon your message, ${target}`;
            break;
        case "audioProcessFail":
            message = `Audio transcript request received, But error occurred when processing.`;
            break;
        default:
            tgLogger.error(`Wrong call of tg replyWithTips() with invalid 'tipMode'. Please check arguments.\n${tipMode}\t${target}`);
            return;
    }
    if (target === null) {
        // left this to null means replying to default channel. ---------------
        target = secret.target_TG_ID;
    }
    try {
        const tgMsg = await tgBotDo.SendMessage(/*{tgGroupId: target},*/ message, true, "HTML", form);
        defLogger.debug(`Sent out following tips: {${message}}`);
        if (timeout !== 0) {
            tgLogger.debug(`Added message #${tgMsg.message_id} to poolToDelete with timer (${timeout})sec.`);
            state.poolToDelete.push({tgMsg: tgMsg, toDelTs: (dayjs().unix()) + timeout, chat_id: target});
        }
    } catch (e) {
        defLogger.warn(`Sending Tip failed in post-check, please check!`);
    }
    // if (timeout !== 0) state.poolToDelete.add(tgMsg, timeout);

}

async function addSelfReplyTs() {
    const {processor, state, ctLogger} = env;
    if (processor.isPreRoomValid(state.preRoom, state.last.name) && state.preRoom.firstWord === "") {
        // preRoom valid and already merged (more than 2 msg)
        const _ = state.preRoom;
        const newString = `${_.tgMsg.text}\n⬅️[${dayjs().format("H:mm:ss")}] {My Reply}`.replace(_.topic, `<b>${_.topic}</b>`);
        // 此处更改是由于发送TG消息后加粗标记会被去除，所以通过不稳定的替换方法使标题加粗
        _.tgMsg = await tgBotDo.EditMessageText(newString, _.tgMsg);
        ctLogger.debug(`Delivered myself reply stamp into Room:${_.topic} 's former message, and cleared its preRoom.`);
        state.preRoom = {
            firstWord: "",
            tgMsg: null,
            name: "",
        };
    } else {
        ctLogger.debug(`PreRoom not valid, skip delivering myself reply stamp into former message.`);
    }
}

module.exports = (incomingEnv) => {
    env = incomingEnv;
    return {addSelfReplyTs, replyWithTips};
    // return {mergeToPrev_tgMsg, replyWithTips};

};