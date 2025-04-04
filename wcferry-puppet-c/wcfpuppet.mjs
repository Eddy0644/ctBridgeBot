import {setTimeout as setTimeout$1} from 'node:timers/promises';
import {WechatferryAgent} from '@wechatferry/agent';
import * as PUPPET from 'wechaty-puppet';
import {log} from 'wechaty-puppet';
import {prefixStorage, createStorage} from 'unstorage';
import {FileBox} from 'file-box';
import {WechatMessageType, WechatAppMessageType} from '@wechatferry/core';
import xml2js from 'xml2js';
import {existsSync} from "node:fs";

const name = "@wechatferry/puppet";
const type = "module";
const version = "0.0.24";
const description = "wcferry puppet for wechaty";
const author = "mrrhq <sanhua@himrr.com>";
const license = "MIT";
const homepage = "https://github.com/wechatferry/wechatferry#readme";
const repository = {
    type: "git",
    url: "https://github.com/wechatferry/wechatferry"
};
const keywords = [
    "wechat",
    "wcferry",
    "robot"
];
const sideEffects = [
    "./src/events/index.ts"
];
const exports = {
    ".": {
        types: "./dist/index.d.ts",
        "import": "./dist/index.mjs",
        require: "./dist/index.cjs"
    }
};
const main = "./dist/index.mjs";
const module = "./dist/index.mjs";
const types = "./dist/index.d.ts";
const typesVersions = {
    "*": {
        "*": [
            "./dist/*",
            "./dist/index.d.ts"
        ]
    }
};
const scripts = {
    build: "unbuild",
    dev: "unbuild --stub"
};
const dependencies = {
    "@wechatferry/agent": "workspace:*",
    "@wechatferry/core": "workspace:*",
    "file-box": "^1.4.15",
    knex: "^3.1.0",
    unstorage: "^1.10.2",
    "wechaty-puppet": "^1.20.2",
    xml2js: "^0.6.2"
};
const devDependencies = {
    "@types/xml2js": "^0.4.14"
};
const localPackageJson = {
    name: name,
    type: type,
    version: version,
    description: description,
    author: author,
    license: license,
    homepage: homepage,
    repository: repository,
    keywords: keywords,
    sideEffects: sideEffects,
    exports: exports,
    main: main,
    module: module,
    types: types,
    typesVersions: typesVersions,
    scripts: scripts,
    dependencies: dependencies,
    devDependencies: devDependencies
};

async function xmlToJson(xml, options) {
    const posIdx = xml.indexOf("<");
    if (posIdx !== 0)
        xml = xml.slice(posIdx);
    return xml2js.parseStringPromise(xml, {
        explicitArray: false,
        ...options
    });
}

async function jsonToXml(data) {
    const builder = new xml2js.Builder({
        xmldec: {
            version: "1.0"
        }
    });
    const xml = builder.buildObject(data);
    return xml;
}

function isRoomId(id) {
    return id?.endsWith("@chatroom") ?? false;
}

function isContactOfficialId(id) {
    return id?.startsWith("gh_") ?? false;
}

function isContactCorporationId(id) {
    return id?.endsWith("@openim") ?? false;
}

// ctModified
function isIMRoomId(id) {
    return id?.endsWith("@im.chatroom") ?? false;
}

function isRoomOps(type) {
    return type === WechatMessageType.SysNotice || type === WechatMessageType.Sys;
}

function isContactId(id) {
    if (!id) {
        return false;
    }
    return !isRoomId(id) && !isIMRoomId(id) && !isContactCorporationId(id);
}

function createPrefixStorage(storage, base) {
    const s = prefixStorage(storage, base);
    const getItemsMap = async (base2) => {
        const keys = await s.getKeys(base2);
        return await Promise.all(keys.map(async (key) => ({key, value: await s.getItem(key)})));
    };
    return {
        ...s,
        getItemsMap,
        async getItemsList(base2) {
            return (await getItemsMap(base2)).map((v) => v.value);
        }
    };
}

function mentionTextParser(message) {
    const mentionRegex = /@\[mention:([^\]]+)\]/g;
    const mentions = message.match(mentionRegex) || [];
    const mentionIds = mentions.map((mention) => {
        const match = mention.match(/@\[mention:([^\]]+)\]/);
        return match && match.length > 1 ? match[1] : null;
    });
    const text = message.replace(mentionRegex, "").trim();
    return {
        mentions: mentionIds.filter((id) => id),
        message: text
    };
}

function getMentionText(mentions = [], chatroomMembers = []) {
    let mentionText = "";
    if (mentions.length === 0)
        return mentionText;
    mentionText = mentions.reduce((acc, mentionId) => {
        chatroomMembers.filter((member) => {
            if (member.userName === mentionId) {
                acc += `@${member.displayName} `;
                return true;
            }
            return false;
        });
        return acc;
    }, "");
    return mentionText;
}

async function executeRunners(runners) {
    for (const runner of runners) {
        const ret = await runner();
        if (ret) {
            return ret;
        }
    }
    return null;
}

var __defProp$1 = Object.defineProperty;
var __defNormalProp$1 = (obj, key, value) => key in obj ? __defProp$1(obj, key, {
    enumerable: true,
    configurable: true,
    writable: true,
    value
}) : obj[key] = value;
var __publicField$1 = (obj, key, value) => {
    __defNormalProp$1(obj, typeof key !== "symbol" ? key + "" : key, value);
    return value;
};

class CacheManager {
    constructor(storage) {
        __publicField$1(this, "storage");
        __publicField$1(this, "messageCache");
        __publicField$1(this, "contactCache");
        __publicField$1(this, "roomCache");
        __publicField$1(this, "roomInvitationCache");
        __publicField$1(this, "friendshipCache");
        __publicField$1(this, "roomMemberCacheList", /* @__PURE__ */ new Map());
        this.storage = storage;
        this.messageCache = createPrefixStorage(storage, "wcf:message");
        this.contactCache = createPrefixStorage(storage, "wcf:contact");
        this.roomCache = createPrefixStorage(storage, "wcf:room");
        this.roomInvitationCache = createPrefixStorage(storage, "wcf:room-invitation");
        this.friendshipCache = createPrefixStorage(storage, "wcf:friendship");
    }

    getRoomMemberCache(roomId) {
        if (!this.roomMemberCacheList.has(roomId)) {
            this.roomMemberCacheList.set(roomId, createPrefixStorage(this.storage, `wcf:room-member:${roomId}`));
        }
        return this.roomMemberCacheList.get(roomId);
    }

    // #region  Message
    getMessage(messageId) {
        return this.messageCache.getItem(messageId);
    }

    setMessage(messageId, payload) {
        return this.messageCache.setItem(messageId, payload);
    }

    hasMessage(messageId) {
        return this.messageCache.hasItem(messageId);
    }

    // #region Friendship
    getFriendship(friendshipId) {
        return this.friendshipCache.getItem(friendshipId);
    }

    setFriendship(friendshipId, payload) {
        return this.friendshipCache.setItem(friendshipId, payload);
    }

    // #region Contact
    getContact(contactId) {
        return this.contactCache.getItem(contactId);
    }

    setContact(contactId, payload) {
        return this.contactCache.setItem(contactId, payload);
    }

    deleteContact(contactId) {
        return this.contactCache.removeItem(contactId);
    }

    getContactIds() {
        return this.contactCache.getKeys();
    }

    getAllContacts() {
        return this.contactCache.getItemsList();
    }

    hasContact(contactId) {
        return this.contactCache.hasItem(contactId);
    }

    async getContactCount() {
        const keys = await this.contactCache.getKeys();
        return keys.length;
    }

    setContactList(payload) {
        return Promise.all(payload.map((contact) => this.contactCache.setItem(contact.userName, contact)));
    }

    // #region Room
    getRoom(roomId) {
        return this.roomCache.getItem(roomId);
    }

    setRoom(roomId, payload) {
        return this.roomCache.setItem(roomId, payload);
    }

    deleteRoom(roomId) {
        return this.roomCache.removeItem(roomId);
    }

    getRoomIds() {
        return this.roomCache.getKeys();
    }

    async getRoomCount() {
        const keys = await this.roomCache.getKeys();
        return keys.length;
    }

    hasRoom(roomId) {
        return this.roomCache.hasItem(roomId);
    }

    setRoomList(payload) {
        return Promise.all(payload.map((room) => this.roomCache.setItem(room.userName, room)));
    }

    // #region Room Invitation
    getRoomInvitation(messageId) {
        return this.roomInvitationCache.getItem(messageId);
    }

    setRoomInvitation(messageId, payload) {
        return this.roomInvitationCache.setItem(messageId, payload);
    }

    deleteRoomInvitation(messageId) {
        return this.roomInvitationCache.removeItem(messageId);
    }

    // #endregion
    // #region Room Member
    getRoomMember(roomId, contactId) {
        const cache = this.getRoomMemberCache(roomId);
        return cache.getItem(contactId);
    }

    setRoomMember(roomId, contactId, payload) {
        const cache = this.getRoomMemberCache(roomId);
        return cache.setItem(contactId, payload);
    }

    deleteRoomMember(roomId, contactId) {
        const cache = this.getRoomMemberCache(roomId);
        return cache.removeItem(contactId);
    }

    setRoomMemberList(roomId, payload) {
        const cache = this.getRoomMemberCache(roomId);
        return Promise.all(payload.map((member) => cache.setItem(member.userName, member)));
    }

    getRoomMemberList(roomId) {
        const cache = this.getRoomMemberCache(roomId);
        return cache.getItemsList();
    }

    getRoomMemberIds(roomId) {
        const cache = this.getRoomMemberCache(roomId);
        return cache.getKeys();
    }
}

async function parseAppmsgMessagePayload(messageContent) {
    const appMsgXml = await xmlToJson(messageContent);
    const {title, des, url, thumburl, type, md5, recorditem} = appMsgXml.msg.appmsg;
    let appattach;
    let channel;
    let miniApp;
    const tmp = appMsgXml.msg.appmsg.appattach;
    const channeltmp = appMsgXml.msg.appmsg.finderFeed;
    const minitmp = appMsgXml.msg.appmsg.weappinfo;
    if (tmp) {
        appattach = {
            aeskey: tmp.aeskey,
            attachid: tmp.attachid,
            cdnattachurl: tmp.cdnattachurl,
            cdnthumbaeskey: tmp.cdnthumbaeskey,
            emoticonmd5: tmp.emoticonmd5,
            encryver: tmp.encryver && Number.parseInt(tmp.encryver, 10) || 0,
            fileext: tmp.fileext,
            islargefilemsg: tmp.islargefilemsg && Number.parseInt(tmp.islargefilemsg, 10) || 0,
            totallen: tmp.totallen && Number.parseInt(tmp.totallen, 10) || 0
        };
    }
    if (channeltmp) {
        channel = {
            authIconType: channeltmp.authIconType,
            authIconUrl: channeltmp.authIconUrl,
            avatar: channeltmp.avatar,
            desc: channeltmp.desc,
            feedType: channeltmp.feedType,
            liveId: channeltmp.liveId,
            mediaCount: channeltmp.mediaCount,
            nickname: channeltmp.nickname,
            objectId: channeltmp.objectId,
            objectNonceId: channeltmp.objectNonceId,
            username: channeltmp.username
        };
    }
    if (minitmp) {
        miniApp = {
            appid: minitmp.appid,
            pagepath: minitmp.pagepath,
            shareId: minitmp.shareId,
            username: minitmp.username,
            weappiconurl: minitmp.weappiconurl
        };
    }
    return {
        appattach,
        channel,
        des,
        md5,
        miniApp,
        recorditem,
        refermsg: appMsgXml.msg.appmsg.refermsg,
        thumburl,
        title,
        type: Number.parseInt(type, 10),
        url
    };
}

async function parseEmotionMessagePayload(message) {
    const jsonPayload = await xmlToJson(message.text ?? "");
    const len = Number.parseInt(jsonPayload.msg.emoji.$.len, 10) || 0;
    const width = Number.parseInt(jsonPayload.msg.emoji.$.width, 10) || 0;
    const height = Number.parseInt(jsonPayload.msg.emoji.$.height, 10) || 0;
    const cdnurl = jsonPayload.msg.emoji.$.cdnurl;
    const type = Number.parseInt(jsonPayload.msg.emoji.$.type, 10) || 0;
    const md5 = jsonPayload.msg.emoji.$.md5;
    let gameext;
    if (jsonPayload.msg.gameext) {
        const gameextType = Number.parseInt(jsonPayload.msg.gameext.$.type, 10) || 0;
        const gameextContent = Number.parseInt(jsonPayload.msg.gameext.$.content, 10) || 0;
        gameext = `<gameext type="${gameextType}" content="${gameextContent}" ></gameext>`;
    }
    return {
        cdnurl,
        gameext,
        height,
        len,
        md5,
        type,
        width
    };
}

async function parseMiniProgramMessagePayload(message) {
    const miniProgramXml = await xmlToJson(message.text ?? "");
    const appmsg = miniProgramXml.msg.appmsg;
    const weappinfo = appmsg.weappinfo;
    const appattach = appmsg.appattach;
    return {
        appid: weappinfo.appid,
        description: appmsg.sourcedisplayname,
        iconUrl: weappinfo.weappiconurl,
        pagePath: weappinfo.pagepath,
        shareId: weappinfo.shareId,
        thumbKey: appattach.cdnthumbaeskey,
        thumbUrl: appattach.cdnthumburl,
        title: appmsg.title,
        username: weappinfo.username
    };
}

async function parseContactCardMessagePayload(messageContent) {
    const jsonPayload = await xmlToJson(messageContent);
    const {$: {bigheadimgurl, username, nickname, city, province}} = jsonPayload.msg;
    return {
        avatar: bigheadimgurl,
        id: username,
        gender: 0,
        name: nickname,
        friend: false,
        province,
        city,
        phone: [],
        tags: [],
        type: PUPPET.types.Contact.Unknown
    };
}

async function buildContactCardXmlMessagePayload(contact) {
    return {
        msg: {
            $: {
                bigheadimgurl: contact.avatar.replace("/132", "/0"),
                smallheadimgurl: contact.avatar,
                username: contact.id,
                nickname: contact.name,
                fullpy: "",
                shortpy: "",
                alias: "",
                imagestatus: "3",
                scene: "17",
                province: "",
                city: "",
                sign: "",
                sex: contact.gender.toString(),
                certflag: "0",
                certinfo: "",
                brandIconUrl: "",
                brandHomeUrl: "",
                brandSubscriptConfigUrl: "",
                brandFlags: "0",
                regionCode: "",
                biznamecardinfo: "",
                antispamticket: ""
            }
        }
    };
}

async function parseTimelineMessagePayload(messageXml) {
    const jsonPayload = await xmlToJson(messageXml);
    const {TimelineObject: timeline} = jsonPayload;
    const builder = new xml2js.Builder();
    const createMessage = (content, id, extra = "", thumb = "", xml = "") => ({
        content,
        id,
        is_group: false,
        is_self: false,
        roomid: "",
        sender: timeline.username,
        ts: timeline.createTime,
        type: WechatMessageType.Text,
        // TODO: support other types
        extra,
        thumb,
        xml,
        sign: ""
    });
    const media = timeline.ContentObject.mediaList?.media;
    let messages = [];
    if (media) {
        const mediaList = Array.isArray(media) ? media : [media];
        messages = mediaList.map(
          (media2) => createMessage(media2.description, media2.id, media2.url?._ || "", media2.thumb?._ || "", builder.buildObject(media2))
        );
    }
    if (messages.length === 0) {
        messages.push(createMessage(timeline.contentDesc || "", timeline.id));
    }
    const postPayload = {
        id: timeline.id,
        parentId: timeline.id,
        rootId: timeline.id,
        contactId: timeline.username,
        timestamp: timeline.createTime,
        counter: {
            children: 0,
            descendant: 0,
            taps: {}
        },
        type: PUPPET.types.Post.Moment,
        sayableList: messages.map((m) => m.id)
    };
    return {
        messages,
        payload: postPayload
    };
}

function wechatferryContactToWechaty(contact) {
    let contactType = PUPPET.types.Contact.Individual;
    if (isContactOfficialId(contact.userName)) {
        contactType = PUPPET.types.Contact.Official;
    } else if (isContactCorporationId(contact.userName)) {
        contactType = PUPPET.types.Contact.Corporation;
    }
    return {
        alias: contact.remark,
        avatar: contact.smallHeadImgUrl,
        friend: true,
        gender: 0,
        id: contact.userName,
        name: contact.nickName,
        phone: [],
        type: contactType,
        tags: contact.tags,
        handle: contact.alias
    };
}

function wechatyContactToWechatferry(contact) {
    return {
        labelIdList: "",
        nickName: contact.name,
        pinYinInitial: "",
        remark: contact.alias ?? "",
        remarkPinYinInitial: "",
        smallHeadImgUrl: contact.avatar,
        tags: [],
        userName: contact.id,
        alias: contact.handle
    };
}

const appMsgParser = async (message, ret, context) => {
    if (ret.type !== PUPPET.types.Message.Attachment) {
        return ret;
    }
    try {
        const appPayload = await parseAppmsgMessagePayload(message.content);
        context.appMessagePayload = appPayload;
        switch (appPayload.type) {
            case WechatAppMessageType.Text:
                ret.type = PUPPET.types.Message.Text;
                ret.text = appPayload.title;
                break;
            case WechatAppMessageType.Audio:
                ret.type = PUPPET.types.Message.Url;
                break;
            case WechatAppMessageType.Video:
                ret.type = PUPPET.types.Message.Url;
                break;
            case WechatAppMessageType.Url:
                ret.type = PUPPET.types.Message.Url;
                break;
            case WechatAppMessageType.Attach:
                ret.type = PUPPET.types.Message.Attachment;
                ret.filename = appPayload.title;
                break;
            case WechatAppMessageType.ChatHistory:
                ret.type = PUPPET.types.Message.ChatHistory;
                break;
            case WechatAppMessageType.MiniProgram:
            case WechatAppMessageType.MiniProgramApp:
                ret.type = PUPPET.types.Message.MiniProgram;
                break;
            case WechatAppMessageType.RedEnvelopes:
                ret.type = PUPPET.types.Message.RedEnvelope;
                break;
            case WechatAppMessageType.Transfers:
                ret.type = PUPPET.types.Message.Transfer;
                break;
            case WechatAppMessageType.RealtimeShareLocation:
                ret.type = PUPPET.types.Message.Location;
                break;
            case WechatAppMessageType.Channels:
                ret.type = PUPPET.types.Message.Post;
                ret.text = appPayload.title;
                break;
            case WechatAppMessageType.GroupNote:
                ret.type = PUPPET.types.Message.GroupNote;
                ret.text = appPayload.title;
                break;
            default:
                ret.type = PUPPET.types.Message.Unknown;
                break;
        }
    } catch (e) {
        log.warn("appMsgParser", `Error occurred while parse message attachment: ${JSON.stringify(message)} , ${e.stack}`);
        ret.type = PUPPET.types.Message.Unknown;
    }
    return ret;
};

const messageParserList = [];

function addMessageParser(parser) {
    messageParserList.push(parser);
}

async function executeMessageParsers(puppet, message, ret) {
    const context = {
        isRoomMessage: !!ret.roomId,
        puppet
    };
    for (const parser of messageParserList) {
        ret = await parser(message, ret, context);
    }
    return ret;
}

const referMsgParser = async (_message, ret, context) => {
    if (!context.appMessagePayload || context.appMessagePayload.type !== WechatAppMessageType.ReferMsg) {
        return ret;
    }
    const appPayload = context.appMessagePayload;
    let referMessageContent;
    const referMessagePayload = appPayload.refermsg;
    const referMessageType = Number.parseInt(referMessagePayload.type);
    switch (referMessageType) {
        case WechatMessageType.Text:
            referMessageContent = referMessagePayload.content;
            break;
        case WechatMessageType.Image:
            referMessageContent = "\u56FE\u7247";
            break;
        case WechatMessageType.Video:
            referMessageContent = "\u89C6\u9891";
            break;
        case WechatMessageType.Emoticon:
            referMessageContent = "\u52A8\u753B\u8868\u60C5";
            break;
        case WechatMessageType.Location:
            referMessageContent = "\u4F4D\u7F6E";
            break;
        case WechatMessageType.App: {
            const referMessageAppPayload = await parseAppmsgMessagePayload(referMessagePayload.content);
            referMessageContent = referMessageAppPayload.title;
            break;
        }
        default:
            referMessageContent = "\u672A\u77E5\u6D88\u606F";
            break;
    }
    ret.isRefer = true;
    ret.type = PUPPET.types.Message.Text;
    ret.text = `\u300C${referMessagePayload.displayname}\uFF1A${referMessageContent}\u300D
- - - - - - - - - - - - - - -
${appPayload.title}`;
    return ret;
};

const roomParser = async (message, ret, context) => {
    if (message.is_group) {
        context.isRoomMessage = true;
        try {
            const xml = await xmlToJson(message.xml);
            if (xml?.msgsource?.atuserlist) {
                const atUserList = xml.msgsource.atuserlist;
                const mentionIdList = atUserList.split(",").map((v) => v.trim()).filter((v) => v);
                if (mentionIdList.length) {
                    log.verbose("roomParser", `mentionIdList: ${mentionIdList}`);
                    const room = ret;
                    room.mentionIdList = mentionIdList;
                }
            }
        } catch (e) {
            log.error("roomParser", "error when parse xml: %s", message.xml);
            log.error("roomParser", "exception %s", e.stack);
        }
    }
    return ret;
};

const TypeMappings = {
    [WechatMessageType.Moment]: PUPPET.types.Message.Post,
    [WechatMessageType.Text]: PUPPET.types.Message.Text,
    [WechatMessageType.Image]: PUPPET.types.Message.Image,
    [WechatMessageType.Voice]: PUPPET.types.Message.Audio,
    [WechatMessageType.Emoticon]: PUPPET.types.Message.Emoticon,
    [WechatMessageType.App]: PUPPET.types.Message.Attachment,
    [WechatMessageType.Location]: PUPPET.types.Message.Location,
    [WechatMessageType.MicroVideo]: PUPPET.types.Message.Video,
    [WechatMessageType.Video]: PUPPET.types.Message.Video,
    [WechatMessageType.Sys]: PUPPET.types.Message.Unknown,
    [WechatMessageType.ShareCard]: PUPPET.types.Message.Contact,
    [WechatMessageType.Recalled]: PUPPET.types.Message.Recalled,
    [WechatMessageType.StatusNotify]: PUPPET.types.Message.Unknown,
    [WechatMessageType.SysNotice]: PUPPET.types.Message.Unknown
};
const typeParser = async (message, ret, _context) => {
    const wechatMessageType = message.type;
    let type = TypeMappings[wechatMessageType];
    if (!type) {
        log.verbose("typeParser", `unsupported type: ${JSON.stringify(message)}`);
        type = PUPPET.types.Message.Unknown;
    }
    ret.type = type;
    return ret;
};

addMessageParser(typeParser);
addMessageParser(appMsgParser);
addMessageParser(referMsgParser);
addMessageParser(roomParser);

function rewriteMsgContent(message) {
    const splitContent = message.split(":\n");
    const content = splitContent.length > 1 ? splitContent[1] : message;
    return content;
}

async function wechatferryMessageToWechaty(puppet, message) {
    let text = message.content;
    const roomId = message.is_group ? message.roomid : "";
    const talkerId = message.sender;
    const listenerId = message.sender;
    if (roomId) {
        text = rewriteMsgContent(text);
    }
    const ret = {
        id: message.id.toString(),
        text,
        talkerId,
        listenerId: roomId ? "" : listenerId,
        timestamp: Date.now(),
        roomId,
        isRefer: false,
    };
    await executeMessageParsers(puppet, message, ret);
    // ctModified
    ret.wcfraw = message;
    return ret;
}

function wechatferryDBMessageToWechaty(puppet, message) {
    return wechatferryMessageToWechaty(puppet, wechatferryDBMessageToEventMessage(message));
}

function wechatferryDBMessageToEventMessage(message) {
    const isRoom = isRoomId(message.strTalker);
    return {
        content: message.strContent,
        extra: message.parsedBytesExtra.extra,
        id: `${message.msgSvrId}`,
        is_group: isRoom,
        is_self: message.isSender === 1,
        roomid: isRoom ? message.strTalker : "",
        sender: `${message.talkerWxid}`,
        ts: message.createTime,
        type: message.type,
        xml: message.parsedBytesExtra.xml,
        sign: message.parsedBytesExtra.sign,
        thumb: message.parsedBytesExtra.thumb
    };
}

function wechatferryRoomToWechaty(contact) {
    return {
        id: contact.userName,
        avatar: contact.smallHeadImgUrl,
        external: false,
        ownerId: contact.ownerUserName || "",
        announce: contact.announcement || "",
        topic: contact.nickName || "",
        adminIdList: [],
        memberIdList: contact.memberIdList
    };
}

function wechatferryRoomMemberToWechaty(chatRoomMember) {
    return {
        avatar: chatRoomMember.smallHeadImgUrl,
        id: chatRoomMember.userName,
        inviterId: chatRoomMember.userName,
        name: chatRoomMember?.remark || chatRoomMember?.nickName,
        roomAlias: chatRoomMember.displayName
    };
}

async function parseTextWithRegexList(text, regexList, handler) {
    for (let i = 0; i < regexList.length; ++i) {
        const regex = regexList[i];
        const match = text.match(regex);
        if (!match) {
            continue;
        }
        return await handler(i, match);
    }
    return null;
}

const OTHER_CHANGE_TOPIC_REGEX_LIST = [
    /^"(.+)"修改群名为“(.+)”$/,
    /^"(.+)" changed the group name to "(.+)"$/
];
const YOU_CHANGE_TOPIC_REGEX_LIST = [
    /^(你)修改群名为“(.+)”$/,
    /^(You) changed the group name to "(.+)"$/
];

async function roomTopicParser(puppet, message) {
    const roomId = message.roomid;
    if (!isRoomId(roomId)) {
        return null;
    }
    if (!isRoomOps(message.type)) {
        return null;
    }
    const timestamp = message.ts;
    const content = message.content.trim();
    const youChangeTopic = async () => parseTextWithRegexList(content, YOU_CHANGE_TOPIC_REGEX_LIST, async (_, match) => {
        const newTopic = match[2];
        return {
            changerId: puppet.currentUserId,
            newTopic
        };
    });
    const otherChangeTopic = async () => parseTextWithRegexList(content, OTHER_CHANGE_TOPIC_REGEX_LIST, async (_, match) => {
        const changerName = match[1];
        const newTopic = match[2];
        const [changerId] = await puppet.roomMemberSearch(roomId, changerName);
        return {
            changerId,
            newTopic
        };
    });
    const topicChange = await executeRunners([youChangeTopic, otherChangeTopic]);
    if (topicChange) {
        const room = await puppet.roomPayload(roomId);
        const oldTopic = room.topic;
        return {
            changerId: topicChange.changerId,
            newTopic: topicChange.newTopic,
            oldTopic,
            roomId,
            timestamp
        };
    }
    return null;
}

async function messageParser(_puppet, message) {
    return message;
}

const ROOM_OTHER_INVITE_TITLE_ZH = [/邀请你加入群聊/];
const ROOM_OTHER_INVITE_TITLE_EN = [/Group Chat Invitation/];
const ROOM_OTHER_INVITE_LIST_ZH = [/^"(.+)"邀请你加入群聊(.*)，进入可查看详情。/];
const ROOM_OTHER_INVITE_LIST_EN = [/"(.+)" invited you to join the group chat "(.+)"\. Enter to view details\./];

async function roomInviteParser(puppet, message) {
    let appMsgPayload;
    try {
        appMsgPayload = await parseAppmsgMessagePayload(message.content);
    } catch {
        return null;
    }
    if (appMsgPayload.type !== WechatAppMessageType.Url) {
        return null;
    }
    if (!appMsgPayload.title || !appMsgPayload.des) {
        return null;
    }
    let matchesForOtherInviteTitleEn = null;
    let matchesForOtherInviteTitleZh = null;
    let matchesForOtherInviteEn = null;
    let matchesForOtherInviteZh = null;
    ROOM_OTHER_INVITE_TITLE_EN.some((regex) => !!(matchesForOtherInviteTitleEn = appMsgPayload.title.match(regex)));
    ROOM_OTHER_INVITE_TITLE_ZH.some((regex) => !!(matchesForOtherInviteTitleZh = appMsgPayload.title.match(regex)));
    ROOM_OTHER_INVITE_LIST_EN.some((regex) => !!(matchesForOtherInviteEn = appMsgPayload.des.match(regex)));
    ROOM_OTHER_INVITE_LIST_ZH.some((regex) => !!(matchesForOtherInviteZh = appMsgPayload.des.match(regex)));
    const titleMatch = matchesForOtherInviteTitleEn || matchesForOtherInviteTitleZh;
    const matchInviteEvent = matchesForOtherInviteEn || matchesForOtherInviteZh;
    const matches = !!titleMatch && !!matchInviteEvent;
    if (!matches) {
        return null;
    }
    return {
        avatar: appMsgPayload.thumburl,
        id: message.id,
        invitation: appMsgPayload.url,
        inviterId: message.sender,
        memberCount: 0,
        memberIdList: [],
        receiverId: message.roomid || puppet.currentUserId,
        timestamp: message.ts,
        topic: matchInviteEvent[2]
    };
}

const YOU_INVITE_OTHER_REGEX_LIST = [
    /^你邀请"(.+)"加入了群聊/,
    /^You invited (.+) to the group chat/
];
const OTHER_INVITE_YOU_REGEX_LIST = [
    /^"([^"]+)"邀请你加入了群聊，群聊参与人还有：(.+)/,
    /^(.+) invited you to a group chat with (.+)/
];
const OTHER_INVITE_YOU_AND_OTHER_REGEX_LIST = [
    /^"([^"]+)"邀请你和"(.+?)"加入了群聊/,
    /^(.+?) invited you and (.+?) to (the|a) group chat/
];
const OTHER_INVITE_OTHER_REGEX_LIST = [
    /^"(.+)"邀请"(.+)"加入了群聊/,
    /^(.+?) invited (.+?) to (the|a) group chat/
];
const OTHER_JOIN_VIA_YOUR_QRCODE_REGEX_LIST = [
    /^" ?(.+)"通过扫描你分享的二维码加入群聊/,
    /^" ?(.+)" joined group chat via the QR code you shared/
];
const OTHER_JOIN_VIA_OTHER_QRCODE_REGEX_LIST = [
    /^" ?(.+)"通过扫描"(.+)"分享的二维码加入群聊/,
    /^"(.+)" joined the group chat via the QR Code shared by "(.+)"/
];

async function roomJoinParser(puppet, message, retries = 5) {
    const roomId = message.roomid;
    if (!isRoomId(roomId)) {
        return null;
    }
    if (!isRoomOps(message.type)) {
        return null;
    }
    await puppet.updateRoomMemberListCache(roomId);
    const timestamp = message.ts;
    const content = message.content.trim();
    const youInviteOther = () => parseTextWithRegexList(content, [...YOU_INVITE_OTHER_REGEX_LIST, ...OTHER_JOIN_VIA_YOUR_QRCODE_REGEX_LIST], async (_, match) => {
        const inviteeNameList = match[1]?.split("\u3001") ?? [];
        const inviteeIdList = (await Promise.all(inviteeNameList.map((name) => puppet.roomMemberSearch(roomId, name)))).flat();
        return {
            inviteeIdList,
            inviterId: puppet.currentUserId,
            roomId,
            timestamp
        };
    });
    const otherInviteYou = async () => parseTextWithRegexList(content, OTHER_INVITE_YOU_REGEX_LIST, async (_, match) => {
        const inviterName = match[1];
        const [inviterId] = await puppet.roomMemberSearch(roomId, inviterName);
        return {
            inviteeIdList: [puppet.currentUserId],
            inviterId,
            roomId,
            timestamp
        };
    });
    const otherInviteOther = async () => parseTextWithRegexList(content, [...OTHER_INVITE_YOU_AND_OTHER_REGEX_LIST, ...OTHER_INVITE_OTHER_REGEX_LIST], async (index, match) => {
        const inviterName = match[1];
        const inviteeNameList = match[2]?.split("\u3001") ?? [];
        const [inviterId] = await puppet.roomMemberSearch(roomId, inviterName);
        const inviteeIdList = (await Promise.all(inviteeNameList.map((name) => puppet.roomMemberSearch(roomId, name)))).flat();
        const includingYou = index < OTHER_INVITE_YOU_AND_OTHER_REGEX_LIST.length;
        if (includingYou) {
            inviteeIdList.unshift(puppet.currentUserId);
        }
        return {
            inviteeIdList,
            inviterId,
            roomId,
            timestamp
        };
    });
    const otherJoinViaQrCode = () => parseTextWithRegexList(content, OTHER_JOIN_VIA_OTHER_QRCODE_REGEX_LIST, async (_, match) => {
        const inviteeName = match[1];
        const inviterName = match[2];
        const [inviterId] = await puppet.roomMemberSearch(roomId, inviterName);
        const [inviteeId] = await puppet.roomMemberSearch(roomId, inviteeName);
        return {
            inviteeIdList: [inviteeId],
            inviterId,
            roomId,
            timestamp
        };
    });
    const ret = await executeRunners([youInviteOther, otherInviteYou, otherInviteOther, otherJoinViaQrCode]);
    if (!ret) {
        return null;
    }
    if (ret.inviteeIdList.length === 0 && retries > 0) {
        await setTimeout$1(2e3);
        return roomJoinParser(puppet, message, retries - 1);
    }
    return ret;
}

const YOU_REMOVE_OTHER_REGEX_LIST = [
    /^(你)将"(.+)"移出了群聊/,
    /^(You) removed "(.+)" from the group chat/
];
const OTHER_REMOVE_YOU_REGEX_LIST = [
    /^(你)被"([^"]+)"移出群聊/,
    /^(You) were removed from the group chat by "([^"]+)"/
];

async function roomLeaveParser(puppet, message) {
    const roomId = message.roomid;
    if (!isRoomId(roomId)) {
        return null;
    }
    if (!isRoomOps(message.type)) {
        return null;
    }
    const timestamp = message.ts;
    const content = message.content.trim();
    const youRemoveOther = async () => parseTextWithRegexList(content, YOU_REMOVE_OTHER_REGEX_LIST, async (_, match) => {
        const removeeNameList = match[2]?.split("\u3001") ?? [];
        const removeeIdList = (await Promise.all(removeeNameList.map((name) => puppet.roomMemberSearch(roomId, name)))).flat();
        return {
            removeeIdList,
            removerId: puppet.currentUserId,
            roomId,
            timestamp
        };
    });
    const otherRemoveYou = async () => parseTextWithRegexList(content, OTHER_REMOVE_YOU_REGEX_LIST, async (_, match) => {
        const removerName = match[2];
        const [removerId] = await puppet.roomMemberSearch(roomId, removerName);
        return {
            removeeIdList: [puppet.currentUserId],
            removerId,
            roomId,
            timestamp
        };
    });
    const ret = await executeRunners([youRemoveOther, otherRemoveYou]);
    return ret;
}

async function parseVerifyMessagePayload(xml) {
    const jsonPayload = await xmlToJson(xml ?? "");
    const sex = Number.parseInt(jsonPayload.msg.$.sex);
    const contact = {
        avatar: jsonPayload.msg.$.smallheadimgurl,
        gender: sex,
        id: jsonPayload.msg.$.fromusername,
        name: jsonPayload.msg.$.fromnickname,
        phone: [],
        tags: [],
        type: PUPPET.types.Contact.Individual,
        friend: false
    };
    return {
        contact,
        content: jsonPayload.msg.$.content,
        scene: jsonPayload.msg.$.scene,
        ticket: jsonPayload.msg.$.ticket,
        stranger: jsonPayload.msg.$.encryptusername
    };
}

const FRIENDSHIP_CONFIRM_REGEX_LIST = [
    /^You have added (.+) as your WeChat contact. Start chatting!$/,
    /^你已添加了(.+)，现在可以开始聊天了。$/,
    /I've accepted your friend request. Now let's chat!$/,
    /^(.+) just added you to his\/her contacts list. Send a message to him\/her now!$/,
    /^(.+)刚刚把你添加到通讯录，现在可以开始聊天了。$/,
    /^我通过了你的朋友验证请求，现在我们可以开始聊天了$/
];
const FRIENDSHIP_VERIFY_REGEX_LIST = [
    /^(.+) has enabled Friend Confirmation/,
    /^(.+)开启了朋友验证，你还不是他（她）朋友。请先发送朋友验证请求，对方验证通过后，才能聊天。/
];

function isConfirm(message) {
    return FRIENDSHIP_CONFIRM_REGEX_LIST.some((regexp) => {
        return !!message.match(regexp);
    });
}

function isNeedVerify(message) {
    return FRIENDSHIP_VERIFY_REGEX_LIST.some((regexp) => {
        return !!message.match(regexp);
    });
}

async function isReceive(message) {
    if (message.type !== WechatMessageType.VerifyMsg && message.type !== WechatMessageType.VerifyMsgEnterprise) {
        return null;
    }
    try {
        return await parseVerifyMessagePayload(message.content);
    } catch {
    }
    return null;
}

async function friendShipParser(puppet, message) {
    const content = message.content.trim();
    const timestamp = message.ts;
    if (isConfirm(content)) {
        return {
            contactId: message.sender,
            id: message.id,
            timestamp,
            type: PUPPET.types.Friendship.Confirm
        };
    } else if (isNeedVerify(content)) {
        return {
            contactId: message.sender,
            id: message.id,
            timestamp,
            type: PUPPET.types.Friendship.Verify
        };
    } else {
        const payload = await isReceive(message);
        if (payload) {
            await puppet.updateContactCache(payload.contact.id, payload.contact);
            return {
                contactId: payload.contact.id,
                hello: payload.content,
                id: message.id,
                scene: Number.parseInt(payload.scene, 10),
                stranger: payload.stranger,
                ticket: payload.ticket,
                timestamp,
                type: PUPPET.types.Friendship.Receive
            };
        }
    }
    return null;
}

async function postParser(_puppet, message) {
    if (message.type === WechatMessageType.Moment) {
        return {
            postId: message.id
        };
    }
    return null;
}

var EventType = /* @__PURE__ */ ((EventType2) => {
    EventType2[EventType2["Message"] = 0] = "Message";
    EventType2[EventType2["Post"] = 1] = "Post";
    EventType2[EventType2["Friendship"] = 2] = "Friendship";
    EventType2[EventType2["RoomInvite"] = 3] = "RoomInvite";
    EventType2[EventType2["RoomJoin"] = 4] = "RoomJoin";
    EventType2[EventType2["RoomLeave"] = 5] = "RoomLeave";
    EventType2[EventType2["RoomTopic"] = 6] = "RoomTopic";
    return EventType2;
})(EventType || {});
const EventParserList = [];

function addEventParser(eventType, parser) {
    EventParserList.push({
        handler: parser,
        type: eventType
    });
}

async function parseEvent(puppet, message) {
    for (const parser of EventParserList) {
        try {
            const parsedPayload = await parser.handler(puppet, message);
            if (parsedPayload) {
                return {
                    payload: parsedPayload,
                    type: parser.type
                };
            }
        } catch (e) {
            log.error("[Event]", `parse message error: ${e.stack}`);
        }
    }
    return {
        payload: message,
        type: 0 /* Message */
    };
}

addEventParser(EventType.Post, postParser);
addEventParser(EventType.Friendship, friendShipParser);
addEventParser(EventType.RoomInvite, roomInviteParser);
addEventParser(EventType.RoomJoin, roomJoinParser);
addEventParser(EventType.RoomLeave, roomLeaveParser);
addEventParser(EventType.RoomTopic, roomTopicParser);
addEventParser(EventType.Message, messageParser);

var __defProp = Object.defineProperty;
var __defNormalProp = (obj, key, value) => key in obj ? __defProp(obj, key, {
    enumerable: true,
    configurable: true,
    writable: true,
    value
}) : obj[key] = value;
var __publicField = (obj, key, value) => {
    __defNormalProp(obj, typeof key !== "symbol" ? key + "" : key, value);
    return value;
};

function resolvePuppetWcferryOptions(userOptions) {
    return {
        agent: new WechatferryAgent({keepalive: true}),
        // ctModified
        storage: createStorage(),
        ...userOptions
    };
}

class WechatferryPuppet extends PUPPET.Puppet {
    constructor(options = {}) {
        super();
        __publicField(this, "agent");
        __publicField(this, "cacheManager");
        __publicField(this, "heartBeatTimer");
        __publicField(this, "lastSelfMessageId", "");
        const {agent, storage} = resolvePuppetWcferryOptions(options);
        this.agent = agent;
        this.cacheManager = new CacheManager(storage);
    }

    name() {
        return `${localPackageJson.name}<${super.name()}>`;
    }

    version() {
        return `${localPackageJson.version}<${super.version()}>`;
    }

    async onStart() {
        log.verbose("WechatferryPuppet", "onStart()");
        this.agent.on("login", (user) => this.login(user.wxid));
        this.agent.on("logout", () => this.logout());
        this.agent.on("error", (e) => this.emit("error", e));
        this.agent.start();
        this.startPuppetHeart();
    }

    async login(userId) {
        log.verbose("WechatferryPuppet", "login(%s)", userId);
        await this.loadContactList();
        await this.loadRoomList();
        const user = await this.updateContactCache(userId);
        if (!user) {
            throw new Error(
              `login(${userId}) called failed: User not found.`
            );
        }
        super.login(user.userName);
        this.emit("ready");
        this.agent.on("message", this.onMessage.bind(this));
    }

    async onStop() {
        log.verbose("WechatferryPuppet", "onStop()");
        this.stopPuppetHeart();
        this.agent.stop();
        this.agent.removeAllListeners();
    }

    async ding(data) {
        log.silly("WechatferryPuppet", "ding(%s)", data || "");
        await setTimeout$1(1e3);
        this.emit("dong", {data: data || ""});
    }

    async onMessage(message) {
        const messageId = message.id;
        if (message.roomid && !message.sender) {
            message.sender = "fmessage";
        }
        await this.cacheManager.setMessage(messageId, message);
        const event = await parseEvent(this, message);
        const roomId = message.roomid;
        log.verbose("WechatferryPuppet", "onMessage() event %s", JSON.stringify(EventType[event.type]));
        log.verbose("WechatferryPuppet", "onMessage() event %s", JSON.stringify(event.payload, null, 2));
        console.log(`wcf [${messageId}] evt.type ${event.type}`)
        switch (event.type) {
            case EventType.Message: {
                this.emit("message", {messageId});
                break;
            }
            case EventType.Post: {
                this.emit("post", event.payload);
                break;
            }
            case EventType.Friendship: {
                const friendship = event.payload;
                await this.cacheManager.setFriendship(messageId, friendship);
                this.emit("friendship", {
                    friendshipId: messageId
                });
                break;
            }
            case EventType.RoomInvite: {
                await this.cacheManager.setRoomInvitation(messageId, event.payload);
                this.emit("room-invite", {
                    roomInvitationId: messageId
                });
                break;
            }
            case EventType.RoomJoin: {
                this.emit("room-join", event.payload);
                break;
            }
            case EventType.RoomLeave: {
                const payload = event.payload;
                this.emit("room-leave", payload);
                for (const memberId of payload.removeeIdList) {
                    await this.cacheManager.deleteRoomMember(roomId, memberId);
                }
                break;
            }
            case EventType.RoomTopic: {
                this.emit("room-topic", event.payload);
                this.updateRoomCache(roomId);
                break;
            }
        }
    }

    // TODO: need better way
    async onSendMessage(timeout = 5) {
        let localId;
        for (let cnt = 0; cnt < timeout; cnt++) {
            log.verbose("WechatferryPuppet", `onSendMessage(${timeout}): ${cnt}`);
            const messagePayload = this.agent.getLastSelfMessage(localId);
            const messageId = `${messagePayload.msgSvrId}`;
            if (messageId === "0") {
                localId = messagePayload.localId;
            }
            log.verbose("WechatferryPuppet", "onSendMessage() messagePayload %s", JSON.stringify(messagePayload));
            const hasNewMessage = this.lastSelfMessageId !== messageId;
            if (hasNewMessage && messageId !== "0") {
                const message = wechatferryDBMessageToEventMessage(messagePayload);
                log.verbose("WechatferryPuppet", "onSendMessage() message %s", JSON.stringify(message));
                this.lastSelfMessageId = message.id;
                await this.cacheManager.setMessage(message.id, message);
                this.emit("message", {
                    messageId: message.id
                });
                return;
            }
            await setTimeout$1(1e3);
        }
    }

    // #region ContactSelf
    async contactSelfQRCode() {
        log.verbose("WechatferryPuppet", "contactSelfQRCode()");
        throw new Error(
          `contactSelfQRCode() called failed: Method not supported.`
        );
    }

    async contactSelfName(name) {
        log.verbose("WechatferryPuppet", "contactSelfName(%s)", name);
        throw new Error(
          `contactSelfName(${name}) called failed: Method not supported.`
        );
    }

    async contactSelfSignature(signature) {
        log.verbose("WechatferryPuppet", "contactSelfSignature(%s)", signature);
        throw new Error(
          `contactSelfSignature(${signature}) called failed: Method not supported.`
        );
    }

    async contactAlias(contactId, alias) {
        log.verbose("WechatferryPuppet", "contactAlias(%s, %s)", contactId, alias);
        if (alias) {
            throw new Error(
              `contactAlias(${contactId}, ${alias}) called failed: Method not supported.`
            );
        }
        const contact = await this.contactRawPayload(contactId);
        if (!contact) {
            throw new Error(
              `contactAlias(${contactId}) called failed: Contact not found.`
            );
        }
        return contact.alias;
    }

    async contactPhone(contactId, phoneList) {
        log.verbose("WechatferryPuppet", "contactPhone(%s, %s)", contactId, phoneList);
        throw new Error(
          `contactPhone(${contactId}, ${phoneList}) called failed: Method not supported.`
        );
    }

    async contactCorporationRemark(contactId, corporationRemark) {
        log.verbose("WechatferryPuppet", "contactCorporationRemark(%s, %s)", contactId, corporationRemark);
        throw new Error(
          `contactCorporationRemark(${contactId}, ${corporationRemark}) called failed: Method not supported.`
        );
    }

    async contactDescription(contactId, description) {
        log.verbose("WechatferryPuppet", "contactDescription(%s, %s)", contactId, description);
        throw new Error(
          `contactDescription(${contactId}, ${description}) called failed: Method not supported.`
        );
    }

    async contactList() {
        log.verbose("WechatferryPuppet", "contactList()");
        return this.cacheManager.getContactIds();
    }

    async contactAvatar(contactId, file) {
        log.verbose("WechatferryPuppet", "contactAvatar(%s)", contactId);
        if (file) {
            throw new Error(
              `contactAvatar(${contactId}, ${file}) called failed: Method not supported.`
            );
        }
        const contact = await this.getContactPayload(contactId);
        return FileBox.fromUrl(contact.avatar);
    }

    async contactRawPayloadParser(payload) {
        return wechatferryContactToWechaty(payload);
    }

    async contactRawPayload(id) {
        log.verbose("WechatferryPuppet", "contactRawPayload(%s)", id);
        const contact = await this.cacheManager.getContact(id);
        if (!contact) {
            return this.updateContactCache(id);
        }
        return contact;
    }

    conversationReadMark(conversationId, hasRead) {
        log.verbose("WechatferryPuppet", "conversationRead(%s, %s)", conversationId, hasRead);
        throw new Error(
          `conversationReadMark(${conversationId}, ${hasRead}) called failed: Method not supported.`
        );
    }

    async messageContact(messageId) {
        const message = await this.getMessagePayload(messageId);
        if (!message.text) {
            throw new Error(
              `messageContact(${messageId}) called failed: message.text is empty.`
            );
        }
        const contact = await parseContactCardMessagePayload(message.text);
        await this.cacheManager.setContact(contact.id, wechatyContactToWechatferry(contact));
        return contact.id;
    }

    async messageImage(messageId, imageType) {
        log.verbose("WechatferryPuppet", "messageImage(%s, %s[%s])", messageId, imageType, PUPPET.types.Image[imageType]);
        const rawMessage = await this.messageRawPayload(messageId);
        return this.agent.downloadFile(rawMessage);
    }

    async messageRecall(messageId) {
        log.verbose("WechatferryPuppet", "messageRecall(%s)", messageId);
        return this.agent.revokeMsg(messageId) === 1;
    }

    async messageFile(messageId) {
        const rawMessage = await this.messageRawPayload(messageId);
        const message = await this.messageRawPayloadParser(rawMessage);
        switch (message.type) {
            case PUPPET.types.Message.Image:
                return this.messageImage(messageId, PUPPET.types.Image.HD);
            case PUPPET.types.Message.Audio:
                return this.agent.downloadFile(rawMessage);
            case PUPPET.types.Message.Video:
            case PUPPET.types.Message.Attachment:
                return this.myDownloadAttach(rawMessage);
            case PUPPET.types.Message.Emoticon: {
                const emotionPayload = await parseEmotionMessagePayload(message);
                const emoticonBox = FileBox.fromUrl(emotionPayload.cdnurl, {name: `message-${messageId}-emoticon.jpg`});
                emoticonBox.metadata = {
                    payload: emotionPayload,
                    type: "emoticon"
                };
                return emoticonBox;
            }
        }
        throw new Error(
          `messageFile(${messageId}) called failed: Cannot get file from message type ${message.type}.`
        );
    }

    // ctModified
    async myDownloadAttach(message, timeout = 10) {
        const filePath = message.thumb ? (/* Video */message.thumb.replace(/\.jpg$/, ".mp4")) : message.extra;
        let result;
        if ((result = this.agent.wcf.downloadAttach(message.id, message.thumb, message.extra)) !== 0) {
            // new Evidence shows that wcf ret is untrusted. Continue polling below.
            // if (existsSync(filePath)) {
            //     // TODO considered duplication of filename here, but without further verification.
            //     console.log(`wcf returned fail, but in fact the file is downloaded successfully.`)
            //     return FileBox.fromFile(filePath);
            // }
            throw new Error(`downloadAttach(${message?.id}): download file failed. result='${result}', extra='${message.extra}'`);
            // console.log(`wcf returned fail, skipping.`)
        }
        for (let cnt = 0; cnt < timeout; cnt++) {
            if (existsSync(filePath)) {
                return FileBox.fromFile(filePath);
            }
            await setTimeout$1(1000);
        }
        throw new Error(`downloadAttach(${message?.id}): download file timeout. extra='${message.extra}'`);
    }


    async messageUrl(messageId) {
        log.verbose("WechatferryPuppet", "messageUrl(%s)", messageId);
        const message = await this.getMessagePayload(messageId);
        if (!message.text) {
            throw new Error(
              `messageUrl(${messageId}) called failed: message.text is empty.`
            );
        }
        const appPayload = await parseAppmsgMessagePayload(message.text);
        return {
            description: appPayload.des,
            thumbnailUrl: appPayload.thumburl,
            title: appPayload.title,
            url: appPayload.url
        };
    }

    async messageLocation(messageId) {
        log.verbose("WechatferryPuppet", "messageLocation(%s)", messageId);
        throw new Error(
          `messageLocation(${messageId}) called failed: Method not supported.`
        );
    }

    async messageMiniProgram(messageId) {
        log.verbose("WechatferryPuppet", "messageMiniProgram(%s)", messageId);
        const message = await this.getMessagePayload(messageId);
        return parseMiniProgramMessagePayload(message);
    }

    async messageRawPayloadParser(payload) {
        log.verbose("WechatferryPuppet", "messageRawPayloadParser(%s)", payload);
        return wechatferryMessageToWechaty(this, payload);
    }

    async messageRawPayload(id) {
        log.verbose("WechatferryPuppet", "messageRawPayload(%s)", id);
        const message = await this.cacheManager.getMessage(id);
        if (!message) {
            throw new Error(
              `messageRawPayload(${id}) called failed: Message not found.`
            );
        }
        return message;
    }

    async messageSendText(conversationId, text, mentionIdList) {
        const sendText = (text2, mentions) => {
            this.agent.sendText(conversationId, text2, mentions);
            this.onSendMessage();
        };
        log.verbose("messageSendText", "preparing to send message");
        if (!isRoomId(conversationId)) {
            log.verbose("messageSendText", "normal text");
            sendText(text);
            return;
        }
        if (mentionIdList?.length) {
            log.verbose("messageSendText", "mention text");
            sendText(text, mentionIdList);
            return;
        }
        if (text.includes("@all")) {
            log.verbose("messageSendText", "at all");
            text = text.replace("@all", "@\u6240\u6709\u4EBA").trim();
            sendText(text, ["notify@all"]);
            return;
        }
        const mentionRegex = /@\[mention:[^\]]+\]/;
        if (mentionRegex.test(text)) {
            log.verbose("messageSendText", "at mention");
            const {mentions, message} = mentionTextParser(text);
            const members = await this.cacheManager.getRoomMemberList(conversationId);
            const mentionText = getMentionText(mentions, members);
            sendText(`${mentionText} ${message}`, mentions);
            return;
        }
        log.verbose("messageSendText", "normal text");
        sendText(text);
    }

    async messageSendFile(conversationId, file) {
        log.verbose("PuppetBridge", "messageSendFile(%s, %s)", conversationId, file);
        if (file.mediaType.startsWith("image")) {
            await this.agent.sendImage(conversationId, file);
        } else {
            await this.agent.sendFile(conversationId, file);
        }
        this.onSendMessage();
    }

    async messageSendContact(conversationId, contactId) {
        log.verbose("WechatferryPuppet", "messageSendUrl(%s, %s)", conversationId, contactId);
        throw new Error(
          `messageSendContact(${conversationId}, ${contactId}) called failed: Method not supported.`
        );
    }

    async messageSendUrl(conversationId, urlLinkPayload) {
        log.verbose("WechatferryPuppet", "messageSendUrl(%s, %s)", conversationId, JSON.stringify(urlLinkPayload));
        this.agent.sendRichText(conversationId, {
            title: urlLinkPayload.title,
            digest: urlLinkPayload.description,
            thumburl: urlLinkPayload.thumbnailUrl,
            url: urlLinkPayload.url,
            name: urlLinkPayload.name,
            account: urlLinkPayload.account
        });
        this.onSendMessage();
    }

    async messageSendLocation(conversationId, locationPayload) {
        log.verbose("WechatferryPuppet", "messageSendLocation(%s, %s)", conversationId, JSON.stringify(locationPayload));
        throw new Error(
          `messageSendLocation(${conversationId}, ${locationPayload}) called failed: Method not supported.`
        );
    }

    async messageSendMiniProgram(conversationId, miniProgramPayload) {
        log.verbose("WechatferryPuppet", "messageSendMiniProgram(%s, %s)", conversationId, JSON.stringify(miniProgramPayload));
        throw new Error(
          `messageSendMiniProgram(${conversationId}, ${miniProgramPayload}) called failed: Method not supported.`
        );
    }

    async messageForward(conversationId, messageId) {
        log.verbose("WechatferryPuppet", "messageForward(%s, %s)", conversationId, messageId);
        this.agent.forwardMsg(conversationId, messageId);
        this.onSendMessage();
    }

    // #endregion
    // #region Room
    async roomList() {
        log.verbose("WechatferryPuppet", "roomList()");
        return this.cacheManager.getRoomIds();
    }

    roomCreate(contactIdList, topic) {
        log.verbose("WechatferryPuppet", "roomCreate(%s, %s)", contactIdList, topic);
        throw new Error(
          `roomCreate(${contactIdList}, ${topic}) called failed: Method not supported.`
        );
    }

    async roomQuit(roomId) {
        log.verbose("WechatferryPuppet", "roomQuit(%s)", roomId);
        throw new Error(
          `roomQuit(${roomId}) called failed: Method not supported.`
        );
    }

    async roomAdd(roomId, contactId) {
        log.verbose("WechatferryPuppet", "roomAdd(%s, %s)", roomId, contactId);
        if (!roomId || !contactId) {
            log.error("roomAdd: roomId or contactId not found");
            return;
        }
        const memberList = await this.roomMemberList(roomId);
        if (memberList.includes(contactId)) {
            return;
        }
        if (memberList.length > 40) {
            this.agent.inviteChatRoomMembers(roomId, contactId);
            return;
        }
        this.agent.addChatRoomMembers(roomId, contactId);
    }

    async roomDel(roomId, contactId) {
        log.verbose("WechatferryPuppet", "roomDel(%s, %s)", roomId, contactId);
        this.agent.removeChatRoomMembers(roomId, contactId);
    }

    async roomAvatar(roomId) {
        log.verbose("WechatferryPuppet", "roomAvatar(%s)", roomId);
        const payload = await this.getRoomPayload(roomId);
        if (!payload.avatar) {
            throw new Error(
              `roomAvatar(${roomId}) called failed: Room avatar not set.`
            );
        }
        return FileBox.fromUrl(payload.avatar);
    }

    async roomTopic(roomId, topic) {
        if (topic) {
            throw new Error(
              `roomTopic(${roomId}, ${topic}) called failed: Method not supported.`
            );
        }
        const room = await this.getRoomPayload(roomId);
        return room.topic;
    }

    async roomQRCode(roomId) {
        log.verbose("WechatferryPuppet", "roomQRCode(%s)", roomId);
        throw new Error(
          `roomQRCode(${roomId}) called failed: Method not supported.`
        );
    }

    async roomAnnounce(roomId, text) {
        if (text) {
            throw new Error(
              `roomAnnounce(${roomId}, ${text}) called failed: Method not supported.`
            );
        }
        const room = await this.getRoomPayload(roomId);
        return room.announce;
    }

    // #endregion
    // #region Room Invitation
    async roomInvitationAccept(roomInvitationId) {
        log.verbose("WechatferryPuppet", "roomInvitationAccept(%s)", roomInvitationId);
        throw new Error(
          `roomInvitationAccept(${roomInvitationId}) called failed: Method not supported.`
        );
    }

    async roomInvitationRawPayload(roomInvitationId) {
        log.verbose("WechatferryPuppet", "roomInvitationRawPayload(%s)", roomInvitationId);
        const roomInvitation = await this.cacheManager.getRoomInvitation(roomInvitationId);
        if (!roomInvitation) {
            throw new Error(
              `roomInvitationRawPayload(${roomInvitationId}) called failed: Room invitation not found.`
            );
        }
        return roomInvitation;
    }

    async roomInvitationRawPayloadParser(rawPayload) {
        log.verbose("WechatferryPuppet", "roomInvitationRawPayloadParser(%s)", JSON.stringify(rawPayload));
        return rawPayload;
    }

    async roomMemberList(roomId) {
        log.verbose("WechatferryPuppet", "roomMemberList(%s)", roomId);
        const members = await this.cacheManager.getRoomMemberIds(roomId);
        return members;
    }

    async roomMemberRawPayloadParser(rawPayload) {
        log.verbose("WechatferryPuppet", "roomMemberRawPayloadParser(%s)", rawPayload);
        return wechatferryRoomMemberToWechaty(rawPayload);
    }

    async roomMemberRawPayload(roomId, contactId) {
        log.verbose("WechatferryPuppet", "roomMemberRawPayload(%s, %s)", roomId, contactId);
        const member = await this.cacheManager.getRoomMember(roomId, contactId);
        if (!member) {
            return await this.updateRoomMemberCache(roomId, contactId);
        }
        return member;
    }

    async roomRawPayloadParser(payload) {
        return wechatferryRoomToWechaty(payload);
    }

    async roomRawPayload(id) {
        log.verbose("WechatferryPuppet", "roomRawPayload(%s)", id);
        const room = await this.cacheManager.getRoom(id);
        if (!room) {
            return await this.updateRoomCache(id);
        }
        return room;
    }

    // #endregion
    // #region Friendship
    async friendshipSearchPhone(phone) {
        log.verbose("WechatferryPuppet", "friendshipSearchPhone(%s)", phone);
        throw new Error(`friendshipSearchPhone(${phone}) called failed: Method not supported.`);
    }

    async friendshipSearchWeixin(weixin) {
        log.verbose("WechatferryPuppet", "friendshipSearchWeixin(%s)", weixin);
        throw new Error(`friendshipSearchWeixin(${weixin}) called failed: Method not supported.`);
    }

    async friendshipAdd(contactId, hello) {
        log.verbose("WechatferryPuppet", "friendshipAdd(%s, %s)", contactId, hello);
        throw new Error(`friendshipAdd(${contactId}, ${hello}) called failed: Method not supported.`);
    }

    async friendshipAccept(friendshipId) {
        log.verbose("WechatferryPuppet", "friendshipAccept(%s)", friendshipId);
        throw new Error(`friendshipAccept(${friendshipId}) called failed: Method not supported.`);
    }

    async friendshipRawPayloadParser(rawPayload) {
        return rawPayload;
    }

    async friendshipRawPayload(id) {
        const friendship = await this.cacheManager.getFriendship(id);
        if (!friendship) {
            throw new Error(
              `friendshipRawPayload(${id}) called failed: Friendship not found.`
            );
        }
        return friendship;
    }

    // #endregion
    // #region Tag
    async tagContactAdd(tagId, contactId) {
        log.verbose("WechatferryPuppet", "tagContactAdd(%s)", tagId, contactId);
        throw new Error(`tagContactAdd(${tagId}, ${contactId}) called failed: Method not supported.`);
    }

    async tagContactRemove(tagId, contactId) {
        log.verbose("WechatferryPuppet", "tagContactRemove(%s)", tagId, contactId);
        throw new Error(`tagContactRemove(${tagId}, ${contactId}) called failed: Method not supported.`);
    }

    async tagContactDelete(tagId) {
        log.verbose("WechatferryPuppet", "tagContactDelete(%s)", tagId);
        throw new Error(`tagContactDelete(${tagId}) called failed: Method not supported.`);
    }

    async tagContactList(contactId) {
        log.verbose("WechatferryPuppet", "tagContactList(%s)", contactId);
        if (contactId) {
            const contact = await this.cacheManager.getContact(contactId);
            return contact?.tags || [];
        }
        return this.agent.getContactTagList().map((v) => v.labelId);
    }

    postPublish(payload) {
        log.verbose("WechatferryPuppet", "postPublish({type: %s})", PUPPET.types.Post[payload.type || PUPPET.types.Post.Unspecified]);
        throw new Error(`postPublish(${payload}) called failed: Method not supported.`);
    }

    async postSearch(filter, pagination) {
        log.verbose("WechatferryPuppet", "postSearch(%s, %s)", JSON.stringify(filter), JSON.stringify(pagination));
        if (filter.type !== PUPPET.types.Post.Moment) {
            return {
                nextPageToken: void 0,
                response: []
            };
        }
        const response = await this.messageSearch({
            id: filter.id,
            type: PUPPET.types.Message.Post,
            fromId: filter.contactId
        });
        return {
            nextPageToken: void 0,
            response
        };
    }

    async postRawPayloadParser(rawPayload) {
        log.verbose("WechatferryPuppet", "postRawPayloadParser(%s)", rawPayload.id);
        const {messages, payload} = await parseTimelineMessagePayload(rawPayload.xml);
        for (const message of messages) {
            const exist = await this.cacheManager.hasMessage(message.id);
            if (!exist) {
                await this.cacheManager.setMessage(message.id, message);
            }
        }
        return payload;
    }

    async postRawPayload(postId) {
        log.verbose("WechatferryPuppet", "postRawPayload(%s)", postId);
        const post = await this.cacheManager.getMessage(postId);
        if (!post) {
            throw new Error(
              `postRawPayload(${postId}) called failed: Message not found.`
            );
        }
        return post;
    }

    // #endregion
    // #region Tap
    async tap(postId, type, tap) {
        log.verbose("WechatferryPuppet", "tap(%s, %s%s)", postId, PUPPET.types.Tap[type || PUPPET.types.Tap.Unspecified], typeof tap === "undefined" ? "" : `, ${tap}`);
        throw new Error(`tap(${postId}, ${type}, ${tap}) called failed: Method not supported.`);
    }

    async tapSearch(postId, query, pagination) {
        log.verbose("WechatferryPuppet", "tapSearch(%s%s%s)", postId, typeof query === "undefined" ? "" : `, ${JSON.stringify(query)}`, typeof pagination === "undefined" ? "" : `, ${JSON.stringify(pagination)}`);
        throw new Error(`tapSearch(${postId}, ${query}, ${pagination}) called failed: Method not supported.`);
    }

    // #endregion
    // #region Private Methods
    async getRoomPayload(roomId) {
        log.verbose("WechatferryPuppet", `getRoomPayload(${roomId})`);
        const room = await this.roomRawPayload(roomId);
        if (!room) {
            throw new Error(
              `getRoomPayload(${roomId}) called failed: Room not found.`
            );
        }
        return this.roomRawPayloadParser(room);
    }

    async getMessagePayload(messageId) {
        log.verbose("WechatferryPuppet", `getMessagePayload(${messageId})`);
        const message = await this.messageRawPayload(messageId);
        if (!message) {
            throw new Error(
              `getMessagePayload(${messageId}) called failed: Message not found.`
            );
        }
        return this.messageRawPayloadParser(message);
    }

    async getContactPayload(contactId) {
        log.verbose("WechatferryPuppet", `getContactPayload(${contactId})`);
        const contact = await this.contactRawPayload(contactId);
        if (!contact) {
            throw new Error(
              `getContact(${contactId}) called failed: Contact not found.`
            );
        }
        return this.contactRawPayloadParser(contact);
    }

    // TODO: need better way to set temp contact
    async updateContactCache(contactId, _contact) {
        log.verbose("WechatferryPuppet", `updateContactCache(${contactId})`);
        let contact = null;
        if (_contact) {
            contact = await wechatyContactToWechatferry(_contact);
        } else {
            contact = this.agent.getContactInfo(contactId) ?? null;
        }
        if (!contact) {
            return null;
        }
        await this.cacheManager.setContact(contactId, contact);
        this.dirtyPayload(PUPPET.types.Payload.Contact, contactId);
        return contact;
    }

    async updateRoomCache(roomId) {
        log.verbose("WechatferryPuppet", `updateRoomCache(${roomId})`);
        const room = this.agent.getChatRoomInfo(roomId);
        if (!room) {
            return null;
        }
        await this.cacheManager.setRoom(roomId, room);
        this.dirtyPayload(PUPPET.types.Payload.Room, roomId);
        return room;
    }

    /**
     * 更新群聊成员列表缓存
     *
     * @description 主要用于 room-join 事件前获取新加群的成员
     * @deprecated 尽可能避免使用，优先使用 updateRoomMemberCache
     * @param roomId 群聊 id
     */
    async updateRoomMemberListCache(roomId) {
        log.verbose("WechatferryPuppet", `updateRoomMemberListCache(${roomId})`);
        const members = this.agent.getChatRoomMembers(roomId);
        if (!members) {
            return null;
        }
        await this.cacheManager.setRoomMemberList(roomId, members);
        return members;
    }

    async updateRoomMemberCache(roomId, contactId) {
        log.verbose("WechatferryPuppet", `updateRoomMemberCache(${roomId}, ${contactId})`);
        const {displayNameMap = {}} = await this.roomRawPayload(roomId) ?? {};
        const [member] = this.agent.getChatRoomMembersByMemberIdList([contactId], displayNameMap);
        if (!member) {
            await this.cacheManager.deleteRoomMember(roomId, contactId);
            return null;
        }
        this.dirtyPayload(PUPPET.types.Payload.RoomMember, member.userName);
        await this.cacheManager.setRoomMember(roomId, contactId, member);
        return member;
    }

    async loadContactList() {
        log.verbose("WechatferryPuppet", "loadContactList()");
        const contacts = this.agent.getContactList();
        log.verbose("WechatferryPuppet", `loadContactList: contacts ${contacts.length}`);
        return this.cacheManager.setContactList(contacts);
    }

    async loadRoomList() {
        log.verbose("WechatferryPuppet", "loadRoomList()");
        const rooms = this.agent.getChatRoomList();
        log.verbose("WechatferryPuppet", `loadRoomList: rooms ${rooms.length}`);
        await this.cacheManager.setRoomList(rooms);
        await Promise.all(rooms.map(async (room) => {
            const members = this.agent.getChatRoomMembers(room.userName) ?? [];
            log.verbose("WechatferryPuppet", `loadRoomMemberList: members ${members.length}`);
            await this.cacheManager.setRoomMemberList(room.userName, members);
        }));
    }

    startPuppetHeart(firstTime = true) {
        if (firstTime && this.heartBeatTimer) {
            return;
        }
        this.emit("heartbeat", {data: "heartbeat@wechatferry"});
        this.heartBeatTimer = setTimeout(() => {
            this.startPuppetHeart(false);
        }, 15 * 1e3);
    }

    stopPuppetHeart() {
        if (!this.heartBeatTimer) {
            return;
        }
        clearTimeout(this.heartBeatTimer);
        this.heartBeatTimer = void 0;
    }

    // #endregion
}

__publicField(WechatferryPuppet, "VERSION", localPackageJson.version);

export {
    EventType,
    WechatferryPuppet,
    addEventParser,
    buildContactCardXmlMessagePayload,
    createPrefixStorage,
    executeRunners,
    friendShipParser,
    getMentionText,
    isContactCorporationId,
    isContactId,
    isContactOfficialId,
    isIMRoomId,
    isRoomId,
    isRoomOps,
    jsonToXml,
    mentionTextParser,
    messageParser,
    parseAppmsgMessagePayload,
    parseContactCardMessagePayload,
    parseEmotionMessagePayload,
    parseEvent,
    parseMiniProgramMessagePayload,
    parseTimelineMessagePayload,
    postParser,
    resolvePuppetWcferryOptions,
    roomInviteParser,
    roomJoinParser,
    roomLeaveParser,
    roomTopicParser,
    wechatferryContactToWechaty,
    wechatferryDBMessageToEventMessage,
    wechatferryDBMessageToWechaty,
    wechatferryMessageToWechaty,
    wechatferryRoomMemberToWechaty,
    wechatferryRoomToWechaty,
    wechatyContactToWechatferry,
    xmlToJson
};
