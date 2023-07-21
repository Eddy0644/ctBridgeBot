const xml2js = require("xml2js");
const dayjs = require("dayjs");
const fs = require("fs");
const {tgBotDo} = require("../src/tgbot-pre");
let env;

async function a() {
    const {} = env;
}

async function handlePushMessage(rawContent, msg, name) {
    const {wxLogger, secret} = env;
    let filtered = false;
    for (const one of secret.settings.wxPostOriginBlackList) {
        if (name === one) filtered = true;
    }
    if (filtered) {
        wxLogger.trace(`Match BlackList, no delivery!`);
        return 0;
    }
    const ps = await parseXML(rawContent.replaceAll("&lt;", "<").replaceAll("&gt;", ">").replaceAll("<br/>", ""));
    if (ps === false) return 0;
    // noinspection JSUnresolvedVariable
    try {
        // noinspection JSUnresolvedVariable
        const appname = ps.msg.appinfo[0].appname[0];
        // noinspection JSUnresolvedVariable
        const items = ps.msg.appmsg[0].mmreader[0].category[0].item;
        let out = `📬 Posts from [#${appname}]\n`;
        for (const item of items) {
            let itemStr = "";
            const {title, url, digest, is_pay_subscribe} = item;
            itemStr += `→ <a href="${url[0]}">${title[0]}</a>\n`;
            if (digest[0].length > 1) itemStr += `  <i>${digest[0]}</i>\n`;
            if (is_pay_subscribe[0] !== '0') itemStr += `  <b>[Pay Subscribe Post]</b>\n`;
            out += itemStr;
        }
        // Success
        {
            const s = secret.settings.deliverPushMessage;
            if (s === false) return 0;
            if (s === true) msg.receiver = secret.class.push;
            if (s.tgid) msg.receiver = s;
        }
        return out.replaceAll("&amp;", "&");
    } catch (e) {
        wxLogger.debug(`Error occurred when reading xml detail. Skipping...`);
        return 0;
    }
}


async function handleVideoMessage(msg, name) {
    const {wxLogger, tgBotDo, tgLogger} = env;
    let videoPath = `./downloaded/video/${dayjs().format("YYYYMMDD-HHmmss").toString()}-(${name}).mp4`;
    wxLogger.debug(`Detected as Video, Downloading...`);
    tgBotDo.SendChatAction("record_video", msg.receiver).then(() => {});
    const fBox = await msg.toFileBox();
    await fBox.toFile(videoPath);
    if (!fs.existsSync(videoPath)) {
        wxLogger.info("Download Video failed. Please remind the console.");
        return 0;
    }
    const videoInfo = await getVideoFileInfo(videoPath);
    if (videoInfo[0] === -1) {
        wxLogger.info("Parse Video Info failed.");
    } else if (videoInfo[0] === 0) {
        wxLogger.info("Parse Video Info (Play Length) failed.");
        wxLogger.info(`Video Info: size(${videoInfo[1].toFixed(2)})MB, length( PARSE FAILURE )`);
    } else if (videoInfo[0] === 1) {
        wxLogger.debug(`Video Info: size(${videoInfo[1].toFixed(2)})MB, length(${videoInfo[2]}).\n${videoInfo[3]}`);
        wxLogger.trace(`video local path for above:(${videoInfo}), more info: ${JSON.stringify(videoInfo[4])}`);
    }
    tgBotDo.SendChatAction("upload_video", msg.receiver).then(() => {});
    const stream = fs.createReadStream(videoPath);
    let tgMsg = await tgBotDo.SendVideo(msg.receiver, "", stream, true, false);
    tgBotDo.SendChatAction("choose_sticker", msg.receiver).then(() => {});
    if (!tgMsg) {
        tgLogger.warn("Got invalid TG receipt, resend wx file failed.");
        return "sendFailure";
    } else return "Success";
}

async function getVideoFileInfo(videoPath) {
    const util = require('util');
    const ffprobePath = require('ffprobe-static').path;
    const ffprobe = require('ffprobe');
    const ffprobeOptions = {path: ffprobePath};
    const statAsync = util.promisify(fs.stat);
    const ffprobeAsync = util.promisify(ffprobe);
    try {
        const stats = await statAsync(videoPath);
        const fileSizeBytes = stats.size;
        const fileSizeMB = fileSizeBytes / (1024 * 1024);

        const info = await ffprobeAsync(videoPath, ffprobeOptions);
        if (info.streams && info.streams.length > 0 && info.streams[0].duration) {
            const playlengthSeconds = parseFloat(info.streams[0].duration);
            const playlengthMinutes = Math.floor(playlengthSeconds / 60);
            const playlengthSecondsRemaining = Math.floor(playlengthSeconds % 60);
            // noinspection JSUnresolvedVariable
            const additional = `Codec: ${info.streams[0].codec_name}/${info.streams[0].codec_tag_string}, `
                + `Frame: ${info.streams[0].coded_width}x${info.streams[0].coded_height}, `
                + `Bitrate: ${parseInt(info.streams[0].bit_rate) / 1000}Kbps, ${info.streams[0].avg_frame_rate}s`;
            return [1, fileSizeMB, `${playlengthMinutes}:${playlengthSecondsRemaining}`, additional, info.streams];
        } else {
            return [0, fileSizeMB];
        }
    } catch (err) {
        return [-1, err];
    }
}

function b() {
    const {} = env;
}

function parseXML(xml) {
    const {defLogger} = env;
    return new Promise((resolve) => {
        xml2js.parseString(xml, (err, result) => {
            if (err) {
                defLogger.debug(`XML parse to dot notation failed.`);
                resolve(false);
            } else {
                resolve(result);
            }
        });
    });
}

module.exports = (incomingEnv) => {
    env = incomingEnv;
    return {handlePushMessage, handleVideoMessage};
};