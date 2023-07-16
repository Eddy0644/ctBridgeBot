const xml2js = require("xml2js");
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
    return {handlePushMessage};
};