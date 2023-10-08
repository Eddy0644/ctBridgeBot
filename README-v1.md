# ctbridgebot

---
Bridge your messages from a notorious IM in China:{WeChat}, to an excellent IM:{Telegram}.

## Installation
1. log into your server (eg. Cloud Server or docker container).
2. Clone the whole repository into your disk (assume that code are under `/opt/ctBridgeBot`, then you should run `cd /opt && git clone https://github.com/netcyabc/ctBridgeBot.git`).
3. change `config/template_____secret.js` into `config/secret.js` and fill in required parameter and credentials, like TG bot token or so.
4. move `config/template___downloaded` into `downloaded/` as the default folder of media received upon wx or tg message.
5. edit `proxy.js` to your true proxy server address.
6. - if you have webHook setup on remote server, you could start the application using `npm run h0` to start the app using `https://www.com/webHook0`.
   - if you want to use poll method temporary, please run `npm run p`.
7. All Done! Wait for scanning QR code via Wx and then you would get rid of that green app!

---

Maybe this document isn't good enough; Issues and PRs are welcome!

And talk to me directly with [Ryan_Contact_Intermediate_bot](https://t.me/Ryan_Contact_Intermediate_bot) !