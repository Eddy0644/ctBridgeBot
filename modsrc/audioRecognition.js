const fs = require("fs");
const tencentcloud = require("tencentcloud-sdk-nodejs-asr");
const AsrClient = tencentcloud.asr.v20190614.Client;

let env;

// async function a() {
//     const {} = env;
// }
//
// function b() {
//     const {} = env;
// }

async function VTT_by_tx(audioPath, voiceFormat = "mp3") {
    const {secret, defLogger} = env;
    try {
        // 尝试调用腾讯云一句话识别API自动转文字（准确率略低于wx）
        const client = new AsrClient({
            credential: secret.txyun_credential,
            region: "",
            profile: {
                httpProfile: {
                    endpoint: "asr.tencentcloudapi.com",
                },
            },
        });
        const base64Data = (await fs.promises.readFile(audioPath)).toString('base64');
        const fileSize = (await fs.promises.stat(audioPath)).size;
        const result = await client.SentenceRecognition({
            "SubServiceType": 2,
            "EngSerViceType": "16k_zh_dialect",
            "SourceType": 1,
            "VoiceFormat": voiceFormat,
            "Data": base64Data,
            "DataLen": fileSize
        });
        defLogger.trace(`VTT success, content:{${result.Result}`);
        return result.Result;
    } catch (e) {
        defLogger.debug(`Try to send audio file to Txyun but failed in the process.`);
        return "ERR!.";
    }
}

async function wx_audio_VTT(saveTarget, audioPath, voiceFormat = "mp3") {
    const result = await VTT_by_tx(audioPath, "mp3");
    if (result !== "ERR!.") {
        saveTarget.audioParsed = `, recognition:\n"${result}"`;
    } else saveTarget.audioParsed = "";
}

async function tg_audio_VTT(audioPath) {
    const {defLogger} = env;
    const result = await VTT_by_tx(audioPath, "ogg-opus");
    if (result !== "ERR!.") {
        defLogger.trace(`Transcript result: ${result}`);
        return result;
    } else return "";
}

module.exports = (incomingEnv) => {
    env = incomingEnv;
    return {wx_audio_VTT, tg_audio_VTT};
};