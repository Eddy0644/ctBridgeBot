// noinspection SpellCheckingInspection
// -------------
// Configuration File, updated upon every version update:

// Instruction:
// The following abbreviation is used:
// - wx: WeChat; tg: Telegram; tg cmds: Telegram Bot Commands; ct: ctBridgeBot; C2C: 'Chat to Chat'; tgid: Telegram Chat ID;
// And inside 'user.conf.js', please just copy any part if modified by you, the two config files would be added together.

module.exports = {
    ctToken: 'EnterYourCtTokenHere##############',
    tgbot: {
        botToken: '5000:ABCDE',
        botName: '@your_bot_username_ending_in_bot',
        tgAllowList: [5000000001],
        webHookUrlPrefix: 'https://your.domain/webHook',
        statusReport: {
            // Status Report Page function, see detail in docs. Not essential for most users.
            switch: "off",
            host: "your.domain",
            path: "/ctBot/rp.php"
        },
        polling: {
            pollFailNoticeThres: 3,
            // Polling interval, which determines how often the bot checks for new messages on tg.
            // Set to smaller values (in ms) to get faster response, but it may cause tg API rate limit.
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
                [1, "name of group 1 in wechat", "Group", "flags_here_if_you_need_it"],
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
        // Show additional processing intermediates in logfile. Default off to reduce user disk I/Os.
        debug_show_additional_log: 0,

        /* ------------ [  ] ------------ */

        // If set to <false>, all post message (from subscribed official account) won't be copied to log,
        // as only a single post would take up to 40KB in log file.
        // If you have spare disk space, why not keep these stuff? [lol]
        savePostRawDataInDetailedLog: false,

        // This option is designed to separate authentic links from fake links like Sticker Pointer.
        // -1: no addition; 0: only add to wx Link; 1: add to wx Link and text link
        addHashCtLinkToMsg: 0,

        // This option defines how the program behaviors when it encounters unrecognized tg command.
        // 1: will be sent to your chat peer directly; 0: do nothing and won't be sent to WeChat.
        // PS: If you always click button or link to use tg commands rather than typing them, then set to 1 to avoid your messages started with '/' not being delivered.
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

        // This option defines an array of group names, messages in each of them will be delivered to telegram,
        // without checking if the message was sent by yourself on other devices.
        // By using this, you can create a 'filehelper' group chat manually.
        wechat_synced_group: [],

        // This option defines whether to keep the help text (by /help tg command),
        // after a command is sucessfully delivered. By default, it would be deleted to keep your default channel clean.
        // (I don't know if you need this, so it's off by default >_< )
        keep_help_text_after_command_received: 0,

        // This option defines whether to kill the program if detected fatal error - such as WeChat-side page crashed.
        // Please note that we're not able to restart ourselves, so
        // [Only if you are using docker, pm2 or similar monitoring tools should you switch this to ON]
        auto_reboot_after_error_detected: 0,

        // This option allows user to schedule a restart for the program in an idle period.
        // The program will do the same thing as /reboot then.
        // And as usual, please ensure you have a monitoring tool to take on the start job.
        scheduled_reboot: [
            // {hour: 3},
        ],

        /////////--------[  Advanced or deprecated Setting, less need to edit  ]--------//////////

        // This option defines whether to keep the file placeholder message (wait for user action on downloading) after a file is successfully uploaded to TG.
        remove_file_placeholder_msg_after_success: 1,

        // Interval between each automatic status report [to Console].
        status_report_interval: 4 * 3600,
        // How many 5-seconds should system wait before auto cancel /drop_on command.
        keep_drop_on_x5s: 100,
        // This variable is deprecated, therefore not recommended to change.
        addSelfReplyTimestampToRoomMergedMsg: false,
        // This option is also limited by TG bot API, so cannot be much larger.
        wxAutoDownloadSizeThreshold: 30 * 1048576,
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
        // should a C2C chat only be a copy of WX-side message, which stops forwarding any TG msg to WX.
        "onlyReceive": 0,


        // # # # # # # [Below are special flags to be used at C2Cs only, which shall not be modified here.]  # # # # # #


        // If turned on, member names in messages would be removed when delivering from wx to tg.
        // Then it will look like all messages are sent from a person rather than a group. (Maybe alike tg's Remain Anonymous?)
        "hideMemberName": 0, // Incomplete
    },
    mods: {
        keepalive: {
            switch: "on",

            // version 1 of trigger rule, which is used to check if the bot is still alive.
            trigger_v1: [
                // The timespan boundary should be calculated with your own situation;
                // just find when your 1st message (any in wx) of a day was received.
                // If there is no early messages, you could subscribe to a news Official Account, and then you'll have some push messages in the early morning.
                // During the timespan, if the program didn't receive any message within ${max_idle_minutes} minutes, then some check measures will apply.
                {start: "7:00", end: "23:00", max_idle_minutes: 40},
            ],
            check_byAvatarUrl: {
                switch: "on",
                // Wait to retrieve what the bad avatar is.
            },
            check_bySendMsg: {
                switch: "off",
                send_target: "微信支付",
                send_contents: ["你好", "今天天气如何"],
                // Under construction...
            }
        },

    },
    rules: {
        // Rules are defined here.
        "example1": {
            "autoApply": [1, 0],  // Person Chat as [0], Group as [1]
            "if_wx_msg_contains": /^[,，][?？]$/g,
            "do_wx_reply_gif": "gif/ct-affirmative.gif",
        }
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

        tgTextQuoteAddition: (quoted, original) => `(回复「${quoted}」)\n${original}`,

        // If you want to override /help return text, change this to a function like common.js/TGBotHelpCmdText.
        // Please remind if you do so, then for new commands you must add them manually to /help text.
        override_help_text: false,

        // System notifications

        // When sending wx login QRCode to tg, this text is used:
        wxLoginQRCodeHint: "Please scan this QRCode to login WeChat.",

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