import * as _wechatferry_core from '@wechatferry/core';
import { WechatMessageType, WechatAppMessageType } from '@wechatferry/core';
import * as unstorage from 'unstorage';
import { Storage, StorageValue } from 'unstorage';
import { Room, RoomMember, Contact, Message } from 'wechaty-puppet/payloads';
import { WechatferryAgent, WechatferryAgentEventMessage, WechatferryAgentContact, WechatferryAgentChatRoomMember, WechatferryAgentChatRoom, WechatferryAgentDBMessage } from '@wechatferry/agent';
import * as PUPPET from 'wechaty-puppet';
import { FileBoxInterface } from 'file-box';
import { ParserOptions } from 'xml2js';

interface PuppetRoom extends Room {
    announce: string;
    members: RoomMember[];
}
interface PuppetContact extends Contact {
    tags: string[];
}
type PuppetMessage = Message & {
    isRefer: boolean;
};
interface PuppetWcferryUserOptions {
    agent?: WechatferryAgent;
    /**
     * unstorage 实例，用于缓存数据
     */
    storage?: Storage;
}
interface PuppetWcferryOptions extends Required<PuppetWcferryUserOptions> {
}

declare function resolvePuppetWcferryOptions(userOptions: PuppetWcferryUserOptions): PuppetWcferryOptions;
declare class WechatferryPuppet extends PUPPET.Puppet {
    static readonly VERSION: string;
    agent: WechatferryAgent;
    private cacheManager;
    private heartBeatTimer?;
    constructor(options?: PuppetWcferryUserOptions);
    name(): string;
    version(): string;
    onStart(): Promise<void>;
    login(userId: string): void;
    onStop(): Promise<void>;
    ding(data?: string): Promise<void>;
    onMessage(message: WechatferryAgentEventMessage): Promise<void>;
    private lastSelfMessageId;
    onSendMessage(timeout?: number): Promise<void>;
    contactSelfQRCode(): Promise<string>;
    contactSelfName(name: string): Promise<void>;
    contactSelfSignature(signature: string): Promise<void>;
    contactAlias(contactId: string): Promise<string>;
    contactAlias(contactId: string, alias: string | null): Promise<void>;
    contactPhone(contactId: string): Promise<string[]>;
    contactPhone(contactId: string, phoneList: string[]): Promise<void>;
    contactCorporationRemark(contactId: string, corporationRemark: string): Promise<void>;
    contactDescription(contactId: string, description: string): Promise<void>;
    contactList(): Promise<string[]>;
    contactAvatar(contactId: string): Promise<FileBoxInterface>;
    contactAvatar(contactId: string, file: FileBoxInterface): Promise<void>;
    contactRawPayloadParser(payload: WechatferryAgentContact): Promise<PUPPET.payloads.ContactPayload>;
    contactRawPayload(id: string): Promise<WechatferryAgentContact | null>;
    conversationReadMark(conversationId: string, hasRead?: boolean | undefined): Promise<boolean | void>;
    messageContact(messageId: string): Promise<string>;
    messageImage(messageId: string, imageType: PUPPET.types.Image): Promise<FileBoxInterface>;
    messageRecall(messageId: string): Promise<boolean>;
    messageFile(messageId: string): Promise<FileBoxInterface>;
    messageUrl(messageId: string): Promise<PUPPET.payloads.UrlLink>;
    messageLocation(messageId: string): Promise<PUPPET.payloads.Location>;
    messageMiniProgram(messageId: string): Promise<PUPPET.payloads.MiniProgram>;
    messageRawPayloadParser(payload: WechatferryAgentEventMessage): Promise<PuppetMessage>;
    messageRawPayload(id: string): Promise<WechatferryAgentEventMessage>;
    messageSendText(conversationId: string, text: string): Promise<void>;
    messageSendFile(conversationId: string, file: FileBoxInterface): Promise<void>;
    messageSendContact(conversationId: string, contactId: string): Promise<void>;
    messageSendUrl(conversationId: string, urlLinkPayload: PUPPET.payloads.UrlLink): Promise<void>;
    messageSendLocation(conversationId: string, locationPayload: PUPPET.payloads.Location): Promise<void>;
    messageSendMiniProgram(conversationId: string, miniProgramPayload: PUPPET.payloads.MiniProgram): Promise<void>;
    messageForward(conversationId: string, messageId: string): Promise<void | string>;
    roomList(): Promise<string[]>;
    roomCreate(contactIdList: string[], topic?: string | undefined): Promise<string>;
    roomQuit(roomId: string): Promise<void>;
    roomAdd(roomId: string, contactId: string): Promise<void>;
    roomDel(roomId: string, contactId: string): Promise<void>;
    roomAvatar(roomId: string): Promise<FileBoxInterface>;
    roomTopic(roomId: string): Promise<string>;
    roomTopic(roomId: string, topic: string): Promise<void>;
    roomQRCode(roomId: string): Promise<string>;
    roomAnnounce(roomId: string): Promise<string>;
    roomAnnounce(roomId: string, text: string): Promise<void>;
    roomInvitationAccept(roomInvitationId: string): Promise<void>;
    roomInvitationRawPayload(roomInvitationId: string): Promise<PUPPET.payloads.RoomInvitation>;
    roomInvitationRawPayloadParser(rawPayload: any): Promise<PUPPET.payloads.RoomInvitation>;
    roomMemberList(roomId: string): Promise<string[]>;
    roomMemberRawPayloadParser(rawPayload: WechatferryAgentChatRoomMember): Promise<PUPPET.payloads.RoomMember>;
    roomMemberRawPayload(roomId: string, contactId: string): Promise<WechatferryAgentChatRoomMember | null>;
    roomRawPayloadParser(payload: WechatferryAgentChatRoom): Promise<PUPPET.payloads.RoomPayload>;
    roomRawPayload(id: string): Promise<WechatferryAgentChatRoom | null>;
    friendshipSearchPhone(phone: string): Promise<null | string>;
    friendshipSearchWeixin(weixin: string): Promise<null | string>;
    friendshipAdd(contactId: string, hello: string): Promise<void>;
    friendshipAccept(friendshipId: string): Promise<void>;
    friendshipRawPayloadParser(rawPayload: any): Promise<PUPPET.payloads.Friendship>;
    friendshipRawPayload(id: string): Promise<any>;
    tagContactAdd(tagId: string, contactId: string): Promise<void>;
    tagContactRemove(tagId: string, contactId: string): Promise<void>;
    tagContactDelete(tagId: string): Promise<void>;
    tagContactList(contactId?: string): Promise<string[]>;
    postPublish(payload: PUPPET.payloads.Post): Promise<string | void>;
    postSearch(filter: PUPPET.filters.Post, pagination?: PUPPET.filters.PaginationRequest): Promise<PUPPET.filters.PaginationResponse<string[]>>;
    postRawPayloadParser(rawPayload: WechatferryAgentEventMessage): Promise<PUPPET.payloads.Post>;
    postRawPayload(postId: string): Promise<_wechatferry_core.WxMsg>;
    tap(postId: string, type?: PUPPET.types.Tap, tap?: boolean): Promise<void | boolean>;
    tapSearch(postId: string, query?: PUPPET.filters.Tap, pagination?: PUPPET.filters.PaginationRequest): Promise<PUPPET.filters.PaginationResponse<PUPPET.payloads.Tap>>;
    private getRoomPayload;
    private getMessagePayload;
    private getContactPayload;
    updateContactCache(contactId: string, _contact?: PuppetContact): Promise<WechatferryAgentContact | null>;
    private updateRoomCache;
    /**
     * 更新群聊成员列表缓存
     *
     * @description 主要用于 room-join 事件前获取新加群的成员
     * @deprecated 尽可能避免使用，优先使用 updateRoomMemberCache
     * @param roomId 群聊 id
     */
    updateRoomMemberListCache(roomId: string): Promise<WechatferryAgentChatRoomMember[] | null>;
    private updateRoomMemberCache;
    private loadContactList;
    private loadRoomList;
    private startPuppetHeart;
    private stopPuppetHeart;
}
declare module 'wechaty-puppet/payloads' {
    interface UrlLink {
        /** 左下显示的名字 */
        name?: string;
        /** 公众号 id 可以显示对应的头像（gh_ 开头的） */
        account?: string;
    }
}

declare function xmlToJson<T extends Record<string, any>>(xml: string, options?: ParserOptions): Promise<T>;
declare function jsonToXml(data: Record<string, any>): Promise<string>;

declare function isRoomId(id?: string): boolean;
declare function isContactOfficialId(id?: string): boolean;
declare function isContactCorporationId(id?: string): boolean;
declare function isIMRoomId(id?: string): boolean;
declare function isRoomOps(type: WechatMessageType): type is WechatMessageType.SysNotice | WechatMessageType.Sys;
declare function isContactId(id?: string): boolean;

type PrefixStorage<T extends StorageValue> = ReturnType<typeof createPrefixStorage<T>>;
declare function createPrefixStorage<T extends StorageValue>(storage: Storage<T>, base: string): {
    getItemsMap: (base?: string) => Promise<{
        key: string;
        value: T;
    }[]>;
    getItemsList(base?: string): Promise<T[]>;
    hasItem: (key: string, opts?: unstorage.TransactionOptions) => Promise<boolean>;
    getItem: <U extends T>(key: string, opts?: unstorage.TransactionOptions) => Promise<U | null>;
    getItems: <U extends T>(items: (string | {
        key: string;
        options?: unstorage.TransactionOptions;
    })[], commonOptions?: unstorage.TransactionOptions) => Promise<{
        key: string;
        value: U;
    }[]>;
    getItemRaw: <T_1 = any>(key: string, opts?: unstorage.TransactionOptions) => Promise<(T_1 extends any ? T_1 : any) | null>;
    setItem: <U extends T>(key: string, value: U, opts?: unstorage.TransactionOptions) => Promise<void>;
    setItems: <U extends T>(items: {
        key: string;
        value: U;
        options?: unstorage.TransactionOptions;
    }[], commonOptions?: unstorage.TransactionOptions) => Promise<void>;
    setItemRaw: <T_1 = any>(key: string, value: T_1 extends any ? T_1 : any, opts?: unstorage.TransactionOptions) => Promise<void>;
    removeItem: (key: string, opts?: (unstorage.TransactionOptions & {
        removeMeta?: boolean;
    }) | boolean) => Promise<void>;
    getMeta: (key: string, opts?: (unstorage.TransactionOptions & {
        nativeOnly?: boolean;
    }) | boolean) => unstorage.StorageMeta | Promise<unstorage.StorageMeta>;
    setMeta: (key: string, value: unstorage.StorageMeta, opts?: unstorage.TransactionOptions) => Promise<void>;
    removeMeta: (key: string, opts?: unstorage.TransactionOptions) => Promise<void>;
    getKeys: (base?: string, opts?: unstorage.TransactionOptions) => Promise<string[]>;
    clear: (base?: string, opts?: unstorage.TransactionOptions) => Promise<void>;
    dispose: () => Promise<void>;
    watch: (callback: unstorage.WatchCallback) => Promise<unstorage.Unwatch>;
    unwatch: () => Promise<void>;
    mount: (base: string, driver: unstorage.Driver) => Storage;
    unmount: (base: string, dispose?: boolean) => Promise<void>;
    getMount: (key?: string) => {
        base: string;
        driver: unstorage.Driver;
    };
    getMounts: (base?: string, options?: {
        parents?: boolean;
    }) => {
        base: string;
        driver: unstorage.Driver;
    }[];
};

declare function mentionTextParser(message: string): {
    mentions: string[];
    message: string;
};
declare function getMentionText(mentions?: string[], chatroomMembers?: WechatferryAgentChatRoomMember[]): string;

type Runner<T> = () => Promise<T | null>;
declare function executeRunners<T>(runners: Runner<T>[]): Promise<T | null>;

interface AppAttachPayload {
    totallen?: number;
    attachid?: string;
    emoticonmd5?: string;
    fileext?: string;
    cdnattachurl?: string;
    aeskey?: string;
    cdnthumbaeskey?: string;
    encryver?: number;
    islargefilemsg: number;
}
interface ReferMsgPayload {
    type: string;
    svrid: string;
    fromusr: string;
    chatusr: string;
    displayname: string;
    content: string;
}
interface ChannelsMsgPayload {
    objectId: string;
    feedType: string;
    nickname: string;
    avatar: string;
    desc: string;
    mediaCount: string;
    objectNonceId: string;
    liveId: string;
    username: string;
    authIconUrl: string;
    authIconType: string;
    mediaList?: {
        media?: {
            thumbUrl: string;
            fullCoverUrl: string;
            videoPlayDuration: string;
            url: string;
            height: string;
            mediaType: string;
            width: string;
        };
    };
    megaVideo?: object;
    bizAuthIconType?: string;
}
interface MiniAppMsgPayload {
    username: string;
    appid: string;
    pagepath: string;
    weappiconurl: string;
    shareId: string;
}
interface AppMessagePayload {
    des?: string;
    thumburl?: string;
    title: string;
    url: string;
    appattach?: AppAttachPayload;
    channel?: ChannelsMsgPayload;
    miniApp?: MiniAppMsgPayload;
    type: WechatAppMessageType;
    md5?: string;
    fromusername?: string;
    recorditem?: string;
    refermsg?: ReferMsgPayload;
}
declare function parseAppmsgMessagePayload(messageContent: string): Promise<AppMessagePayload>;

interface EmojiMessagePayload {
    type: number;
    len: number;
    md5: string;
    cdnurl: string;
    width: number;
    height: number;
    gameext?: string;
}
declare function parseEmotionMessagePayload(message: PUPPET.payloads.Message): Promise<EmojiMessagePayload>;

declare function parseMiniProgramMessagePayload(message: PUPPET.payloads.Message): Promise<PUPPET.payloads.MiniProgram>;

interface ContactCardXmlSchema {
    msg: {
        $: {
            bigheadimgurl: string;
            smallheadimgurl: string;
            username: string;
            nickname: string;
            fullpy: string;
            shortpy: string;
            alias: string;
            imagestatus: string;
            scene: string;
            province: string;
            city: string;
            sign: string;
            sex: string;
            certflag: string;
            certinfo: string;
            brandIconUrl: string;
            brandHomeUrl: string;
            brandSubscriptConfigUrl: string;
            brandFlags: string;
            regionCode: string;
            biznamecardinfo: string;
            antispamticket: string;
        };
    };
}
declare function parseContactCardMessagePayload(messageContent: string): Promise<PUPPET.payloads.ContactPayload>;
declare function buildContactCardXmlMessagePayload(contact: PUPPET.payloads.Contact): Promise<ContactCardXmlSchema>;

declare function parseTimelineMessagePayload(messageXml: string): Promise<{
    messages: _wechatferry_core.WxMsg[];
    payload: PUPPET.payloads.PostServer;
}>;

declare function roomTopicParser(puppet: PUPPET.Puppet, message: WechatferryAgentEventMessage): Promise<EventPayload>;

declare function messageParser(_puppet: WechatferryPuppet, message: WechatferryAgentEventMessage): Promise<EventPayload>;

declare function roomInviteParser(puppet: WechatferryPuppet, message: WechatferryAgentEventMessage): Promise<EventPayload>;

declare function roomJoinParser(puppet: WechatferryPuppet, message: WechatferryAgentEventMessage, retries?: number): Promise<EventPayload>;

declare function roomLeaveParser(puppet: WechatferryPuppet, message: WechatferryAgentEventMessage): Promise<EventPayload>;

declare function friendShipParser(puppet: WechatferryPuppet, message: WechatferryAgentEventMessage): Promise<EventPayload>;

declare function postParser(_puppet: WechatferryPuppet, message: WechatferryAgentEventMessage): Promise<EventPayload>;

declare enum EventType {
    Message = 0,
    Post = 1,
    Friendship = 2,
    RoomInvite = 3,
    RoomJoin = 4,
    RoomLeave = 5,
    RoomTopic = 6
}
interface EventPayloadSpec {
    [EventType.Message]: WechatferryAgentEventMessage;
    [EventType.Post]: PUPPET.payloads.EventPost;
    [EventType.Friendship]: PUPPET.payloads.Friendship;
    [EventType.RoomInvite]: PUPPET.payloads.RoomInvitation;
    [EventType.RoomJoin]: PUPPET.payloads.EventRoomJoin;
    [EventType.RoomLeave]: PUPPET.payloads.EventRoomLeave;
    [EventType.RoomTopic]: PUPPET.payloads.EventRoomTopic;
}
interface Event<T extends keyof EventPayloadSpec> {
    type: T;
    payload: EventPayloadSpec[T];
}
type EventPayload = EventPayloadSpec[keyof EventPayloadSpec] | null;
type EventParserHandler = (puppet: WechatferryPuppet, message: WechatferryAgentEventMessage) => Promise<EventPayload>;
declare function addEventParser(eventType: EventType, parser: EventParserHandler): void;
declare function parseEvent(puppet: WechatferryPuppet, message: WechatferryAgentEventMessage): Promise<Event<any>>;

declare function wechatferryContactToWechaty(contact: WechatferryAgentContact): PUPPET.payloads.Contact;
declare function wechatyContactToWechatferry(contact: PUPPET.payloads.Contact): WechatferryAgentContact;
declare module 'wechaty-puppet/payloads' {
    interface Contact {
        tags: string[];
    }
}

declare function wechatferryMessageToWechaty(puppet: PUPPET.Puppet, message: WechatferryAgentEventMessage): Promise<PuppetMessage>;
declare function wechatferryDBMessageToWechaty(puppet: PUPPET.Puppet, message: WechatferryAgentDBMessage): Promise<PuppetMessage>;
declare function wechatferryDBMessageToEventMessage(message: WechatferryAgentDBMessage): WechatferryAgentEventMessage;

declare function wechatferryRoomToWechaty(contact: WechatferryAgentChatRoom): PUPPET.payloads.Room;
declare function wechatferryRoomMemberToWechaty(chatRoomMember: WechatferryAgentChatRoomMember): PUPPET.payloads.RoomMember;
declare module 'wechaty-puppet/payloads' {
    interface Room {
        announce: string;
    }
}

export { type AppAttachPayload, type AppMessagePayload, type ChannelsMsgPayload, type EmojiMessagePayload, type Event, type EventParserHandler, type EventPayload, type EventPayloadSpec, EventType, type MiniAppMsgPayload, type PrefixStorage, type PuppetContact, type PuppetMessage, type PuppetRoom, type PuppetWcferryOptions, type PuppetWcferryUserOptions, type ReferMsgPayload, type Runner, WechatferryPuppet, addEventParser, buildContactCardXmlMessagePayload, createPrefixStorage, executeRunners, friendShipParser, getMentionText, isContactCorporationId, isContactId, isContactOfficialId, isIMRoomId, isRoomId, isRoomOps, jsonToXml, mentionTextParser, messageParser, parseAppmsgMessagePayload, parseContactCardMessagePayload, parseEmotionMessagePayload, parseEvent, parseMiniProgramMessagePayload, parseTimelineMessagePayload, postParser, resolvePuppetWcferryOptions, roomInviteParser, roomJoinParser, roomLeaveParser, roomTopicParser, wechatferryContactToWechaty, wechatferryDBMessageToEventMessage, wechatferryDBMessageToWechaty, wechatferryMessageToWechaty, wechatferryRoomMemberToWechaty, wechatferryRoomToWechaty, wechatyContactToWechatferry, xmlToJson };
