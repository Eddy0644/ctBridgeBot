// noinspection SpellCheckingInspection
// -------------
// Configuration File, updated upon every version update:
module.exports = {
    ctToken: 'EnterYourCtTokenHere##############',
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
        // Below is a more recommended way for defining a supergroup containing many different chats.
        "C2C_generator": {
            // If you want to use `/create_topic` then remind the order of tgids, and the position of anchor.
            "-1001888888888": [
                /* |autoCreateTopic Anchor| */
                [1, "name of group 1", "Group", "flags_here"],
                [4, "name of person 1", "Person", ""],
            ],
        },
    },
    filtering: {

        // Use this, only if you didn't bind some contacts in C2C, but you often chat with them.
        // Now this option is NOT recommended to use, unless you'll use find function very often.
        wxFindNameReplaceList: [
            //["Shortened Name 1", "Original Name 1"],
        ],
        // mainly used to replace wx-side emoji to universal emoji
        wxContentReplaceList: [
            ["[Pout]", "{😠}"],
            ["[Facepalm]", "{😹}"],
            ["[Hurt]", "{😭}"],
        ],
        // mainly used to replace universal emoji to wx-side emoji
        tgContentReplaceList: [
            ["😡", "[Pout]"],
            ["😄", "[Doge]"],
            ["😏", "[Onlooker]"],
            ["😣", "[Panic]"],
            ["😮‍💨", "[Sigh]"],
        ],
        wxNameFilterStrategy: {
            // You can choose to use either 'blackList' or 'whiteList' (only one can be activated at a time)
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
        prompt_wx_stuck: "The WX puppet seems stuck, please check console or start program soon!",
        prompt_network_issue_happened: "ctBridgeBot is facing network issue, that causing message delay!",
        incoming_call_webhook: name => `https://(YourBarkAddress)/BridgeBot_Call/You have a incoming call from ${encodeURIComponent(name)} In WeChat.?sound=minuet&level=timeSensitive&group=ctBridge&icon=https://ccdn.ryancc.top/call.jpg`,
        send_relogin_via_tg: 1,

    },
    misc: {
        /* ------------ [ Delivery Options ] ------------ */

        // s=false, no delivery
        // s=true, send to Push channel [defined in 'root.class']
        // s=<tgTargetObj>, send to this target
        deliverPushMessage: true,

        // This option defines where WeChat stickers will settle down.
        // It is recommended to create another new group chat to hold it.
        // as there are additional information, this section can NOT be set to <true>.
        // either an object like below, or a simple <false>.
        deliverSticker: {
            tgid: -100000, threadId: 777,
            urlPrefix: "https://t.me/c/000/777/",
        },

        // 0, no advance (default); 1, only when not being filtered; 2, apply on all room chats
        deliverRoomRedPacketInAdvance: 2,

        /* ------------ [ Merging Options ] ------------ */

        // define how many seconds between this and last msg, to stop merging
        mergeResetTimeout: {
            forPerson: 20,
            forGroup: 80,
        },
        // this option defines how many messages should be merged into single TG message at most,
        // in time span(started from the first message), media count(as so many media will let the text going far away),
        // and total message count. When any of them matched, the merge will be restarted.
        onceMergeCapacity: {
            timeSpan: 15 * 60 * 60,
            mediaCount: 5,
            messageCount: 50,
        },

        /* ------------ [ Debug Options ] ------------ */

        // If you want to use /eval in tg commands, then set this to <true>.
        // WARNING this may be a security risk, as it allows arbitrary code execution.
        debug_evalEnabled: false,

        // Set either to display related message about your ctToken, set to 0 to depress.
        display_ctToken_info: 1,

        // The level of debug timers you want to see in console, which are used to measure operation time.
        // Currently only 1 or 0 is accepted.
        debug_add_console_timers: 1,

        // If you want to override /help return text, change this to a function like common.js/TGBotHelpCmdText.
        // Please remind if you do so, then for new commands you must add them manually to /help text.
        override_help_text: false,

        /* ------------ [  ] ------------ */

        // If set to <false>, all post message will no longer be copied to log,
        // as only a single post would take up to 40KB in log file.
        // If you have spare disk space, why not keep these stuff? [lol]
        savePostRawDataInDetailedLog: false,

        // This option is designed to separate authentic links from fake links like Sticker Pointer.
        // -1: no addition; 0: only add to wx Link; 1: add to wx Link and text link
        addHashCtLinkToMsg: 0,

        // This option defines how the program behaviors when it encounters unrecognized tg command.
        // 1: will not be recognized as command; send to your chat peer; 0: do nothing and won't be sent to WeChat.
        passUnrecognizedCmdNext: 1,

        // This option defined what service should be used to convert tg_sticker.webp to gif
        // 0 means bypass and will send .webp directly to WeChat;
        // 1 means using upyun Object Storage as image converter, not suggested by now;
        // 2 means using local node module 'sharp' to convert.
        // Note that this module requires Node.js(^18.17.0 or >= 20.3.0) and libvips, which may be unavailable for some users.
        // So we offered a switch here. And, as for now, when sharp is not available, we will fall back to {1}.
        service_type_on_webp_conversion: 2,

        // This option defines whether to add a time-based identifier to media messages inside a merged message.
        // 0 means disable; 1 means only for group chats; 2 means for all chats.
        add_identifier_to_merged_image: 1,

        /////////--------[  Advanced or deprecated Setting, less need to edit  ]--------//////////

        // Interval between each automatic status report [to Console].
        status_report_interval: 4 * 3600,
        // How many 5-seconds should system wait before auto cancel /drop_on command.
        keep_drop_on_x5s: 100,
        // This variable is deprecated, therefore not recommended to change.
        addSelfReplyTimestampToRoomMergedMsg: false,
        // This option is also limited by TG bot API, so cannot be much larger.
        wxAutoDownloadSizeThreshold: 3 * 1048576,
        tgCmdPlaceholder: `Start---\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\nStop----`,

        enableInlineSearchForUnreplaced: true,
        // Determine whether the first item in a merged person msg should have a title of timestamp,
        // <true> be like: [11:00:00] a \n[11:00:02] b
        PutStampBeforeFirstMergedMsg: false,
        wxMsgBufferPool: {
            // !Not implemented; DO NOT USE now
            switch: "on",
            // switch pool when items exceeds __ num
            itemTrig: 10,
            // switch pool when time expired __s
            timeTrig: 30,
        },
    },
    chatOptions: {
        // this section declares default behaviors of chats when not specified in C2C flag.
        // Notice: for boolean variables, set to exactly 0 to explicitly disable!

        // whether accept *-prefix in TG message as indicator of not forwarding to WX
        "mixed": 1,
        // whether merge WX-side messages by default
        "merge": 1,
        // whether skip all sticker delivery by default
        "skipSticker": 0,
        // which name should be used as title of a person in a room chat,
        // 0 means their WeChat name, 1 means your alias for talker, 2 means their group alias.
        "nameType": 0,

    },
    c11n: {  // customization

        // 🖇🧷💬 (Quoted "${content}" of ${from})
        wxQuotedMsgSuffixLine: (from, content) => `<i>(${from}💬${content})</i>\``,
        // Define what prefix should be added to each merged msg item.
        // s=false, no title-changing;
        // s=<function>, would be executed with parameter 'count' and taken return value
        titleForSameTalkerInMergedRoomMsg: c => `<code>${c}|→</code> `,

        // For person chat, if wx-side msg have quoted msg, then we'll use these two nickname to replace the raw contact name.
        // Or, set this to null, to disable this feature.
        quotedMsgSuffixLineInPersonChat: ["YOU", "ta"],

        officialAccountParser: a => `[Official Account <a href="${a.smallheadimgurl}">Card</a>]${a.nickname} , from ${a.province} ${a.city}, operator ${a.certinfo || ""}`,
        personCardParser: a => `📇[Person <a href="${a.smallheadimgurl}">Card</a>]${a.nickname} , from ${a.province} ${a.city}, sex ${a.sex === 1 ? "Male" : (a.sex === 0 ? "(Female)?" : "")}`,

        // what nickname will system message use in group show up, like tickle message.
        systemMsgTitleInRoom: "(System)",
        // If a sticker with former delivery found, then run this func to get formatted text.
        stickerWithLink: (url_p, flib, md5) => flib.hint ?
          `🌁(<code>${md5}</code>) <i>${flib.hint}</i>` : `<a href="${url_p}${flib.msgId}">🌁(${md5})</a>`,
        stickerSkipped: md5 => `[Sticker](${md5})`,
        // What should display when new topic created automatically.
        newTopicCreated: () => `📌Topic Created.\nYour conversation starts here.`,

        // better keep an extra space at the end, if `add_identifier_to_merged_image` is on.
        C2C_group_mediaCaption: name => `from [${name}] `,

        // If you want to disable any of these replacements here,
        // please search for 'secret.misc.titles' in BotIndex.js and put corresponding
        // original text here (wrapped with []), to disable replacement here.
        unsupportedSticker: "{-🧩-}",
        recvCall: "{📞📲}",
        recvSplitBill: "{💰✂️📥, 👋}",
        recvTransfer: "{💰📥}",
        acceptTransfer: "{💰📥, ✅}",
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