// noinspection SpellCheckingInspection

module.exports = {
    botToken: '5000:ABCDE',
    webHookUrlPrefix: 'https://www.gov.cn/webHook',
    txyun_credential: {
        secretId: "",
        secretKey: "",
    },
    target_TG_ID: 55012345678900,
    upyun: {
        password: "operator_password",
        webFilePathPrefix: "/BUCKETNAME/ctBotAsset/stickerTG",
        urlPathPrefix: "{webFilePathPrefix}-'/BUCKETNAME'",
        operatorName: "opName",
        urlPrefix: "https://000.test.upcdn.net"
    },
    class: {
        "def": {
            "tgid": -100000,
        },
        "push": {
            "tgid": -10000,
        },
        "C2C": [
            {
                "tgid": -1001006,
                "wx": ["wx Contact 1", true],
                "flag": "",
            },
        ],
    },

    nameFindReplaceList: [
        ["Shortened1", "OriginalName1"],
        // ["",""],
    ],
    wxContentReplaceList: [
        ["[Pout]", "{😠}"],
        ["[Facepalm]", "{😹}"],
        ["[Hurt]", "{😭}"],
    ],
    tgContentReplaceList: [
        ["😡", "[Pout]"],
        ["😄", "[Doge]"],
        ["😭😭", "[Hurt]"],
        ["😏", "[Onlooker]"],
        ["😣", "[Panic]"],
        ["😮‍💨", "[Sigh]"],
    ],
    nameExcludeKeyword: [
        "美团", "..."
    ],
    messageExcludeKeyword: [],
    notification: {
        baseUrl: "https://(YourBarkAddress)/BridgeBotWarning[ct]/",
        prompt_network_problematic: "Several network connectivity problems have been noticed. Please settle that immediately.",
        prompt_relogin_required: "Your previous login credential have already expired. Please re-login soon.",
        incoming_call_webhook: name => `https://(YourBarkAddress>)/BridgeBotCall/You have a incoming call from ${encodeURIComponent(name)} In WeChat.?sound=minuet`,

    },
    settings: {
        "enableInlineSearchForUnreplaced": true,

        // s=false, no title-changing;
        // s=<string>, use customized new-title as [1] specified;
        // s=<function>, the func. would be executed with parameter 'count'
        "changeTitleForSameTalkerInMergedRoomMsg": c => `<code>${c}|→</code> `,

        // s=false, no delivery
        // s=true, send to Push channel
        // s=<tgTargetObj>, send to this target
        "deliverPushMessage": true,
        "deliverStickerSeparately": {tgid: -100000, threadId: 777},
        "StickerUrlPrefix": "https://t.me/c/1944729618/777/",

        "wxPostOriginBlackList": [
            "不接收消息的订阅号",
        ],
        "addSelfReplyTimestampToRoomMergedMsg": false,
    }
}
