const {WechatyBuilder} = require('wechaty');
const qrcodeTerminal = require("qrcode-terminal");
const config = require("../config/secret");
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
};


module.exports = (tgbot, wxLogger) => {

    // 二维码生成
    wxbot.on('scan', async (qrcode, status) => {
        const qrcodeImageUrl = [
            'https://api.qrserver.com/v1/create-qr-code/?data=',
            encodeURIComponent(qrcode),
        ].join('');
        if (status === 2) {
            qrcodeTerminal.generate(qrcode, {small: true}); // 在console端显示二维码
            console.log(qrcodeImageUrl);
        } else if (status === 3) {
            console.log(`The code is already scanned.\n${qrcodeImageUrl}`);
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
        DTypes: DTypes
    };
};
