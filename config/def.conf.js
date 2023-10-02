// noinspection SpellCheckingInspection
// -------------
// Configuration File, updated upon every version update:
module.exports = {
    ctToken: 'EnterYourCtTokenHere',
    tgbot: {
        botToken: '5000:ABCDE',
        botName: '@your_bot_username_ending_in_bot',
        tgAllowList: [5000000001],
        webHookUrlPrefix: 'https://your.domain/webHook',
        statusReport: {
            switch: "off",
            host: "your.domain",
            path: "/ctBot/rp.php"
        },
        polling: {
            pollFailNoticeThres: 3,
            interval: 2000,
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
            ["😭😭", "[Hurt]"],
            ["😏", "[Onlooker]"],
            ["😣", "[Panic]"],
            ["😮‍💨", "[Sigh]"],
        ],
        wxNameFilterStrategy: {
            useBlackList: true,
            blackList: [
                "美团",
            ],
            whiteList: [],
        },
        wxMessageExcludeKeyword: [],
        wxPostOriginBlackList: [
            "不接收消息的订阅号名称列表",
        ],
    },
    notification: {
        // Remember to change the two '(YourBarkAddress)'!
        // Maybe you could use apis provided by 'api.day.app', from the Bark developer.
        baseUrl: "https://(YourBarkAddress)/BridgeBot_WARN[ct]/",
        default_arg: "?group=ctBridge&icon=https://ccdn.ryancc.top/bot.jpg",
        prompt_network_problematic: "Several network connectivity problems appeared. Please settle that immediately.",
        prompt_relogin_required: "Your previous login credential have already expired. Please re-login soon!",
        prompt_network_issue_happened: "ctBridgeBot is facing network issue, that causing message delay!",
        incoming_call_webhook: name => `https://(YourBarkAddress)/BridgeBot_Call/You have a incoming call from ${encodeURIComponent(name)} In WeChat.?sound=minuet&level=timeSensitive&group=ctBridge&icon=https://ccdn.ryancc.top/call.jpg`,
        send_relogin_via_tg: 1,

    },
    misc: {
        enableInlineSearchForUnreplaced: true,

        // define how many seconds between this and last msg, to stop merging
        mergeResetTimeout: {
            forPerson: 20,
            forGroup: 80,
        },

        // s=false, no delivery
        // s=true, send to Push channel
        // s=<tgTargetObj>, send to this target
        deliverPushMessage: true,

        // as there are additional information, this section can NOT be set to 'true'.
        deliverSticker: {
            tgid: -100000, threadId: 777,
            urlPrefix: "https://t.me/c/000/777/",
        },

        // 0, no advance (default); 1, only not filtered; 2, apply on all room chats
        deliverRoomRedPacketInAdvance: 2,

        // If set to false, all post message will no longer save to log,
        // as only one of posts would take up to 40KB in log file.
        savePostRawDataInDetailedLog: false,

        // -1: no add; 0: only add to wx Link; 1: add to wx Link and text link
        addHashCtLinkToMsg: 1,

        wxMsgBufferPool: {
            // !Not implemented
            switch: "on",
            // switch pool when items exceeds __ num
            itemTrig: 10,
            // switch pool when time expired __s
            timeTrig: 30,
        },
        // 1: pass unrecognized cmd; 0: return
        passUnrecognizedCmdNext: 1,

        /////////--------[  Advanced Misc Setting, less need to edit  ]--------//////////

        // How many 5-seconds should system wait before auto cancel /drop_on command.
        keep_drop_on_x5s: 100,
        // This variable is deprecated, therefore not recommended to change.
        addSelfReplyTimestampToRoomMergedMsg: false,

        wxAutoDownloadSizeThreshold: 3 * 1048576,
        tgCmdPlaceholder: `Start---\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\nStop----`,

    },
    c11n: {  // customization
        // 🖇🧷💬 (Quoted "${content}" of ${from})
        wxQuotedMsgSuffixLine: (from, content) => `<i>(${from}💬${content})</i>\``,
        // Define what prefix should be added to each merged msg item.
        // s=false, no title-changing;
        // s=<function>, would be executed with parameter 'count' and taken return value
        titleForSameTalkerInMergedMsg: c => `<code>${c}|→</code> `,
        //
        systemMsgTitleInRoom: "(System)",
        // If a sticker with former delivery found, then run this func to get formatted text.
        stickerWithLink: (url_p, flib, md5) => flib.hint ?
            `🌁(<code>${md5}</code>) <i>${flib.hint}</i>` : `<a href="${url_p}${flib.msgId}">🌁(${md5})</a>`,
        // If you want to disable any of these replacements here,
        // please search for 'secret.misc.titles' in BotIndex.js and put corresponding
        // original text here (wrapped with []), to suppress replacing here.
        unsupportedSticker: "{--🧩--}",
        recvCall: "{📞📲}",
        recvTransfer: "{💰📥}",
        msgTypeNotSupported: "{📩❎, 👉📱}",
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
        operatorName: "----",
        urlPrefix: "https://---.test.upcdn.net",
        urlPathPrefix: "/ctBotAsset/stickerTG"
    }
};