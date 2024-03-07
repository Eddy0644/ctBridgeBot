// noinspection SpellCheckingInspection
// -------------
// User-side Configuration File, will never be overwritten by update, and should be backed up.


/*
* This is a minimum example of user.conf.js, if you want to bootstrap the project quickly,
* please copy this file to user.conf.js and fill in the necessary information.
* If there is any function that you want to add or modify, please refer to def.conf.js,
* find corresponding setting, and copy to current file.
* */
module.exports = {
    ctToken: 'EnterYourCtTokenHere',
    tgbot: {
        botToken: '5000:ABCDE',
        botName: '@your_bot_username_ending_in_bot',
        tgAllowList: [5000000001],
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
        // Below is a more recommended way for a supergroup containing many chats.
        "C2C_generator": {
            "-1001888888888": [
                [1, "name of group 1", "Group", "flags_here"],
                [4, "name of person 1", "Person", ""],
            ],
        },
    },
    misc: {
        deliverPushMessage: true,
    },
}
