// noinspection SpellCheckingInspection

module.exports = {
    botToken: '5000:ABCDE',
    webHookUrlPrefix: 'https://www.gov.cn/webHook',
    txyun_credential: {
        secretId: "",
        secretKey: "",
    },
    target_TG_ID: 550123456,
    upyun: {
        password: "operator_password",
        webFilePathPrefix: "/BUCKETNAME/ctBotAsset/stickerTG",
        urlPathPrefix: "{webFilePathPrefix}-'/BUCKETNAME'",
        operatorName: "opName",
        urlPrefix: "https://000.test.upcdn.net"
    },
    quickKeyboard: [
        [
            {text: "[Doge]"}, {text: "[Rose]"}, {text: "[Sigh]"}, {text: "[Laugh]"}, {text: "[Pout]"},
        ],
        [
            {text: "F$People1"},
        ],
    ],
    quickFindList: [],
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
        ["。😡。", "[Pout]"],
    ],
    nameExcludeKeyword: [
        "美团", "..."
    ],
    messageExcludeKeyword: [],
}
