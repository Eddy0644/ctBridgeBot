// noinspection JSUnresolvedVariable,JSObjectNullOrUndefined
// Note that ES module loaded in cjs usually have extra closure like require("file-box").FileBox, remind!
const secretConfig = require('../config/secret');
// const Config = require('./config/public');
const FileBox = require("file-box").FileBox;
const fs = require("fs");
const dayjs = require('dayjs');
const agentEr = require("https-proxy-agent");
const {wxLogger, tgLogger, LogWxMsg, Config, STypes, downloadFileHttp} = require('./common')();

let msgMappings = [];
let state = {
    last: {},
    lastExplicitTalker: null,
    preRoom: {
        firstWord: "",
        tgMsg: null,
        topic: "",
    },
    prePerson: {
        tgMsg: null,
        name: "",
    },
    // store messages which has no need to deliver
    poolDropped: [],
    // store TG messages which need to be revoked after a period of time
    poolToDelete: [],
    // store TG messages which failed to deliver due to network problems or so.
    poolFailing: [],
};

const {tgbot, tgBotDo} = require('./tgbot-pre');

tgbot.on('message', onTGMsg);
tgbot.on('polling_error', async (e) => {
    tgLogger.warn("Polling - " + e.message.replace("Error: ", ""));
});
tgbot.on('webhook_error', async (e) => {
    tgLogger.warn("Webhook - " + e.message.replace("Error: ", ""));
});

async function onTGMsg(tgMsg) {
    //Update: added choose_sticker chatAction after sending message back successfully.
    try {
        if (process.uptime() < 10) return;

        if (tgMsg.photo) {
            await deliverTGToWx(tgMsg, tgMsg.photo, "photo");
            return;
        }
        if (tgMsg.document) {
            await deliverTGToWx(tgMsg, tgMsg.document, "document");
            return;
        }
        if (tgMsg.video) {
            await deliverTGToWx(tgMsg, tgMsg.video, "video");
            return;
        }
        // Non-text messages must be filtered ahead of them
        // tgMsg.text = "";
        if (tgMsg.reply_to_message) {
            tgLogger.trace(`This message has reply flag, searching for mapping...`);
            for (const mapPair of msgMappings) {
                if (mapPair[0] === tgMsg.reply_to_message.message_id) {
                    if ((tgMsg.text === "ok" || tgMsg.text === "OK") && mapPair.length === 4 && mapPair[3].filesize) {
                        // 对wx文件消息做出了确认
                        await getFileFromWx(mapPair[3]);
                        await tgBotDo.SendChatAction("upload_document");
                    } else {
                        state.lastExplicitTalker = await mapPair[1].from();
                        await mapPair[1].say(tgMsg.text);
                        await tgBotDo.SendChatAction("choose_sticker");
                    }
                    tgLogger.debug(`Handled a message send-back to ${mapPair[2]}.`);
                    return;
                }
            }
            tgLogger.debug(`Unable to send-back due to no match in msgMappings.`);

        } else if (tgMsg.text === "/find") {
            let form = {
                reply_markup: JSON.stringify({
                    keyboard: secretConfig.quickFindList,
                    is_persistent: false,
                    resize_keyboard: true,
                    one_time_keyboard: true
                })
            };
            const tgMsg2 = await tgBotDo.SendMessage('Entering find mode; enter token to find it.', true, null, form);
            // state.lastOpt = ["/find", tgMsg2];
            state.last = {
                s: STypes.FindMode,
                userPrompt1: tgMsg,
                botPrompt1: tgMsg2,
            };

        } else if (tgMsg.text === "/keyboard") {
            let form = {
                reply_markup: JSON.stringify({
                    keyboard: secretConfig.quickKeyboard,
                    is_persistent: false,
                    resize_keyboard: true,
                    one_time_keyboard: false
                })
            };
            await tgBotDo.SendMessage('Already set quickKeyboard! ', true, null, form);

        } else if (tgMsg.text.indexOf("F$") === 0) {
            // Want to find somebody, and have inline parameters
            let findToken = tgMsg.text.replace("F$", "");
            for (const pair of secretConfig.findReplaceList) {
                if (findToken === pair[0]) {
                    findToken = pair[1];
                    break;
                }
            }
            wxLogger.trace(`Got an attempt to find [${findToken}] in WeChat.`);
            await findSbInWechat(findToken);

        } else if (tgMsg.text === "/clear") {
            tgLogger.trace(`Cleared tgBot status by user operation.`);
            // state.lastOpt = null;
            state.last = {};
            await tgBotDo.SendMessage(`Status Cleared.`, true, null, {
                reply_markup: {}
            });

            // Set last explicit talker as last talker.
        } else if (tgMsg.text === "/slet") {
            const talker = state.lastExplicitTalker;
            const name = await (talker.name ? talker.name() : talker.topic());
            tgLogger.trace(`forking lastExplicitTalker...`);
            state.last = {
                s: STypes.Chat,
                target: state.lastExplicitTalker,
                name: name,
                wxMsg: null,
                isFile: null
            };
            await tgBotDo.SendMessage(`Set "${name}" as last Talker By user operation.`, true, null);
            await tgBotDo.RevokeMessage(tgMsg.message_id);

            // Get a copy of program verbose log of 1000 chars by default.
        } else if (tgMsg.text.indexOf("/log") === 0) {
            const path = `./log/day.${dayjs().format("YY-MM-DD")}.log`;
            let log = (await fs.promises.readFile(path)).toString();
            let chars = 1000;
            if (tgMsg.text.length > 5) {
                chars = parseInt(tgMsg.text.replace("/log ", ""));
            }
            await tgBotDo.SendMessage(`\`\`\`${log.substring(log.length - chars, log.length)}\`\`\``, true, "MarkdownV2");

        } else if (tgMsg.text === "/info") {
            tgLogger.trace(`Sent out tgBot status by user operation.`);
            // const statusReport = `---state.lastOpt: <code>${JSON.stringify(state.lastOpt)}</code>\n---RunningTime: <code>${process.uptime()}</code>`;
            const statusReport = await generateInfo();
            await tgBotDo.SendMessage(statusReport, true, "HTML");
            const result = await tgbot.setMyCommands(Config.TGBotCommands);
            tgLogger.debug(`I received a message from chatId ${tgMsg.chat.id}, Update ChatMenuButton:${result ? "OK" : "X"}.`);

            // Get a persistent versatile quick keyboard.
        } else if (tgMsg.text === "/placeholder") {
            await tgbot.sendMessage(tgMsg.chat.id, Config.placeholder);
        } else {

            // No valid COMMAND within msg
            if (state.last === {}) {
                // Activate chat & env. set
                await tgbot.sendMessage(tgMsg.chat.id, 'Nothing to do upon your message, ' + tgMsg.chat.id);
                const result = await tgbot.setMyCommands(Config.TGBotCommands);
                tgLogger.debug(`I received a message from chatId ${tgMsg.chat.id}, Update ChatMenuButton:${result ? "OK" : "X"}.`);

            } else if (state.last.s === STypes.FindMode) {
                tgLogger.trace(`Finding [${tgMsg.text}] in wx by user prior "/find".`);
                // const msgToRevoke1 = state.lastOpt[1];
                let findToken = tgMsg.text;
                for (const pair of secretConfig.findReplaceList) {
                    if (findToken === pair[0]) {
                        findToken = pair[1];
                        break;
                    }
                }
                const lastState = state.last;
                const result = await findSbInWechat(findToken);
                // Revoke the prompt 'entering find mode'
                if (result) {
                    await tgBotDo.RevokeMessage(lastState.userPrompt1.message_id);
                    await tgBotDo.RevokeMessage(lastState.botPrompt1.message_id);
                    await tgBotDo.RevokeMessage(tgMsg.message_id);
                }

            } else if (state.last.s === STypes.Chat) {
                if ((tgMsg.text === "ok" || tgMsg.text === "OK") && state.last.isFile) {
                    // 对wx文件消息做出了确认
                    await tgBotDo.SendChatAction("typing");
                    await getFileFromWx(state.last.wxMsg);
                    tgLogger.debug(`Handled a file reDownload from ${state.last.name}.`);
                } else {
                    // forward to last talker
                    await state.last.target.say(tgMsg.text);
                    tgLogger.debug(`Handled a message send-back to speculative talker:(${state.last.name}).`);
                    await tgBotDo.SendChatAction("choose_sticker");
                }
            } else {
                // Empty here.
            }
        }
    } catch (e) {
        tgLogger.warn(`Uncaught Error while handling TG message: ${e.message}`);
    }

}

async function generateInfo() {
    const statusReport = `---state.last: <code>${JSON.stringify(state.last)}</code>\n---RunningTime: <code>${process.uptime()}</code>`;
    const path = `./log/day.${dayjs().format("YY-MM-DD")}.log`;
    let log = (await fs.promises.readFile(path)).toString();
    const logText = log.substring(log.length - 2400, log.length);
    const dtInfo = {
        lastOperation: state.last ? state.last[0] : 0,
        _last: state.last,
        runningTime: process.uptime(),
        logText: logText
    };
    const postData = JSON.stringify(dtInfo);
    const options = {
        hostname: secretConfig.statusReport[0],
        port: 443,
        path: secretConfig.statusReport[1] + '?s=create',
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Content-Length': postData.length
        }
    };
    let url;
    try {
        const res = await new Promise((resolve, reject) => {
            const req = require('https').request(options, (res) => {
                let data = '';

                res.on('data', (chunk) => {
                    data += chunk;
                });

                res.on('end', () => {
                    resolve(data);
                });
            });

            req.on('error', (err) => {
                reject(err);
            });

            req.write(postData);
            req.end();
        });

        url = `https://${options.hostname}${options.path}?n=${res}`;
        if (res.indexOf('<html') > -1) throw new Error("Upload error");
    } catch (e) {
        url = `Error occurred while uploading report. Here is fallback version.\n${statusReport}`;
    }
    return url;
    // return statusReport;
}

async function deliverTGToWx(tgMsg, tg_media, media_type) {
    if (state.last.s !== STypes.Chat) {
        await tgBotDo.SendMessage("🛠 Sorry, but media sending without last chatter is not implemented.", true);
        // TODO: to be implemented.
        return;
    }
    tgLogger.trace(`Received TG ${media_type} message, proceeding...`);
    const file_id = (tgMsg.photo) ? tgMsg.photo[tgMsg.photo.length - 1].file_id : tg_media.file_id;
    const fileCloudPath = (await tgbot.getFile(file_id)).file_path;
    const file_path = './downloaded/' + ((tgMsg.photo) ?
        (`photoTG/${Math.random()}.png`) : (tgMsg.document ?
            (`fileTG/${tg_media.file_name}`) :
            (`videoTG/${Math.random()}.mp4`)));
    // (tgMsg.photo)?(``):(tgMsg.document?(``):(``))
    // const action = (tgMsg.photo) ? (`upload_photo`) : (tgMsg.document ? (`upload_document`) : (`upload_video`));
    const action = `upload_${media_type}`;
    await tgBotDo.SendChatAction(action);
    tgLogger.trace(`file_path is ${file_path}.`);
    await downloadFile(`https://api.telegram.org/file/bot${secretConfig.botToken}/${fileCloudPath}`, file_path);
    const packed = await FileBox.fromFile(file_path);
    await tgBotDo.SendChatAction("record_video");
    await state.last.target.say(packed);
    tgLogger.debug(`Handled a (${action}) message send-back to speculative talker:${state.last.name}.`);
    await tgBotDo.SendChatAction("choose_sticker");
    return true;
}

async function findSbInWechat(token) {
    await tgBotDo.SendChatAction("typing");
    let wxFinded1 = await wxbot.Contact.find({name: token});
    const wxFinded2 = wxFinded1 || await wxbot.Room.find({topic: token});
    wxFinded1 = wxFinded1 || await wxbot.Contact.find({alias: token});
    if (wxFinded1) {
        wxLogger.debug(`Found person successfully, sending...(view log for detail)`);
        const tgMsg = await tgBotDo.SendMessage(`🔍Found Person: name=<code>${await wxFinded1.name()}</code> alias=<tg-spoiler>${await wxFinded1.alias()}</tg-spoiler>`,
            true, "HTML");
        await addToMsgMappings(tgMsg.message_id, wxFinded1);
    } else if (wxFinded2) {
        wxLogger.debug(`Found person successfully, sending...(view log for detail)`);
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
        const agent = new agentEr.HttpsProxyAgent(require("../config/proxy"));
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
        const options = {
            headers: {
                'Cookie': cookieStr
            },
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

async function addToMsgMappings(tgMsg, talker, wxMsg) {
    // if(talker instanceof wxbot.Message)
    const name = await (talker.name ? talker.name() : talker.topic());
    msgMappings.push([tgMsg, talker, name, wxMsg]);
    state.last = {
        s: STypes.Chat,
        target: talker,
        name: name,
        wxMsg: wxMsg || null,
        isFile: (wxMsg && wxMsg.filesize) || null
    };
    tgLogger.trace(`Added mapping from TG msg #${tgMsg.message_id} to WX ${talker}`);
}

// 监听对话
async function onWxMessage(msg) {
    // 按照距今时间来排除wechaty重启时的重复消息
    let isMessageDropped = (msg.age() > 40 && process.uptime() < 50) || (msg.age() > 120);
    //将收到的所有消息之摘要保存到wxLogger->trace,消息详情保存至wxMsg文件夹
    LogWxMsg(msg, isMessageDropped);
    if (isMessageDropped) return;

    //基本信息提取-------------
    const contact = msg.talker(); // 发消息人
    let content = msg.text().trim(); // 消息内容
    const room = msg.room(); // 是否是群消息
    const name = await contact.name();
    const alias = await contact.alias() || await contact.name(); // 发消息人备注
    let msgDef = {
        isSilent: false,
    }

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

    // 处理自定义表情,若失败再处理图片
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
            if (await downloadFileHttp(emotionHref, cEPath)) {
                // downloadFile_old(emotionHref, path + ".backup.gif");
                msg.downloadedPath = cEPath;
                wxLogger.debug(`Detected as CustomEmotion, Downloaded as: ${cEPath}`);
            } else msg.downloadedPath = null;
        } else msg.downloadedPath = cEPath;
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
    // 尝试下载语音
    if (msg.type() === wxbot.Message.Type.Audio) try {
        const fBox = await msg.toFileBox();
        // let audioPath = `./downloaded/audio/${alias}-${msg.payload.filename}`;
        let audioPath = `./downloaded/audio/${dayjs().format("YYYYMMDD-HHmmss").toString()}-(${alias}).mp3`;
        await fBox.toFile(audioPath);
        if (!fs.existsSync(audioPath)) throw new Error("save file error");
        await recogniseAudio(msg, audioPath);
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
        const VideoRegex = new RegExp(/length="(.*?)" playlength="(.*?)"/);
        try {
            let regResult = VideoRegex.exec(content);
            msg.filesize = parseInt(regResult[1]);
            const videoLength = parseInt(regResult[2]);
            msgDef.isSilent = false;
            content = `🎦, length:${videoLength}s, size:${(msg.filesize / 1024 / 1024).toFixed(3)}MB.\n`;
            if (msg.filesize < Config.wxAutoDownloadThreshold) {
                msg.autoDownload = true;
                content += `Smaller than threshold, so we would try download that automatically for you.`;
            } else {
                msg.autoDownload = false;
                content += `Send a single <code>OK</code> to retrieve that.`;
            }
            msg.DType = DTypes.File;
        } catch (e) {
            wxLogger.debug(`Detected as Video, but error occurred while getting filesize.`);
        }
    }
    // 文件及公众号消息类型
    if (msg.type() === wxbot.Message.Type.Attachment) {
        if (msg.payload.filename.endsWith(".49")) {
            wxLogger.trace(`filename has suffix .49, maybe pushes.`);
            //TODO add this to msg pool and return
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
                content = `📎, size:${(msg.filesize / 1024 / 1024).toFixed(3)}MB.\n`;
                if (msg.filesize < 50) {
                    // 小于50个字节的文件不应被下载，但是仍会提供下载方式：因为大概率是新的消息类型，
                    // 比如块级链接和服务消息
                    msg.autoDownload = false;
                    msgDef.isSilent = true;
                    content += `Too small, so it maybe not a valid file.`
                    wxLogger.info(`Got a very-small wx file here, please check manually.Sender:{${alias}`);
                } else if (msg.filesize < Config.wxAutoDownloadThreshold) {
                    msg.autoDownload = true;
                    content += `Smaller than threshold, so we would try download that automatically for you.`/*Remember to change the prompt in two locations!*/;
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
        if (content.includes("[收到了一个表情，请在手机上查看]")) {
            msgDef.isSilent = true;
        }
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
            for (const keyword of secretConfig.nameExcludeKeyword) {
                if (topic.includes(keyword)) {
                    wxLogger.debug(`群聊[in ${topic}]以下消息符合关键词“${keyword}”，未递送： ${content.substring(0, (content.length > 50 ? 50 : content.length))}`);
                    return;
                }
            }
            try {
                const _ = state.preRoom;
                const lastDate = (_.tgMsg !== null) ? (_.tgMsg.edit_date || _.tgMsg.date) : 0;
                const nowDate = dayjs().unix();
                if (_.topic === topic && nowDate - lastDate < 60 && msg.DType === DTypes.Text) {
                    msg.preRoomUpdate = false;
                    // from same group, ready to merge
                    // noinspection JSObjectNullOrUndefined
                    if (_.firstWord === "") {
                        // 已经合并过，标题已经更改，直接追加新内容
                        const newString = `${_.tgMsg.text}\n📨[${name}] ${content}`.replace(topic, `<b>${topic}</b>`);
                        // 此处更改是由于发送TG消息后加粗标记会被去除，所以通过不稳定的替换方法使标题加粗
                        // TODO 把此前的消息都存入state中，从而不再需要替换
                        _.tgMsg = await tgBotDo.EditMessageText(newString, _.tgMsg);
                        tgLogger.debug(`Delivered new message "${content}" from Room:${topic} into first message.`);
                        return;
                    } else {
                        // 准备修改先前的消息，去除头部
                        const newString = `📬⛓️ [<b>${topic}</b>]\n📨${_.firstWord}\n📨[${name}] ${content}`;
                        _.tgMsg = await tgBotDo.EditMessageText(newString, _.tgMsg);
                        _.firstWord = "";
                        tgLogger.debug(`Delivered new message "${content}" from Room:${topic} into former message.`);
                        return;
                    }
                } else msg.preRoomUpdate = true;
            } catch (e) {
                wxLogger.info(`Error occurred while merging room msg into older TG msg. Falling back to normal way.`);
            }
            // 系统消息如拍一拍
            if (name === topic) {
                wxLogger.debug(`群聊[in ${topic}] ${content}`);
                // TODO: put such message into Pool
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
            // 筛选掉符合exclude keyword的个人消息
            for (const keyword of secretConfig.nameExcludeKeyword) {
                if (name.includes(keyword)) {
                    wxLogger.debug(`来自此人[in ${name}]的以下消息符合名称关键词“${keyword}”，未递送： ${content.substring(0, (content.length > 50 ? 50 : content.length))}`);
                    return;
                }
            }
            try {
                const _ = state.prePerson;
                const lastDate = (_.tgMsg !== null) ? (_.tgMsg.edit_date || _.tgMsg.date) : 0;
                const nowDate = dayjs().unix();
                if (_.name === name && nowDate - lastDate < 15 && msg.DType === DTypes.Text) {
                    msg.prePersonUpdate = false;
                    // from same person, ready to merge
                    // 准备修改先前的消息，去除头部
                    const newString = `${_.tgMsg.text}\n[${dayjs().format("H:mm:ss")}] ${content}`;
                    _.tgMsg = await tgBotDo.EditMessageText(newString, _.tgMsg);
                    tgLogger.debug(`Delivered new message "${content}" from Person:${name} into former message.`);
                    return;
                } else
                    msg.prePersonUpdate = true;
            } catch (e) {
                wxLogger.info(`Error occurred while merging personal msg into older TG msg. Falling back to normal way.`);
            }
            const deliverResult = await deliverWxToTG(false, msg, content);
            if (deliverResult) await addToMsgMappings(deliverResult.message_id, msg.talker(), msg);
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
    const topic = isRoom ? await room.topic() : "";
    const template = isRoom ? `📬[<b>${name}</b>@${topic}]` : `📨[<b>${alias}</b>]`;
    let tgMsg, retrySend = 1;
    while (retrySend > 0) {
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
            tgMsg = await tgBotDo.SendAudio(`${template} 🎤` + msg.audioParsed, stream, false);
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
            if (msg.autoDownload) {
                const result = await getFileFromWx(msg);
                if (result === "Success") {
                    tgMsg = await tgBotDo.EditMessageText(tgMsg.text.replace("Smaller than threshold, so we would try download that automatically for you.", "Auto Downloaded Already."), tgMsg);
                }
            }
            // return;
        } else {
            // 仅文本或未分类
            // Plain text or not classified
            wxLogger.debug(`发消息人: ${template} 消息内容: ${content}`);
            tgMsg = await tgBotDo.SendMessage(`${template} ${content}`, false, "HTML");
            if (isRoom && msg.preRoomUpdate) {
                state.preRoom.topic = topic;
                state.preRoom.tgMsg = tgMsg;
                state.preRoom.firstWord = `[${name}] ${content}`;
            }
            if (!isRoom && msg.prePersonUpdate) {
                state.prePerson.name = name;
                state.prePerson.tgMsg = tgMsg;
            }
        }

        if (!tgMsg) {
            tgLogger.warn("Didn't get valid TG receipt, bind Mapping failed. " +
            (retrySend > 0) ? `[Trying resend #${retrySend} to solve network error]` : `[No retries left]`);
            if (retrySend-- > 0) continue;
            return "sendFailure";
        } else {
            return tgMsg;
        }
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
        const wechatyMemory = JSON.parse((await fs.promises.readFile("ctbridgebot.memory-card.json")).toString());
        const cookieStr = wechatyMemory["\rpuppet\nPUPPET_WECHAT"].map((cookie) => `${cookie.name}=${cookie.value}`).join('; ');
        await downloadFileWx(fBox.remoteUrl, filePath, cookieStr);
        if (fs.existsSync(filePath)) {
            wxLogger.debug(`Downloaded previous file as: ${filePath}`);
            await tgBotDo.SendChatAction("upload_document");
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

const {wxbot, DTypes, recogniseAudio} = require('./wxbot-pre')(tgbot, wxLogger);

wxbot.on('message', onWxMessage);
wxbot.on('login', async user => {
    wxLogger.info(`${user}已登录.`);
    // await tgBotDo.SendMessage(`[Cy Notice] Service Started.`,1);
});
// wxbot.start()
//     .then(() => wxLogger.info('开始登陆大而丑...'))
//     .catch((e) => wxLogger.error(e));

require('./common')("startup");

