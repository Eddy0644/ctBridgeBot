// noinspection SpellCheckingInspection
// -------------
// Configuration File, updated upon every version update:
module.exports = {
    ctToken: '',
    tgbot: {
        botToken: '5000:ABCDE',
        botName: '@your_bot_username_ending_in_bot',
        tgAllowList: [5000000001],
        webHookUrlPrefix: 'https://baidu.com/webHook',
        statusReport: {
            switch: "off",
            host: "your.domain",
            path: "/ctBot/rp.php"
        },
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
                "wx": ["wx Contact 1's name", true],
                "flag": "",
            },
        ],
    },
    filtering: {
        wxFindNameReplaceList: [
            ["ShortenedName1", "OriginalName1"],
        ],
        wxContentReplaceList: [
            ["[Pout]", "{😠}"],
            ["[Facepalm]", "{😹}"],
            ["[Hurt]", "{😭}"],
        ],
        tgContentReplaceList: [
            ["😡", "[Pout]"],
            ["😄", "[Doge]"],
            ["😏", "[Onlooker]"],
        ],
        wxNameExcludeKeyword: [
            "美团",
        ],
        wxMessageExcludeKeyword: [],
        wxPostOriginBlackList: [
            "不接收消息的订阅号名称列表",
        ],
    },
    notification: {
        baseUrl: "https://(YourBarkAddress)/BridgeBot_WARN[ct]/",
        default_arg: "?group=ctBridge",
        prompt_network_problematic: "Several network connectivity problems have been noticed. Please settle that immediately.",
        prompt_relogin_required: "Your previous login credential have already expired. Please re-login soon.",
        prompt_network_issue_happened: "ctBridgeBot is expericing network issue!",
        incoming_call_webhook: name => `https://(YourBarkAddress)/BridgeBotCall/You have a incoming call from ${encodeURIComponent(name)} In WeChat.?sound=minuet&level=timeSensitive&group=ctBridge`,
    },
    misc: {
        enableInlineSearchForUnreplaced: true,

        // s=false, no title-changing;
        // s=<string>, use customized new-title as [1] specified;
        // s=<function>, the func. would be executed with parameter 'count'
        changeTitleForSameTalkerInMergedRoomMsg: c => `<code>${c}|→</code> `,

        // s=false, no delivery
        // s=true, send to Push channel
        // s=<tgTargetObj>, send to this target
        deliverPushMessage: true,
        deliverStickerSeparately: {tgid: -100000, threadId: 777},
        StickerUrlPrefix: "https://t.me/c/000/777/",
        addSelfReplyTimestampToRoomMergedMsg: false,
    },
    txyun: {
        switch: "off",
        secretId: "---",
        secretKey: "---",
    },
    upyun: {
        switch: "off",
        password: "----",
        webFilePathPrefix: "/Bucket____name/ctBotAsset/stickerTG",
        urlPathPrefix: "/ctBotAsset/stickerTG",
        operatorName: "----",
        urlPrefix: "https://---.test.upcdn.net"
    }
};