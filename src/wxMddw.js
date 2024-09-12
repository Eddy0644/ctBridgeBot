const xml2js = require("xml2js");
const dayjs = require("dayjs");
const fs = require("fs");
const secret = require("../config/confLoader");


let env;

// async function a() {
//     const {} = env;
// }

async function handlePushMessage(rawContent, msg, name) {
    const {wxLogger, secret} = env;

    if (secret.filtering.wxPostOriginBlackList.some(i => name.includes(i))) {
        // wxLogger.debug(`This Post matches BlackList, no delivery!`);
        wxLogger.debug(`[${name}] Posted [${msg.payload.filename.replace(".49", "")}], ❎(BlackList)`);
        return 0;
    }
    if (secret.misc.deliverPushMessage === false) {
        wxLogger.debug(`[${name}] Posted [${msg.payload.filename.replace(".49", "")}], ❎(denial config)`);
        // wxLogger.debug(`A Post Collection from (${name}) is skipped by denial config.`);
        return 0;
    }
    const ps = await parseXML(rawContent.replaceAll("&lt;", "<").replaceAll("&gt;", ">").replaceAll("<br/>", "\n"));
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
            itemStr += `→ <a href="${url[0]}">${title[0]}</a>`;
            if (is_pay_subscribe[0] !== '0') itemStr += `\n  <b>[Pay Subscribe Post]</b>`;
            // if (digest[0].length > 1) itemStr += `  <i>${digest[0]}</i>\n`;
            if (digest[0].length > 85) itemStr += `  <blockquote expandable>${digest[0]}</blockquote>`;
            else if (digest[0].length > 1) itemStr += `  <blockquote>${digest[0]}</blockquote>`;
            else itemStr += "\n";
            out += itemStr;
        }
        // Success
        {
            const s = secret.misc.deliverPushMessage;
            if (s === true) msg.receiver = secret.class.push;
            if (s.tgid) msg.receiver = s;
        }
        return out.replaceAll("&amp;", "&");
    } catch (e) {
        wxLogger.info(`Error occurred when reading xml detail. Skipping...`);
        return 0;
    }
}

async function parseCardMsg(rawContent, isOfficial = true) {
    const {wxLogger, secret} = env;
    const ps = await parseXML(rawContent.replaceAll("&lt;", "<").replaceAll("&gt;", ">").replaceAll("<br/>", ""));
    if (ps === false) return rawContent;
    // noinspection JSUnresolvedVariable
    try {
        // TODO brandSubscriptConfigUrl
        if (isOfficial) return secret.c11n.officialAccountParser(ps.msg.$);
        else return secret.c11n.personCardParser(ps.msg.$);
    } catch (e) {
        wxLogger.info(`Error occurred when reading xml detail of AccountCard_Msg. Skipping...`);
        return rawContent;
    }
}


async function handleVideoMessage(msg, name) {
    const {wxLogger, tgBotDo, tgLogger} = env;
    let videoPath = `./downloaded/video/${dayjs().format("YYYYMMDD-HHmmss").toString()}-(${name.replaceAll(/[\/\\]/g, ",")}).mp4`;
    wxLogger.debug(`Detected as Video, Downloading...`);
    tgBotDo.SendChatAction("record_video", msg.receiver).then(tgBotDo.empty)
    const fBox = await msg.toFileBox();
    await fBox.toFile(videoPath);
    if (!fs.existsSync(videoPath)) {
        wxLogger.info("Download Video failed. Please remind the console.");
        return 0;
    }
    const videoInfo = await getVideoFileInfo(videoPath);
    if (videoInfo[0] === -1) {
        wxLogger.info("Parse Video Info failed.\n" + videoInfo[2]);
    } else if (videoInfo[0] === 0) {
        if (videoInfo[2] === "NOMODULE") wxLogger.warn("Error occurred when loading ffprobe-related modules. We'll try to send the video directly.");
        wxLogger.info("Parse Video Info (Play Length) failed.");
        wxLogger.debug(`Video Info: size(${videoInfo[1].toFixed(2)})MB, length( PARSE FAILURE )`);
    } else if (videoInfo[0] === 1) {
        wxLogger.debug(`Video Info: size(${videoInfo[1].toFixed(2)})MB, length(${videoInfo[2]}).\n${videoInfo[3]}`);
        wxLogger.trace(`video local path for above:(${videoInfo}), more info: ${JSON.stringify(videoInfo[4])}`);
    }
    if (videoInfo[1] > 49) return "sizeLimit";
    tgBotDo.SendChatAction("upload_video", msg.receiver).then(tgBotDo.empty)
    const stream = fs.createReadStream(videoPath);
    let tgMsg = await tgBotDo.SendVideo(msg.receiver, `from [${name}]`, stream, true);
    tgBotDo.SendChatAction("choose_sticker", msg.receiver).then(tgBotDo.empty)
    if (!tgMsg) {
        tgLogger.warn("Got invalid TG receipt, resend wx file failed.");
        return "sendFailure";
    } else return "Success";
}

async function getVideoFileInfo(videoPath) {
    let included = 0, fileSizeMB = -1;
    try {
        const util = require('util');
        const statAsync = util.promisify(fs.stat);
        const stats = await statAsync(videoPath);
        const fileSizeBytes = stats.size;
        fileSizeMB = fileSizeBytes / (1024 * 1024);

        const ffprobePath = require('ffprobe-static').path;
        const ffprobe = require('ffprobe');
        const ffprobeOptions = {path: ffprobePath};
        const ffprobeAsync = util.promisify(ffprobe);

        // included = 1;

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
        return [!included ? 0 : -1, fileSizeMB, !included ? "NOMODULE" : err];
    }
}

// function b() {
//     const {} = env;
// }

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
    return {handlePushMessage, handleVideoMessage, parseCardMsg};
};
