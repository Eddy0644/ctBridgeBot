// noinspection JSUnresolvedVariable
// Note that ES module loaded in cjs usually have extra closure like require("file-box").FileBox, remind!
const secretConfig = require('./config/secret');
const Config = require('./config/public');
const FileBox = require("file-box").FileBox;
const fs = require("fs");
const agentEr = require("https-proxy-agent");
// const ffmpeg = require('fluent-ffmpeg');
const {wxLogger, tgLogger, conLogger, cyLogger, LogWxMsg} = require('./logger')();

const {tgbot,tgBotDo}=require('./tgbot-pre');

tgbot.on('message', onTGMsg);

async function onTGMsg(tgMsg) {
    //Update: added choose_sticker chatAction after sending message back successfully.
    try {
        if (process.uptime() < 10) return;

        //Put these two into a separated func though;
        if (tgMsg.photo) {
            if (state.lastOpt[0] !== "chat") {
                // !!unimplemented
                return;
            }
            // console.log(tgMsg.photo);
            const file_id = tgMsg.photo[tgMsg.photo.length - 1].file_id;
            const fileCloudPath = (await tgbot.getFile(file_id)).file_path;
            const file_path = `./downloaded/photoTG/${Math.random()}.png`;
            await tgbot.sendChatAction(secretConfig.target_TG_ID, "upload_photo");
            await downloadFile(`https://api.telegram.org/file/bot${secretConfig.botToken}/${fileCloudPath}`, file_path);
            const packed = await FileBox.fromFile(file_path);
            state.lastOpt[1].say(packed);
            tgLogger.debug(`Handled a Photo message send-back to speculative talker:${await state.lastOpt[2]}.`);
            await tgbot.sendChatAction(secretConfig.target_TG_ID, "choose_sticker");
            return;
        }
        if (tgMsg.document) {
            if (state.lastOpt[0] !== "chat") {
                // !!unimplemented
                return;
            }
            // console.log(tgMsg.document);
            // const file_id = tgMsg.photo[tgMsg.photo.length - 1].file_id;
            const fileCloudPath = (await tgbot.getFile(tgMsg.document.file_id)).file_path;
            const file_path = `./downloaded/fileTG/${tgMsg.document.file_name}`;
            await tgbot.sendChatAction(secretConfig.target_TG_ID, "upload_document");
            await downloadFile(`https://api.telegram.org/file/bot${secretConfig.botToken}/${fileCloudPath}`, file_path);
            const packed = await FileBox.fromFile(file_path);
            state.lastOpt[1].say(packed);
            tgLogger.debug(`Handled a Document message send-back to speculative talker:${await state.lastOpt[2]}.`);
            await tgbot.sendChatAction(secretConfig.target_TG_ID, "choose_sticker");
            return;
        }

        // Non-text messages must be filtered ahead of them
        // tgMsg.text = "";
        if (tgMsg.reply_to_message) {
            for (const pair of msgMappings) {
                if (pair[0] === tgMsg.reply_to_message.message_id) {
                    if (tgMsg.text === "ok" && pair.length === 4 && pair[3].filesize) {
                        // 对wx文件消息做出了确认
                        await getFileFromWx(pair[3]);
                        tgLogger.debug(`Handled a message send-back to ${pair[2]}.`);
                        await tgbot.sendChatAction(secretConfig.target_TG_ID, "upload_document");
                        return;
                    } else {
                        pair[1].say(tgMsg.text);
                        tgLogger.debug(`Handled a message send-back to ${pair[2]}.`);
                        await tgbot.sendChatAction(secretConfig.target_TG_ID, "choose_sticker");
                        return;
                    }
                }
            }
            tgLogger.debug(`Unable to send-back due to no match in msgReflection.`);
        } else if (tgMsg.text === "/find") {
            let form = {
                reply_markup: JSON.stringify({
                    keyboard: secretConfig.quickFindList,
                    is_persistent: false,
                    resize_keyboard: true,
                    one_time_keyboard: true
                })
            };
            // const tgMsg2 = await tgbot.sendMessage(tgMsg.chat.id, 'Entering find mode; enter token to find it.', form);
            const tgMsg2 = await tgBotDo.SendMessage('Entering find mode; enter token to find it.', true, null, form);
            state.lastOpt = ["/find", tgMsg2];
        } else if (tgMsg.text.indexOf("/find") === 0) {
            // Want to find somebody
            await findSbInWechat(tgMsg.text.replace("/find ", ""));
        } else if (tgMsg.text === "/clear") {
            state.lastOpt = null;
            await tgBotDo.SendMessage(`Status Cleared.`, true, null, {
                reply_markup: {}
            });
        } else if (tgMsg.text === "/info") {
            const statusReport = `---state.lastOpt: <code>${JSON.stringify(state.lastOpt)}</code>\n---RunningTime: <code>${process.uptime()}</code>`;
            await tgBotDo.SendMessage(statusReport, true, "HTML");
        } else if (tgMsg.text === "/placeholder") {
            await tgbot.sendMessage(tgMsg.chat.id, Config.placeholder);
        } else {
            // No valid COMMAND matches to msg
            if (state.lastOpt === null) {
                // Activate chat & env. set
                // noinspection JSUnresolvedVariable,JSIgnoredPromiseFromCall
                await tgbot.sendMessage(tgMsg.chat.id, 'Nothing to do upon your message, ' + tgMsg.chat.id);
                // const setChatMenuButtonState = await tgbot.setChatMenuButton({chat_id:config.botToken,menu_button:TGBotCommands});
                const result = await tgbot.setMyCommands(Config.TGBotCommands);
                tgLogger.debug(`I received a message from chatId ${tgMsg.chat.id}, Update ChatMenuButton:${result ? "OK" : "X"}.`);
            } else if (state.lastOpt[0] === "/find") {
                const msgToRevoke1 = state.lastOpt[1];
                const result = await findSbInWechat(tgMsg.text);
                // Revoke the prompt 'entering find mode'
                if (result) {
                    await tgBotDo.RevokeMessage(msgToRevoke1.message_id);
                    await tgBotDo.RevokeMessage(tgMsg.message_id);
                }
                // if (result) state.lastOpt = null;
            } else if (state.lastOpt[0] === "chat") {
                if (tgMsg.text === "ok" && state.lastOpt.length === 4 && state.lastOpt[3].filesize) {
                    // 对wx文件消息做出了确认
                    await tgbot.sendChatAction(secretConfig.target_TG_ID, "typing");
                    await getFileFromWx(state.lastOpt[3]);
                    tgLogger.debug(`Handled a message send-back to ${state.lastOpt[2]}.`);
                } else {
                    // forward to last talker
                    state.lastOpt[1].say(tgMsg.text);
                    tgLogger.debug(`Handled a message send-back to speculative talker:${await state.lastOpt[2]}.`);
                    await tgbot.sendChatAction(secretConfig.target_TG_ID, "choose_sticker");
                }
            } else {
                // Empty here.
            }
        }
    } catch (e) {
        tgLogger.warn(`Uncaught Error while handling TG message: ${e.toString()}`);
    }
}

async function findSbInWechat(token) {
    await tgbot.sendChatAction(secretConfig.target_TG_ID, "typing");
    let wxFinded1 = await wxbot.Contact.find({name: token});
    const wxFinded2 = wxFinded1 || await wxbot.Room.find({topic: token});
    wxFinded1 = wxFinded1 || await wxbot.Contact.find({alias: token});
    if (wxFinded1) {
        const tgMsg = await tgBotDo.SendMessage(`🔍Found Person: name=<code>${await wxFinded1.name()}</code> <tg-spoiler>alias=${await wxFinded1.alias()}</tg-spoiler>`,
            true, "HTML");
        await addToMsgMappings(tgMsg.message_id, wxFinded1);
    } else if (wxFinded2) {
        const tgMsg = await tgBotDo.SendMessage(`🔍Found Group: topic=<code>${await wxFinded2.topic()}</code>`,
            true, "HTML");
        await addToMsgMappings(tgMsg.message_id, wxFinded2);
    } else {
        await tgBotDo.SendMessage(`🔍Found Failed. Please enter token again or /clear.`);
        return false;
    }
    return true;
}

async function downloadFile(url, pathName) {
    return new Promise((resolve, reject) => {
        const file = fs.createWriteStream(pathName);
        // const agentEr = require('https-proxy-agent');
        const agent = new agentEr.HttpsProxyAgent(require("./config/proxy"));
        require('https').get(url, {agent: agent}, (response) => {
            // response.setEncoding("binary");
            response.pipe(file);
            file.on('finish', () => {
                file.close();
                resolve("SUCCESS");
            });
        }).on('error', (error) => {
            fs.unlink(pathName, () => reject(error));
        });
    });
}

async function downloadFileWx(url, pathName, cookieStr) {
    return new Promise((resolve, reject) => {
        const file = fs.createWriteStream(pathName);
        // const agentEr = require('https-proxy-agent');
        const agent = new agentEr.HttpsProxyAgent("http://127.0.0.1:8888");
        const options = {
            headers: {
                'Cookie': cookieStr
            },
            agent: agent,
            rejectUnauthorized: false
        };
        require('https').get(url, options, (response) => {
            if (response.statusCode !== 200) {
                reject(new Error(`Failed to download file: ${response.statusCode} ${response.statusMessage}`));
                return;
            }
            response.pipe(file);
            file.on('finish', () => {
                file.close();
                resolve("SUCCESS");
            });
        }).on('error', (error) => {
            fs.unlink(pathName, () => reject(error));
        }).end();
    });
}

let msgMappings = [];
let state = {
    lastOpt: null
};   // as for talker, [1] is Object, [2] is name.


async function addToMsgMappings(tgMsg, talker, wxMsg) {
    const name = await (talker.name ? talker.name() : talker.topic());
    msgMappings.push([tgMsg, talker, name, wxMsg]);
    state.lastOpt = ["chat", talker, name, wxMsg];
}

// 监听对话
async function onWxMessage(msg) {

    // 按照距今时间来排除wechaty重启时的重复消息
    let isMessageDropped = msg.age() > 40 && process.uptime() < 39;
    //将收到的所有消息之摘要保存到wxLogger->trace,消息详情保存至wxMsg文件夹
    LogWxMsg(msg, isMessageDropped);
    if (isMessageDropped) return;

    //基本信息提取-------------
    const contact = msg.talker(); // 发消息人
    let content = msg.text().trim(); // 消息内容
    const room = msg.room(); // 是否是群消息
    const name = await contact.name();
    const alias = await contact.alias() || await contact.name(); // 发消息人备注
    //DeliverType

    msg.DType = DTypes.Default;
    //提前筛选出自己的消息,避免多次下载媒体
    if (room) {
        if (msg.self() && await room.topic() !== "CyTest") return;
    } else {
        if (msg.self()) return;
    }
    //已撤回的消息单独处理
    if (msg.type() === wxbot.Message.Type.Recalled) {
        const recalledMessage = await msg.toRecalled();
        wxLogger.debug(`This message was a recaller, original is {{ ${recalledMessage} }}`);
        // await tgbot.sendMessage(config.target_TG_ID, `Message: ${recalledMessage} has been recalled.`);
        await tgBotDo.SendMessage(`Message: {{ ${recalledMessage} }} has been recalled.`, true);
        return;
    }

    //处理自定义表情
    const CustomEmotionRegex = new RegExp(/&lt;msg&gt;(.*?)md5="(.*?)"(.*?)cdnurl(.*?)"(.*?)" designer/g);
    if (msg.type() === wxbot.Message.Type.Image) try {
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
        if (!fs.existsSync(cEPath)) {
            if (await downloadFile(emotionHref, cEPath)) {
                // downloadFile_old(emotionHref, path + ".backup.gif");
                msg.downloadedPath = cEPath;
                wxLogger.debug(`Detected as CustomEmotion, Downloaded as: ${cEPath}`);
            } else msg.downloadedPath = null;
        } else msg.downloadedPath = cEPath;
    } catch (e) {
        wxLogger.trace(`CustomEmotion Check not pass, Maybe identical photo.`);
        //尝试解析为图片
        const fBox = await msg.toFileBox();
        const photoPath = `./downloaded/photo/${alias}-${msg.payload.filename}`;
        await fBox.toFile(photoPath);
        if (fs.existsSync(photoPath)) {
            wxLogger.debug(`Detected as Image, Downloaded as: ${photoPath}`);
            msg.DType = DTypes.Image;
            msg.downloadedPath = photoPath;
        } else wxLogger.info(`Detected as Image, But download failed. Ignoring.`);

    }

    if (msg.type() === wxbot.Message.Type.Audio) try {
        const fBox = await msg.toFileBox();
        let audioPath = `./downloaded/audio/${alias}-${msg.payload.filename}`;
        await fBox.toFile(audioPath);
        // await ffmpeg()
        //     .input(audioPath)
        //     .output(audioPath+".ogg")
        //     .outputOptions('-codec:a libopus')
        //     .format('ogg')
        //     .run();
        // audioPath+=".ogg";
        if (fs.existsSync(audioPath)) {
            wxLogger.debug(`Detected as Audio, Downloaded as: ${audioPath}`);
            msg.DType = DTypes.Audio;
            msg.downloadedPath = audioPath;
        } else {
            wxLogger.info(`Detected as Audio, But download failed. Ignoring.`);
            msg.DType = DTypes.Text;
            content = "🎤(Fail to download)";
        }
    } catch (e) {
        wxLogger.info(`Detected as Audio, But download failed. Ignoring.`);
    }
    // 文件及公众号消息类型
    if (msg.type() === wxbot.Message.Type.Attachment) {
        if (msg.payload.filename.endsWith(".49")) {
            wxLogger.trace(`filename has suffix .49, maybe pushes.`);
        } else {
            // const result=await deliverWxToTG();
            const FileRegex = new RegExp(/&lt;totallen&gt;(.*?)&lt;\/totallen&gt;/);
            try {
                let regResult = FileRegex.exec(content);
                msg.filesize = parseInt(regResult[1]);
                content = `📎, size:${(msg.filesize / 1024 / 1024).toFixed(3)}MB.\nSend a single OK to retrieve that.`;
                msg.DType = DTypes.File;
            } catch (e) {
                wxLogger.debug(`Detected as File, but error occurred while getting filesize.`);
            }
        }
    }
    //文字消息判断:
    if (msg.DType === DTypes.Default && msg.type() === wxbot.Message.Type.Text) msg.DType = DTypes.Text;

    //处理未受支持的emoji表情
    if (msg.DType === DTypes.Text) {
        const UsEmojiRegex = new RegExp(/<img class="(.*?)" text="(.*?)" src="\/zh_CN\/htmledition\/v2\/images\/spacer.gif" \/>/);
        let replaceFlag = 1;
        while (replaceFlag > 0) try {
            UsEmojiRegex.lastIndex = 0;
            let execResult = UsEmojiRegex.exec(content);
            wxLogger.trace('UsEmoji Replaced,' + JSON.stringify([execResult[1], execResult[2]]));
            content = content.replace(/<img class="(.*?)" text="(.*?)" src="\/zh_CN\/htmledition\/v2\/images\/spacer.gif" \/>/, `${execResult[2]}`);
            content = content.replace("_web", "");
        } catch (e) {
            replaceFlag = 0;
        }
    }

    // 正式处理消息--------------
    if (msg.DType > 0) {
        if (room) {
            // 是群消息 - - - - - - - -
            const topic = await room.topic();

            // 群系统消息中先过滤出红包
            if (name === topic) {
                if (content.includes("red packet") || content.includes("红包")) {
                    await tgBotDo.SendMessage(`🧧[in ${topic}] ${content}`, 0);
                    return;
                }
            }
            // 再筛选掉符合exclude keyword的群聊消息
            for (const keyword of secretConfig.roomExcludeKeyword) {
                if (topic.includes(keyword)) {
                    wxLogger.debug(`群聊[in ${topic}]以下消息符合关键词“${keyword}”，未递送： ${content}`);
                    return;
                }
            }
            // 系统消息如拍一拍
            if (name === topic) {
                wxLogger.debug(`群聊[in ${topic}] ${content}`);
                await tgBotDo.SendMessage(`[in ${topic}] ${content}`, 1);
                return;
            }
            const deliverResult = await deliverWxToTG(true, msg, content);
            if (deliverResult) await addToMsgMappings(deliverResult.message_id, room, msg);
        } else {
            //不是群消息 - - - - - - - -
            //微信运动-wipe-out(由于客户端不支持微信运动消息的显示,故被归类为text)
            if (alias === "微信运动") {
                return;
            }
            const deliverResult = await deliverWxToTG(false, msg, content);

            await addToMsgMappings(deliverResult.message_id, msg.talker(), msg);
        }
    }
}

async function deliverWxToTG(isRoom = false, msg, contentO) {
    const contact = msg.talker();
    const room = msg.room();
    const name = await contact.name();
    const alias = await contact.alias() || await contact.name();
    // const topic = await room.topic();
    let content = contentO.replaceAll("<br/>", "\n");
    const template = isRoom ? `📬<b>[${name}@${await room.topic()}]</b>` : `📨[${alias}]`;
    let tgMsg;
    if (msg.DType === DTypes.CustomEmotion) {
        // 自定义表情, 已添加读取错误处理
        try {
            const stream = fs.createReadStream(msg.downloadedPath);
            tgMsg = await tgBotDo.SendAnimation(`${template} [CustomEmotion]`, stream, true, true);
        } catch (e) {
            wxLogger.warn(`Attempt to read CuEmo file but ENOENT. Please check environment.`);
            tgMsg = await tgBotDo.SendMessage(`${template} [CustomEmotion](Couldn't send)`, true);
        }
    } else if (msg.DType === DTypes.Audio) {
        // 语音
        wxLogger.debug(`发消息人: ${template} 消息内容为语音，保存至 ${msg.downloadedPath}.`);
        const stream = fs.createReadStream(msg.downloadedPath);
        tgMsg = await tgBotDo.SendAudio(`${template} 🎤`, stream, false);
    } else if (msg.DType === DTypes.Image) {
        // 正经图片消息
        const stream = fs.createReadStream(msg.downloadedPath);
        tgMsg = await tgBotDo.SendPhoto(`${template} 🖼`, stream, true, false);
    } else if (msg.DType === DTypes.File) {
        // 文件消息,需要二次确认
        wxLogger.debug(`发消息人: ${template} 消息内容为文件: ${content}`);
        tgMsg = await tgBotDo.SendMessage(`${template} ${content}`, false, "HTML");
        // TODO: consider to merge it into normal text

        // this is directly accept the file transaction
        // await getFileFromWx(msg);
        // return;
    } else {
        // 仅文本或未分类
        // Plain text or not classified
        wxLogger.debug(`发消息人: ${template} 消息内容: ${content}`);
        tgMsg = await tgBotDo.SendMessage(`${template} ${content}`, false, "HTML");
    }
    if (!tgMsg) {
        tgLogger.warn("Didn't get valid TG receipt, bind Mapping failed.");
        return "sendFailure";
    } else {
        return tgMsg;
    }
}

async function getFileFromWx(msg) {
    try {
        const fBox = await msg.toFileBox();
        let filePath = `${msg.payload.filename}`;
        while (fs.existsSync(filePath)) {
            filePath = "@" + filePath;
        }
        filePath = `./downloaded/file/` + filePath;
        const wechatyMemory = JSON.parse(fs.readFileSync("WechatBotV1.memory-card.json").toString());
        const cookieStr = wechatyMemory["\rpuppet\nPUPPET_WECHAT"].map((cookie) => `${cookie.name}=${cookie.value}`).join('; ');
        await downloadFileWx(fBox.remoteUrl, filePath, cookieStr);
        if (fs.existsSync(filePath)) {
            wxLogger.debug(`Downloaded previous file as: ${filePath}`);
            await tgbot.sendChatAction(secretConfig.target_TG_ID, "upload_document");
            const stream = fs.createReadStream(filePath);
            let tgMsg = await tgBotDo.SendDocument("", stream, true, false);
            if (!tgMsg) {
                tgLogger.warn("Didn't get valid TG receipt,resend wx file failed.");
                return "sendFailure";
            } else return "Success";
        } else {
            wxLogger.info(`Detected as File, But download failed. Ignoring.`);
        }
    } catch (e) {
        wxLogger.info(`Detected as File, But download failed. Ignoring.`);
    }
}

// wxbot = require('./wxbot-pre')(tgbot, wxLogger);
const {wxbot, DTypes} = require('./wxbot-pre')(tgbot, wxLogger);


wxbot.on('message', onWxMessage);
wxbot.on('login', async user => {
    wxLogger.info(`${user}已登录.`);
    // await tgBotDo.SendMessage(`[Cy Notice] Service Started.`,1);
});
wxbot.start()
    .then(() => wxLogger.info('开始登陆大而丑...'))
    .catch((e) => wxLogger.error(e));


require('./logger')("startup");

