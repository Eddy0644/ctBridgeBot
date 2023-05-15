const log4js = require('log4js');
const fs = require("fs");
const agentEr = require("https-proxy-agent");
const logger_pattern = "[%d{hh:mm:ss.SSS}] %3.3c:[%5.5p] %m";
const logger_pattern_console = "[%d{yy/MM/dd hh:mm:ss}] %[%3.3c:[%5.5p]%] %m";
log4js.configure({
    appenders: {
        "console": {
            type: "console",
            layout: {
                type: "pattern",
                pattern: logger_pattern_console
            },
        },
        "dateLog": {
            type: "dateFile",
            filename: "log/day",
            pattern: "yy-MM-dd.log",
            alwaysIncludePattern: true,
            layout: {
                type: "pattern",
                pattern: logger_pattern
            },
        },
        "wxMsgDetail_dateLog": {
            type: "dateFile",
            filename: "log/msgDT/wx",
            pattern: "yy-MM-dd.log",
            alwaysIncludePattern: true,
            layout: {
                type: "pattern",
                pattern: "[%d{hh:mm:ss.SSS}] %m%n%n"
            },
        },
        "debug_to_con": {
            type: "logLevelFilter",
            appender: "console",
            level: "debug",
        }
    },
    categories: {
        "default": {appenders: ["dateLog"], level: "debug"},
        "con": {appenders: ["console"], level: "debug"},
        "cy": {appenders: ["dateLog", "console"], level: "debug"},
        "wx": {appenders: ["dateLog", "debug_to_con"], level: "trace"},
        "wxMsg": {appenders: ["wxMsgDetail_dateLog"], level: "info"},
        "tg": {appenders: ["dateLog", "debug_to_con"], level: "trace"},
    }
});

module.exports = (param) => {
    if (param === "startup") log4js.getLogger("default").debug(`Program Starting...
  ______             __       __            _______              __     
 /      \\           |  \\  _  |  \\          |       \\            |  \\    
|  $$$$$$\\ __    __ | $$ / \\ | $$ __    __ | $$$$$$$\\  ______  _| $$_   
| $$   \\$$|  \\  |  \\| $$/  $\\| $$|  \\  /  \\| $$__/ $$ /      \\|   $$ \\  
| $$      | $$  | $$| $$  $$$\\ $$ \\$$\\/  $$| $$    $$|  $$$$$$\\\\$$$$$$  
| $$   __ | $$  | $$| $$ $$\\$$\\$$  >$$  $$ | $$$$$$$\\| $$  | $$ | $$ __ 
| $$__/  \\| $$__/ $$| $$$$  \\$$$$ /  $$$$\\ | $$__/ $$| $$__/ $$ | $$|  \\
 \\$$    $$ \\$$    $$| $$$    \\$$$|  $$ \\$$\\| $$    $$ \\$$    $$  \\$$  $$
  \\$$$$$$  _\\$$$$$$$ \\$$      \\$$ \\$$   \\$$ \\$$$$$$$   \\$$$$$$    \\$$$$ 
          |  \\__| $$                                                    
           \\$$    $$                                                    
            \\$$$$$$                                                     
`);
    // else return log4js.getLogger(param);
    else return {
        wxLogger: log4js.getLogger("wx"),
        tgLogger: log4js.getLogger("tg"),
        // conLogger: log4js.getLogger("con"),
        // cyLogger: log4js.getLogger("cy"),
        wxMsgLogger: log4js.getLogger("wxMsg"),

        LogWxMsg: (msg, isMessageDropped) => {

            log4js.getLogger("wx").trace(`---Raw ${msg}\n\t\t${isMessageDropped ? '❌[Dropped]' : ""} Verbose:` +
                `[age:${msg.age()},uptime:${process.uptime().toFixed(2)}][type:${msg.type()}][ID: ${msg.id} ]`
                + (isMessageDropped ? '\n' : ''));
            log4js.getLogger("wxMsg").info(`[ID:${msg.id}][ts=${msg.payload.timestamp}][type:${msg.type()}]
    [🗣talkerId=${msg.payload.talkerId}][👥roomId=${msg.payload.roomId}]
    [filename=${msg.payload.filename}]
    ${msg.payload.text}
    ---------------------`);
        },

        //////-----------Above is mostly logger ---------------------//////


        _T: {},
        STypes: {
            Chat: 1,
            FindMode: 2,
        },
        Config: {
            TGBotCommands: [
                {command: '/find', description: 'Find Person or Group Chat'},
                {command: '/clear', description: 'Clear Selection'},
                {command: '/info', description: 'Get current system variables'},
                {command: '/placeholder', description: 'Display a placeholder to hide former messages'},
                {command: '/slet', description: 'Set last explicit talker as last talker.'},
                {command: '/keyboard', description: 'Get a persistent versatile quick keyboard.'},
                {command: '/log', description: 'Get a copy of program verbose log of 1000 chars by default.'},
                {command: '/lock', description: 'Lock the target talker to avoid being interrupted.'},
                // Add more commands as needed
            ],
            placeholder: `Start---\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\nStop----`,
            wxAutoDownloadThreshold: 3 * 1048576
        },

        downloadFileHttp: async function (url, pathName) {
            return new Promise((resolve, reject) => {
                const file = fs.createWriteStream(pathName);
                require('http').get(url, {}, (response) => {
                    // response.setEncoding("binary");
                    response.pipe(file);
                    file.on('finish', () => {
                        file.close();
                        resolve("SUCCESS");
                    });
                }).on('error', (error) => {
                    fs.unlink(pathName, () => reject(error));
                });
            });
        }
    }
};