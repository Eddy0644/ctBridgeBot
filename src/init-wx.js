const {WechatyBuilder} = require('wechaty');
const {WechatferryPuppet} = require('../wcferry-puppet-c');
// const {WechatferryPuppet} = require('@wechatferry/puppet');
const qrcodeTerminal = require("qrcode-terminal");
// const config = require("../config/secret");
const secret = require("../config/confLoader");
const {downloader} = require("./common")();
const fs = require("fs");

const wxbot = WechatyBuilder.build({
    puppet: new WechatferryPuppet()
    // name: 'data/ctbridgebot',
    // puppet: 'wechaty-puppet-wechat',
    // puppetOptions: {uos: true}
});
const DTypes = {
    Default: -1,
    NotSend: 0,
    Text: 1,
    Image: 2,
    Audio: 3,
    CustomEmotion: 4,
    File: 5,
    Push: 6,
};

module.exports = (tgBotDo, wxLogger) => {
    // running instance of wxbot-pre
    let needLoginStat = 0;
    wxbot.on('scan', async (qrcode, status) => {
        const qrcodeImageUrl = [
            'https://api.qrserver.com/v1/create-qr-code/?data=',
            encodeURIComponent(qrcode),
        ].join('');
        if (status === 2) {
            qrcodeTerminal.generate(qrcode, {small: true}); // show QRcode in terminal
            console.log(qrcodeImageUrl);
            // if need User Login
            if (needLoginStat === 0) {
                needLoginStat = 1;
                const isUserTriggeredRelogin = fs.existsSync("data/userTriggerRelogin.flag");
                setTimeout(async () => {
                    if (needLoginStat === 1) {
                        if (secret.notification.send_relogin_via_tg) await tgBotDo.SendMessage(null,
                          `${secret.c11n.wxLoginQRCodeHint}\n${qrcodeImageUrl}`, false, "HTML");
                        if (!isUserTriggeredRelogin) with (secret.notification) await downloader.httpsCurl(baseUrl + prompt_relogin_required + default_arg);
                        wxLogger.info(`Login notification has been delivered to user.`);
                    }
                }, isUserTriggeredRelogin ? 500 : 27000);
                // delete the flag file after sent notification.
                if (isUserTriggeredRelogin) fs.unlinkSync("data/userTriggerRelogin.flag");
            }

        } else if (status === 3) {
            wxLogger.info(`------[The code is already scanned.]------`);
            needLoginStat = 0;
        } else {
            console.log(`User may accepted login. Continue listening...`);
        }
    });

    // wxbot.on('logout', ...) is defined in BotIndex.js.

    let wxBotErrorStat = 0;
    wxbot.on('error', async (e) => {
        // This error handling function should be remastered!
        // TODO add tg reminder; to wxbot.error
        const conf1 = secret.misc.auto_reboot_after_error_detected;
        let msg = e.toString();
        const isWDogErr = e.toString().includes("WatchdogAgent reset: lastFood:");
        if (wxBotErrorStat === 0 && isWDogErr) {
            wxBotErrorStat = 1;
            // No need to output any console log now, full of errors!
            with (secret.notification) await downloader.httpsCurl(baseUrl + prompt_wx_stuck + default_arg);
            wxLogger.error(msg + `\nFirst Time;\n\n\n\n`);
            setTimeout(() => {
                if (wxBotErrorStat > 6) {
                    wxLogger.error(`Due to wx error, initiated self restart procedure! (If activated)\n\n`);
                    if (conf1) setTimeout(() => process.exit(1), 2000);
                } else {
                    wxLogger.info("wxBotErrorStat not reaching threshold, not exiting.\t" + wxBotErrorStat);
                }
            }, 20000);
        } else if (wxBotErrorStat > 0 && isWDogErr) {
            wxBotErrorStat++;
            // following watchdog error, skipped
        } else {
            if (msg.includes("TypeError: Cannot read properties of null (reading 'userName')")) return wxLogger.debug("Dropped an error produced by a WXWork message (not implemented).");
            if (msg.includes("SIGINT")) return; // means that user stopped the program.
            wxLogger.warn(`[From Puppet] ` + msg);
            wxLogger.debug(`[Stack] ${e.stack.split("\n").slice(0, 5).join("\n")}\nSee log file for detail.`);

        }
    });

    return {
        wxbot: wxbot,
        DTypes: DTypes,
    };
};
