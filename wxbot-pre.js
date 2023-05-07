const {WechatyBuilder} = require('wechaty');
const qrcodeTerminal = require("qrcode-terminal");
const config = require("./config/secret");
const wxbot = WechatyBuilder.build({
    name: 'WechatBotV1',
    puppet: 'wechaty-puppet-wechat', // 如果有token，记得更换对应的puppet
    puppetOptions: {uos: true}
})



module.exports = (tgbot,wxLogger)=>{

    // 二维码生成
    wxbot.on('scan', async (qrcode, status)=>{
        qrcodeTerminal.generate(qrcode, {small: true}); // 在console端显示二维码
        const qrcodeImageUrl = [
            'https://api.qrserver.com/v1/create-qr-code/?data=',
            encodeURIComponent(qrcode),
        ].join('');
        console.log(qrcodeImageUrl);
    });


    wxbot.on('logout', async (user)=>{
        wxLogger.info(`${user} 已经登出.`);
    });

    return wxbot;
};
