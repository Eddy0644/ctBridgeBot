const {WechatyBuilder} = require('wechaty');
const qrcodeTerminal = require("qrcode-terminal");
// const config = require("../config/secret");
const secret = require("../config/confLoader");
const {downloader} = require("./common")();
const fs = require("fs");

const wxbot = WechatyBuilder.build({
    name: 'ctbridgebot',
    puppet: 'wechaty-puppet-wechat', // 如果有token，记得更换对应的puppet
    puppetOptions: {uos: true}
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
    // 二维码生成
    wxbot.on('scan', async (qrcode, status) => {
        const qrcodeImageUrl = [
            'https://api.qrserver.com/v1/create-qr-code/?data=',
            encodeURIComponent(qrcode),
        ].join('');
        if (status === 2) {
            qrcodeTerminal.generate(qrcode, {small: true}); // 在console端显示二维码
            console.log(qrcodeImageUrl);
            // Need User Login
            if (needLoginStat === 0) {
                needLoginStat = 1;
                const isUserTriggeredRelogin = fs.existsSync("userTriggerRelogin.flag");
                setTimeout(async () => {
                    if (needLoginStat === 1) {
                        if (secret.notification.send_relogin_via_tg) await tgBotDo.SendMessage(null,
                            `Your WX credential expired, please refer to log or go with this [QRServer] link:\t\n${qrcodeImageUrl}`, false, "HTML");
                        if (!isUserTriggeredRelogin) with (secret.notification) await downloader.httpsCurl(baseUrl + prompt_relogin_required + default_arg);
                        wxLogger.info(`Already send re-login reminder to user.`);
                    }
                }, isUserTriggeredRelogin ? 500 : 27000);
            }

        } else if (status === 3) {
            console.log(`-----The code is already scanned.\n${qrcodeImageUrl}`);
            needLoginStat = 0;
        } else {
            console.log(`User may accepted login. Proceeding...`);
        }
    });

    // wxbot.on('logout', ...) defined in BotIndex.js.

    let wxBotErrorStat = 0;
    wxbot.on('error', async (e) => {
        // This error handling function should be remastered!
        let msg = e.toString();
        const isWDogErr = e.toString().includes("WatchdogAgent reset: lastFood:");
        if (wxBotErrorStat === 0 && isWDogErr) {
            wxBotErrorStat = 1;
            // No need to output any console log now, full of errors!
            with (secret.notification) await downloader.httpsCurl(baseUrl + prompt_wx_stuck + default_arg);
            wxLogger.error(msg + `\nFirst Time;`);
            setTimeout(() => {
                if (wxBotErrorStat > 12) {
                    wxLogger.error(`Due to wx error, initiated self restart procedure!!!\n\n`);
                    setTimeout(() => process.exit(1), 5000);
                } else {
                    wxLogger.info("wxBotErrorStat not reaching threshold, not exiting." + wxBotErrorStat);
                }
            }, 10000);
        } else if (wxBotErrorStat > 0 && isWDogErr) {
            wxBotErrorStat++;
            // following watchdog error, skipped
        } else {
            wxLogger.warn(msg);
        }
    });

    return {
        wxbot: wxbot,
        DTypes: DTypes,
    };
};
