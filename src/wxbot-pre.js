const {WechatyBuilder} = require('wechaty');
const qrcodeTerminal = require("qrcode-terminal");
// const config = require("../config/secret");
const secret = require("../config/secret");
const {downloader} = require("./common")();


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


module.exports = (tgbot, wxLogger) => {
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
                setTimeout(async () => {
                    if (needLoginStat === 1) {
                        with(secret.notification)await downloader.httpsCurl(baseUrl + prompt_relogin_required + default_arg);
                        wxLogger.info(`Already send re-login reminder to user.`);
                    } else {

                    }
                }, 30000);
            }

        } else if (status === 3) {
            console.log(`-----The code is already scanned.\n${qrcodeImageUrl}`);
            needLoginStat = 0;
        } else {
            console.log(`User may accepted login. Proceeding...`);
        }
    });


    wxbot.on('logout', async (user) => {
        wxLogger.info(`${user} 已经主动登出.`);
    });

    wxbot.on('error', async (e) => {
        wxLogger.warn(e.toString());
    });

    return {
        wxbot: wxbot,
        DTypes: DTypes,
    };
};
