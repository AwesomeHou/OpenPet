import type { RawPageSignals, SiteId } from "@openpet/shared/types";
import {
  collectDeepSeekSignals,
  detectDeepSeekPage,
  findComposer as findDeepSeekComposer,
  findSendButton as findDeepSeekSendButton,
  isDeepSeekResponseInProgress,
  isDeepSeekUrl,
} from "./deepseek";
import {
  collectChatGPTSignals,
  detectChatGPTPage,
  findChatGPTComposer,
  findChatGPTSendButton,
  isChatGPTResponseInProgress,
  isChatGPTUrl,
} from "./chatgpt";
import {
  collectDoubaoSignals,
  detectDoubaoPage,
  findDoubaoComposer,
  findDoubaoSendButton,
  isDoubaoResponseInProgress,
  isDoubaoUrl,
} from "./doubao";
import {
  collectGeminiSignals,
  detectGeminiPage,
  findGeminiComposer,
  findGeminiSendButton,
  isGeminiResponseInProgress,
  isGeminiUrl,
} from "./gemini";

export interface SiteAdapter {
  siteId: SiteId;
  matches(url: string): boolean;
  detectPage(doc: Document): boolean;
  getObservationRoot?(doc: Document): Element | Document;
  getResponseRoot?(doc: Document): Element | Document;
  findComposer(doc: Document): Element | null;
  findSendButton(doc: Document): HTMLButtonElement | null;
  isResponseInProgress?(doc: Document): boolean;
  collectSignals(doc: Document, previous?: Partial<RawPageSignals>): RawPageSignals;
}

export const siteAdapters: SiteAdapter[] = [
  {
    siteId: "deepseek",
    matches: isDeepSeekUrl,
    detectPage: detectDeepSeekPage,
    getObservationRoot: (doc) => doc,
    getResponseRoot: (doc) => doc.querySelector("main") ?? doc.body ?? doc,
    findComposer: findDeepSeekComposer,
    findSendButton: findDeepSeekSendButton,
    isResponseInProgress: isDeepSeekResponseInProgress,
    collectSignals: collectDeepSeekSignals,
  },
  {
    siteId: "gemini",
    matches: isGeminiUrl,
    detectPage: detectGeminiPage,
    getObservationRoot: (doc) => doc,
    getResponseRoot: (doc) => doc.querySelector("main") ?? doc.body ?? doc,
    findComposer: findGeminiComposer,
    findSendButton: findGeminiSendButton,
    isResponseInProgress: isGeminiResponseInProgress,
    collectSignals: collectGeminiSignals,
  },
  {
    siteId: "chatgpt",
    matches: isChatGPTUrl,
    detectPage: detectChatGPTPage,
    getObservationRoot: (doc) => doc.querySelector("main") ?? doc,
    getResponseRoot: (doc) => doc.querySelector("main") ?? doc.body ?? doc,
    findComposer: findChatGPTComposer,
    findSendButton: findChatGPTSendButton,
    isResponseInProgress: isChatGPTResponseInProgress,
    collectSignals: collectChatGPTSignals,
  },
  {
    siteId: "doubao",
    matches: isDoubaoUrl,
    detectPage: detectDoubaoPage,
    getObservationRoot: (doc) => doc.querySelector("main") ?? doc,
    getResponseRoot: (doc) => doc.querySelector("main") ?? doc.body ?? doc,
    findComposer: findDoubaoComposer,
    findSendButton: findDoubaoSendButton,
    isResponseInProgress: isDoubaoResponseInProgress,
    collectSignals: collectDoubaoSignals,
  },
];

export function getAdapterForUrl(url: string): SiteAdapter | null {
  return siteAdapters.find((adapter) => adapter.matches(url)) ?? null;
}
