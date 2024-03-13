{提示：作者下一步更新的文档将在blog上，此处文档暂不更新，请移步至根目录README指定的在线版文档！}

（提示：以点分隔的标题标号表示各项需要依序进行，例如2.1 >> 2.2；以斜杠分割的标号表示各项取其一执行即可，如2/1，2/2二选一）

## 一.部署指南

### 1. 下载源码包

​	目前可行地下载源码的方式：~~我手动发给您~~。
​	将来会添加的更新代码方式：	【TODO】

- [ ] 使用Git版本管理，使用pull命令更新最新版
- [ ] 发布升级包，解压时直接覆盖对应文件
- [ ] 使用node编写自动更新脚本，运行即可（需要更完善的鉴权和版本号机制，working on that）

### 2.部署运行环境

#### 2/1. 手动部署

1. 解压源码后放置到您计算机的某个位置，记住路径以备用；
2. 为计算机安装Node运行环境（https://nodejs.org/zh-cn ，选择长期维护版即可）；
3. 切换到源码路径（称之为“项目根目录，下同），打开命令提示符 / Windows Powershell / 终端 （将这三者统称”终端“，下同），输入`npm install` 开始安装运行环境（若此步出现问题，请检查您的网络/科学上网情况，如多次重试仍无法完成安装，请向我索要打包了node_modules的版本）；
4. 打开项目根目录下`proxy.js`文件，按格式完成代理服务器地址的设定（需要http代理端口或mixed端口，请参考您所用的科学上网软件），包含代理服务器ip及其端口，建议在本地网络上运行科学上网软件再让本项目去连接；
5. 安装依赖完成后，请参照下述步骤完成配置文件的修改；
6. 一切结束后，在终端输入`npm run p`或`npm start`启动程序。

#### 2/2. 可视化部署（适合带有屏幕和图形界面的服务器）

​	（步骤1~5同2/1）

 1. 打开VSCode、IntelliJ IDEA等支持Node.js的IDE，打开本项目所在文件夹，新建运行配置：

     a）IDEA

      “工作目录”与项目根目录保持一致；“JS文件”请输入`src\BotIndex.js`
      ；“应用程序形参”输入`poll`即可

     b）VSCode

      首先安装node扩展；然后打开调试与运行侧边栏，点击两次蓝色按钮，关闭弹出的launch.json，在第二次点按后弹出的悬浮菜单选择带有`poll`的项；即可将运行配置添加进VSCode项目中

​	6.直接在IDE内调试/运行刚才新建的配置，即可在显示日志的同时兼有断点调试的功能，可随时诊断程序出现的异常

#### 2/3. Docker部署

1. 首先拉取`wechaty/wechaty`镜像（约2.47GB，由于并非我打包因此我也不知如何优化）；

2. 然后根据源码包中DKF.5文件执行镜像的重新打包：
   `docker build -f DKF.5 . -t ct2`
3. 之后根据上述3~5步，完成依赖安装以及配置文件修改；
4. 随后运行此镜像，同时设置好目录映射，从项目根目录到`/bot`，示例代码如下：
   `docker run -v /opt/ctBridgeBot:/bot -e TZ=Asia/Shanghai -it ct2`
5. 运行此容器（并也可设置此镜像为开机启动），再通过`docker logs ct2`进入日志页面查看二维码，进行登录。

### 3.修改配置文件

以下描述均基于此版本（v2.1.0）所附带的模板`def.conf.js`，示例如下，请参考下述模板。
目前本项目采用的是配置文件融合的方法，所以请您先将`def.conf.js`复制到`user.conf.js`，修改下述的必填项后即可运行。
> 注：`user.conf.js`中可任意删除非必填项，当程序运行中检测到用户配置文件缺项则会自动从默认配置中调取。

```js
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
    },
    misc: {
        enableInlineSearchForUnreplaced: true,

        // s=false, no title-changing;
        // s=<string>, use customized new-title as [1] specified;
        // s=<function>, the func. would be executed with parameter 'count'
        changeTitleForSameTalkerInMerged: c => `<code>${c}|→</code> `,

        // s=false, no delivery
        // s=true, send to Push channel
        // s=<tgTargetObj>, send to this target
        deliverPushMessage: true,
        deliverSticker: {
            tgid: -100000, threadId: 777,
            urlPrefix: "https://t.me/c/000/777/",
        },

        // 0, no advance (default); 1, only not filtered; 2, apply on all room chats
        deliverRoomRedPacketInAdvance: 2,

        titleForSystemMsgInRoom: "(System)",

        addSelfReplyTimestampToRoomMergedMsg: false,

        wxAutoDownloadSizeThreshold: 3 * 1048576,
        tgCmdPlaceholder: `Start---\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\nStop----`,
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
```

接下来请按步骤操作，分别自定义配置文件的各个项。（1、2、3为必选项，其余为可选项）

1. `root → tgbot` 项中：

   - `botToken` 改成您创建的Telegram Bot 的访问 token；
   - `botName` 改成您Telegram Bot 的用户名；（此项主要用于Bot Command的识别）

   > 如果您未曾创建过bot，那么请按照以下步骤操作：
   > 在Telegram主页搜索`botfather`，点击Menu按钮输入`/newbot`，然后分别在聊天区输入Bot显示名称、Bot用户名（以`_bot`结尾），即可在回复消息的中间部分找到Bot Token.
   > 请注意，在运行本项目前，务必点击`BotFather`发送的链接，点击机器人聊天窗口下方的Start按钮，才能允许机器人向您发送消息！
   > 格式如下：`6000000004:AA..(Skip 32 chars)..A`

2. 
   - `root → tgbot → tgAllowList` 请向数组中添加您自己的Telegram ID，以数字形式；
   - `root → class → def`，**默认频道**的相关配置，请将`tgid`改为 您创建的群的id / 您的Telegram ID；（默认频道者，也就是不满足下方设配置规则的其他所有消息都会被递送到这里）

   > - 个人Telegram ID获取方法：
   >   在主界面搜索`raw_info_bot`，点击开始，第一行输出即为所求；
   >
   > - 群的创建及获取id的方法：
   >
   >   首先新建群聊，名称随意填写，然后将您的Bot拉入此群（可能必须在搜索框内**输入bot的用户名**才能看到前者，因为tg的这个建议列表默认只显示真人用户），再在群管理设置中选择`Administrator`菜单，将Bot提升为管理员，并把倒数第二个开关`Remain Anonymous`打开，保存后等待1s，向群聊发送任意一条消息，右键即会出现`Copy Message Link`，点击复制并粘贴，其数据形似：`https://t.me/c/1861111110/2`，此时请提取中间部分的整数，再在其之前附加`-100`，得到类似`-1001954444465`这样的数，即为此群的id.
   
3. `root → ctToken` 请在此填入您的token，应当在您获得源码的相同渠道获得，如果您没有或不清楚，请询问我。

4. `root → class → push`，对于push频道的`tgid`，可参考第2步操作，新建一个群专门存放订阅号推送等消息，但此项也可设置为您的Telegram ID以期尽快投入使用。

5. `root → filtering → wxFindNameReplaceList`， “tg侧名称替换”，也就是您在tg想寻找wx联系人时使用的，后台逻辑是在查找过程中若碰到用户输入符合左边的就替换成右边的。您自行决定需不需要使用，不需要可删除此项；

6. `root → filtering → wxNameFilterStrategy` 此项定义了微信消息的名称筛选器。请首先按照您的实际需要，决定采用白名单机制还是黑名单机制，修改`useBlackList`为对应值；若为黑名单，则联系人/群名称中带此关键词的微信消息均会被屏蔽不发送<u>（同时也不会下载这样的消息中携带的媒体文件，加快程序运行速度）</u>；若为白名单，则只有名称中包含任意白名单词的才会继续递送。您可自行决定是否需要修改此项，若不需要过滤建议设置为黑名单模式并清除黑名单。

7. `root → notification`， Bark推送部分，旨在特殊情况（例如在连接tg服务器的过程中多次中断，或接收到微信来电）时向手机发送推送通知以吸引您的注意力，（后续正在考虑建立第三方bot，以期可以同时从tg推送断线消息【TODO】）；如不使用相关功能可保留该括号 (YourBarkAddress) ，程序将自动停用此模块。

8. `root → misc → deliverStickerSeparately`，决定了聊天消息中的Sticker贴纸将如何递送。建议另建一群，获取此群id，覆盖`tgid`值并删除`threadId`项；当然也可保持与第3步push频道一致，不过可能会影响观感。

   > 也可考虑融合第3步与第6步，即新建群并开启Topic功能，这样一群可当多群使用，从而节省聊天列表的空间，具体方法如下：
   > 首先在群设置开启Topic功能，随后新建话题，名称随意起，在新话题中发送消息并复制链接，类似`https://t.me/c/1788888875/4/401`，取其中第二组数字`4`，即为`threadId`；覆盖第76行的对应项，或在第23行下方增加一行`threadId`，即可启用此功能。

9. `root → filtering → wxContentReplaceList`，会将微信中的部分自带表情如发怒捂脸等替换为emoji，如果您不想在输出消息中看到emoji可以注释这几行；（也可利用本项，添加自定义过滤规则，以期屏蔽某些令人不喜的词汇）

   > 请注意如果您登录微信的手机语言为中文，可能还需要另外将 \[Pout\] \[Facepalm\] 等英文描述替换为 \[发怒\] \[捂脸\]等中文描述，此外还有\[BadLuck\]=\[骷髅\]等对应关系，我们暂未添加，未来将推出列表供用户自行选择；
   > *由于我们从上游服务器接收的就是中英文混搭的版本，因此此项的设置取决于您手机语言，后续会改进……*

10. `root → class → C2C`，如果您想使用C2C功能，请照前述步骤修改，并可复制这些项以便创建多个C2C Pair。`tgid`数值参考第2或4步；wx数组的第一项是您期望聊天对象的名字（微信昵称/群名称/您自行设置的备注都可以，我们会按照此顺序依次查找），第二项即为`isGroup`，请根据聊天对象是否为群自行填入`true`或`false`；

11. 【TODO】介绍以下项的配置过程：

    - txyun， upyun
    - statusReport
    - webHook (Hard)



## 二.使用教程及文档

### 1.启动流程及网络检测

启动程序后，稍等片刻，程序将检查项目根目录下是否有`ctbridgebot.memory-card.json`文件，若有则尝试使用上次的登录信息直接登录，一般也能在数秒内完成；如果登录失效了或无登录会话信息，则会在控制台输出一幅二维码和二维码图片链接。手机扫码之后完成登录，日志输出形如`[<Time>] I/wx Contact<your_name>已登录.`
   > a）复制"二维码图片链接"到浏览器，可以输出一张二维码图片在浏览器以供手机扫描；
   > b）请注意，由于微信官方的迷之限制，登录二维码无法使用**非摄像头以外的**任何形式识别。也就是说，无论是从相册选取二维码还是在聊天中长按图片识别二维码都无法完成登录（显示二维码失效）因此您可能必须需要两台设备才能完成登录。因此建议不要在不方便的场合通过远程手段重启本项目，以免登录失效却又无法重新登录。
   > c）由于需要在后台启动一个浏览器进程，所以启动阶段花费的时间在10s~30s不等
   > d）如果在微信登录消息之前输出了红色的如下内容（`Unhandled rejection RequestError: Error: Client network socket disconnected before secure TLS connection was established`），说明代理服务器连接出现问题，请查看代理服务器设置，之后可以不必重启程序；
   > 若输出的错误信息如下（`Error: net::ERR_TIMED_OUT at https://wx2.qq.com?lang=zh_CN&target=t`）则说明您设备的网络出现问题，请即刻停止运行，排除网络问题后重启。
   > e）如果弹出微信登录二维码后您在30s内未处理，则会通过配置文件`prompt_relogin_required`项向手机发送<u>重登录提示</u>（内容可自定义），届时请及时处理，以免漏收消息。
   > f）如果程序运行中出现日志信息`[ERR]	Polling - EFATAL: Client network socket disconnected before secure TLS connection was established`表明最近一次向tg服务器的poll操作（拉取用户发送的消息）失败，意味着您代理服务器出现网络波动；如果出现频率较低（如30s一次）则不会产生太大影响，但是还是建议切换到更好的代理/节点；如果在10s内连续出现两次，则程序会按照配置文件`prompt_network_problematic`项向手机发送<u>断网提示</u>，这种情况下若不及时处理可能会影响<u>消息递送的及时性甚至漏收消息</u>等。
*（有些节点提供商限制同时在线设备数，也就是科学上网客户端数量，所以当您网络出现异常时除了切换节点也可考虑排查**是否超出了在线设备限制**）*

### 2. 接收wx消息

程序运行后，您微信上的所有消息即会按照配置文件中所定义的，通过本程序“递送”到Telegram。

#### a.文字消息及合并

归属于默认频道（参考部署指南3.2）的文字消息，根据是否来自群，有以下两种显示形式：`📨[#备注名] <消息内容>` / `📬[说话者微信昵称/#群名称] <消息内容>`。

请注意，本项目并不查询某聊天对象在微信中是否为免打扰状态，换言之，您必须**在配置文件中指定黑/白名单**才能按您的需求屏蔽某些来源的消息。

“合并最近消息“功能打开时（默认打开），依据配置文件中设定的时间间隔，当新消息与上一条消息的时间之差不超过设定值时，新消息将会被附加到旧消息的末尾，并且对旧消息的格式作出相应修改以提升观感。
例如聊天对象是某联系人A，间隔默认为15s，若他的第二条消息内容为2且在上一条消息15s内发出，则上一条消息从 `📨[#联系人A] 1` 变为 <u>如下</u>，也就是在保留首部标题与联系人信息的同时，将他的所有新消息前加上时间戳。

> 📨⛓️ [#联系人A] - - - -
> [13:35:35] 1
> [13:35:37] 2

若聊天对象是群聊，程序会舍弃时间戳，改为在 `[ ]` 内显示说话者名称，并将首部标题内符号‘📨’替换为‘📬’。

此外，当`[ ]` 内容一致时（例如群内同一说话者连续三条消息且未被其他人打断，或某联系人在1s内发送多条消息），程序不会在新消息中显示`[ ]` ，反而是采用等宽字体显示其计数（如`2|→`）。这表明了该说话者连发了多少条消息。（无特殊意义，仅供娱乐。）此项可在配置文件中`changeTitleForSameTalkerInMergedRoomMsg`项自定义。

> 请注意，此合并功能目前仍是全局共享，也就是说如果您有两个以上的群会经常输出消息，那么合并功能将经常被打断（因为第二个群合并的过程中第一个群的新消息会打断这一过程，并重置记忆，导致第二个群的新消息将无法再被合并）。这是一个较为严重的问题，我们正在尝试重写这部分代码以使“合并”功能的行为更加正常。【TODO】

#### 	b. 图片/文件/视频 多媒体消息

- 图片消息将会先被下载到`/downloaded/photo`中，以`${alias}-${wxdata.filename}`形式保存，再发送到其对应的接收对象中，并且这些图片的标题（`caption`，即图片下方出现的文字）显示为‘🖼’+发送者名称（规则同上述a，根据是否为群/是否为C2C拥有不同行为）
- 对于文件消息，将先向您发送一条提示，包含该文件的发送者、原始文件名和大小。形如：`📨[#联系人] 📎[文件.docx], 0.101MB.`
	- 若大小满足配置文件中`wxAutoDownloadThreshold`项设置的最小阈值，则会显示`Trying download as size is smaller than threshold.`并自动尝试下载，下载完后将向原目标发送刚下载的文件，同时删除原先的提示信息。
	- 若大小大于上述阈值，则显示`Send a single OK to retrieve that.` 此时如果您仍希望接收此文件，则需对此提示消息点击回复，并发送`OK`（全大写或全小写均可），此后文件将会在后台下载并遵循上述步骤发送到tg。
- 对于视频消息，由于微信某次更新取消了视频大小的显示，故软件只能先行发送`🎦(Downloading...)`，并在后台直接下载该视频，之后探测出该视频时长等信息并输出于日志。大小大于49MB的将不会被发送；反之则会即时发送。在上传/下载文件的过程中，由于网络带宽原因，收发消息可能出现延时，请耐心等待。（经测试，此过程主要取决于<u>科学上网</u>的速度。） 

#### c. 推送消息

所有的公众号文章消息（取决于是否在微信设置中选择“接收文章”/“Receive Articles”）都会被`handlePushMessage()`处理成富文本形式发送到配置文件中指定的push频道。具体格式包含订阅号名称（标题上带有#号以便快捷查找其所有文章），每篇文章的标题（点击标题则打开链接）及其简介（取决于公众号运营者的填写，或长或短，甚至没有；以斜体展示）。

点击链接后可在任意浏览器查看，但无法查看评论（微信侧限制，非登录用户无法查看评论）

#### d. 语音消息

语音消息同样会被先下载到`/downloaded/audio`中，以`日期-时间-备注名.mp3`形式保存。

如果在配置文件中开启了语音识别功能`root → txyun`并提供了有效的API Key，则

- 每条语音在进一步发送前都会先发往腾讯云“一句话识别”系统（该系统能在数秒内给出语音转文字结果，支持多种方言且最大长度为60s，刚好满足这一情况），得到转录文字后附加到语音消息的`caption`部分，发送到tg。但请注意，手机端消息预览中无法看到已转出文字的内容，只显示`🎤 Voice Message`，此时您可能必须点击通知进入app才能看到转文字内容。（这是tg app的限制）【TODO】

​	否则，`caption`部分将只包含说话者信息。

#### e. 文字中包含的引用消息

在UOS版本微信，如果对端给您发来带有引用消息的消息，那么默认会显示为<u>如下</u>；很明显观感很差且占用过多行。假如我们试图把这样的引用表现为tg消息间的互相回复的话，不仅与“合并”功能冲突，且不甚简洁。因此我们做了这样的特殊处理，也就是将此部分转换为消息末尾的一行斜体小字`(Quoted "内容" of 说话者)` 其中“内容”部分是被引用消息的内容的前8个字符，至于“说话者”由微信侧定义，一般情况下是群内昵称。
> "说话者A: 第一条消息"
> — — — — — — — — — —
> 第二条消息


### 3. 在tg上发送消息

不仅是wx侧，本项目在tg侧也拥有良好的操作性，支持多种消息格式与指令。

#### a. 支持的消息种类

- 文字消息，将会经`tgContentReplaceList`过滤后，直接发送给“上一个聊天对象”，若无后者则会发出提醒，`Nothing to do upon your message`，这时这条消息将会被忽略。

  如果这条消息是对另一条消息的回复，则这条消息会被直接发送到，被回复的消息的发送者处。

  （例：我的“上一个聊天对象”是B，但我对“A”发给我的消息选择了“回复”，并且输入了我想说的话，那么这时这条消息会被发送给A而非B。）

- 图片/文件/视频消息，将会被下载到本地后再发送给“上一个聊天对象”，所以如果需要准确地发送给某个人（以免在发送过程中有其他人的消息插入导致消息被错发），请利用c）节提到的lock功能确定您想要发送的对象。

- 语音消息 和 Sticker（贴纸）消息，请详见d节介绍。

  除了上述种类以外，其他所有的消息都会被忽略，包括但不限于群名称/头像更改事件、投票、通过发送语音按钮拍摄的`VideoNote`（仅限移动端tg），并会在日志中体现。

#### b. 使用预定义的指令

以下指令可在聊天框中发送，也可打出`/`后点击命令列表选择目标指令。请注意，绝大多数指令在本消息引用了其他消息的情况下都不会生效，而是会发送到wx，因此发送前请务必检查。

- `/clear`，又称“软重启”，主要作用是调用`softReboot()`，清除大多数记忆数据，以减少bug以及提升性能。发送后程序会返回`Soft Reboot Successful. Reason: User triggered.`，表示软重启成功，且此消息会在数秒后自动消失。
> 主要清除的数据：“上一个聊天对象”、“合并”功能作用对象、定时函数错误计数、“合并”错误致回退次数计数、全局网络错误次数计数

- `/placeholder`，可在当前聊天窗口输出一段空白消息，以将上方的其他消息“顶出”视野，从而保护隐私。此功能在需要将设备交由他人时非常有用。关于此功能的升级也正在规划中，届时将可以在任意消息之间插入空白消息。

- `/spoiler`（本消息只能在“回复”图片消息时起作用）为当前指向的图片消息添加遮罩，其实是借用tg的相关功能，为图片添加一层模糊（在点击后消除），很好地在聊天窗口和消息记录列表保护您的隐私。设置后永久有效。

- `/lock`，可开关“聊天对象”锁的状态。当此锁：
	- 值为0时表示不启用锁；
	- 值为1时表示锁是通过本指令设置的，期间将屏蔽所有新来消息对“上一个聊天对象”的更改，不过您还是可以通过“引用消息”的方式向其他聊天对象发送消息；
	- 值为2时表示锁是通过c）节介绍的“@锁”方式设置的，此时同样会屏蔽“上一个聊天对象”的更改，不同的是，在这种情况下若您对任意消息发送了引用，则锁就会被解除。您也可以使用本指令自行将“2状态”的锁重置回“0状态”。【TODO】


以上命令均可在命令列表找到，而如下命令只能通过`/help`指令间接发起，当然您直接在聊天框输入也是允许的。

- `/help`，可在当前聊天界面输出一个带有更多指令的列表，其中包含的指令如下，可通过后者控制程序的行为等等（这么做主要是为了让tg的指令列表不太累赘）
（注：本指令目前尚存在问题，请等待修复。【TODO】）

- `/log`，可在当前聊天界面得到程序目前一定数量的日志。
> 由于tg侧限制，默认输出的日志数量是末尾1000字符，您也可以通过`/log 2000`的形式手动覆盖输出的日志数量。
> 本消息不会自动删除，查看完日志后请手动删除本消息。


#### c. 查找、行内查找与相关指令
- 本程序支持交互式查找聊天对象，具体方法是发送`/find`指令，在得到程序反馈`Entering find mode; enter token to find it.`后，直接输入您想要查找的对象的<u>微信昵称/群名称/您设置的备注</u>，（由于UOS微信的限制，完成此步骤需要数秒）在查找成功后将会回复消息`Found Person: name=……`，此时若“聊天对象”锁未启用，则“上一个聊天对象”也会被设置成当前查找得到的对象。
（在未来的升级中，此项将升级为模糊查找，即列出联系人列表并尝试在其中模糊查找，给可能匹配的每一位都分配上唯一id，并将后者返回到用户侧，这样做可以避免名称中出现非法字符等等。届时，精确查找请移步至“行内查找”，敬请拭目以待。）

- “行内查找”指的是，当需要向一位新的聊天对象发送消息时，将查找和发送两步合二为一。具体操作方法是，首先输入查找对象的名称（三者均可接受，详见上文），紧随其后输入两个冒号，中英文均可；再然后请输入回车（在移动端可通过输入法完成换行，电脑端可通过Ctrl+Enter换行）接下来直接输入您要发送的消息，最后直接点击发送即可。当您看到聊天界面顶部显示机器人的状态从“typing”变为“choosing sticker”则表示查找并发送成功。

  > 本功能的原理是先调用查找函数找到您欲发送消息的唯一对象，将其设为“上一个聊天对象”后按照正常消息的步骤再发送给目标。因此当“聊天对象”锁已启用时，本功能可能无法正常工作。（这也是一个问题，将在以后的更新中修复，【TODO】）

- 另外，您可以通过“@锁”方式，灵活地设置当前的聊天对象。例如，当您一时间收到来自两个联系人的多条消息时，为了避免互相干扰，您可以先选择其中一位的消息，回复它并输入消息内容“@”，此时该联系人会被设置为“上一个聊天对象”且“聊天对象”锁也会被启用（并设为2状态），接下来您直接发送的所有消息都会被转发到该联系人。此后，只需选择另一位联系人的消息并同样回复“@”，即可专心回复ta的消息。并且通过这种方式设置的锁，在您“回复”其他消息时会自动解除。

  （将来将添加的内容：一段时间内无活动时，本锁将自动解除，避免影响“行内查找”以及其他功能；【TODO】）

#### d. Sticker与语音识别

- 语音消息，如果腾讯云语音识别已启用，则程序会输出您这段语音的识别结果并设置为单宽样式，此时您可以点击文字部分自动复制语音识别后的结果。但是，这条语音并不会发送给任何人。

- Sticker（贴纸）消息，如果又拍云图片转换已启用，则此贴纸将会取缩略图后转换为jpg格式以图片形式发往“上一个聊天对象”。如果前者未启用则什么也不会做。

  > a）由于tg的贴纸要求为webp格式，而wx不支持前者，所以需要设法转换之。已知又拍云提供简单的方案（指不需要通过事件id和查询请求确定转换状态）可以完成上述操作，因此需要您提供此upyun API Key。注：此转换不收取额外费用，仅需要支付存储费用和流量费用即可，因此若您无此站账户，可使用我提供的。
  >
  > b）请注意，目前您的**所有媒体消息中携带的`caption`都不会被递送**。因此，请勿在`caption`栏填写您想要传达的讯息，因为您可能需要复制后单独发送才能被识别。这一问题日后会解决，请等待。【TODO】
  >
  > c）如果您购买了Telegram Premium并发送了自制emoji表情，那么它将会被解析成普通emoji（这一行为取决于emoji上传者为其设定的替代emoji是哪一个）并发送。所以如果想要发送微信原生emoji，您将需要利用此项`tgContentReplaceList`达到目的。

<u>应在此追加介绍腾讯云、又拍云API的申请方法。【TODO】</u>

### 4. 附录