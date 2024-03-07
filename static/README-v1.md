# ctBridgeBot

Bridge your messages from a notorious IM in China: `WeChat`, to an excellent IM:`Telegram`, with many custom configurations and features that other program will never have.

_This document is no longer maintained and is lack of detail, please refer to [My Blog](https://blog.ryancc.top/2023/08/01/ctbr_docs1/) for newer version. (Chinese)_

## Installation
1. log into your server (eg. Cloud Server or docker container).
2. Clone the whole repository into your disk (assume that code are under `/opt/ctBridgeBot`, then you should run `cd /opt && git clone https://github.com/Eddy0644/ctBridgeBot.git`).
3. copy `config/def.conf.js` into `config/user.conf.js` and make changes to some required parameter and credentials, like TG bot token or so.
4. move `static/template___downloaded` into `downloaded/` as the default folder of media received upon wx or tg message.
5. edit `proxy.js` to your real proxy server address.
6. - if you have webHook successfully setup on remote server, you could start the application using `npm run h0` to start the app using `https://www.com/webHook0`.
   - if you want to use poll method temporary, please run `npm run p`.
7. All Done! Wait for scanning QR code via Wx and then you would get rid of that green app!


## Project Directory Structure

1. `config/` : all your custom configs in one directory (containing a user config file and a default config which will be replaced when updating code)
2. `downloaded/` : all your downloaded media files from WeChat or Telegram.
3. `src/` : all source code of this project.
4. `log/` : two types of log files, one is for verbosed program log, and the other is for WeChat raw message log.
5. `static/` : containing some files you may need to use or read when deploying this project.
6. `data/` : containing some variable file which may change during program runtime.
7. `proxy.js` : a proxy server configuration for Telegram, which is used to get rid of the network ban in specific region. (recommended to stay unoutched upon deployment)

Our advice is, replacing whole `config` and `src` directory when updating code, and keeping `downloaded` directory untouched. As for changing device, you should at least move the `data` directory to the new device, and `downloaded` directory if better.



---

Maybe this document isn't good enough; Issues and PRs are welcome!

And talk to me directly with [Ryan_Contact_Intermediate_bot](https://t.me/Ryan_Contact_Intermediate_bot) !
