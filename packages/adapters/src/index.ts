import type { RawPageSignals, SiteId } from "@openpet/shared/types";
import {
  collectDeepSeekSignals,
  detectDeepSeekPage,
  findComposer as findDeepSeekComposer,
  findSendButton as findDeepSeekSendButton,
  isDeepSeekUrl,
} from "./deepseek";
import {
  collectChatGPTSignals,
  detectChatGPTPage,
  findChatGPTComposer,
  findChatGPTSendButton,
  isChatGPTUrl,
} from "./chatgpt";
import {
  collectDoubaoSignals,
  detectDoubaoPage,
  findDoubaoComposer,
  findDoubaoSendButton,
  isDoubaoUrl,
} from "./doubao";
import {
  collectGeminiSignals,
  detectGeminiPage,
  findGeminiComposer,
  findGeminiSendButton,
  isGeminiUrl,
} from "./gemini";

export interface SiteAdapter {
  siteId: SiteId;
  matches(url: string): boolean;
  detectPage(doc: Document): boolean;
  getObservationRoot?(doc: Document): Element | Document;
  findComposer(doc: Document): Element | null;
  findSendButton(doc: Document): HTMLButtonElement | null;
  collectSignals(doc: Document, previous?: Partial<RawPageSignals>): RawPageSignals;
}

export const siteAdapters: SiteAdapter[] = [
  {
    siteId: "deepseek",
    matches: isDeepSeekUrl,
    detectPage: detectDeepSeekPage,
    getObservationRoot: (doc) => doc,
    findComposer: findDeepSeekComposer,
    findSendButton: findDeepSeekSendButton,
    collectSignals: collectDeepSeekSignals,
  },
  {
    siteId: "gemini",
    matches: isGeminiUrl,
    detectPage: detectGeminiPage,
    getObservationRoot: (doc) => doc,
    findComposer: findGeminiComposer,
    findSendButton: findGeminiSendButton,
    collectSignals: collectGeminiSignals,
  },
  {
    siteId: "chatgpt",
    matches: isChatGPTUrl,
    detectPage: detectChatGPTPage,
    getObservationRoot: (doc) => doc.querySelector("main") ?? doc,
    findComposer: findChatGPTComposer,
    findSendButton: findChatGPTSendButton,
    collectSignals: collectChatGPTSignals,
  },
  {
    siteId: "doubao",
    matches: isDoubaoUrl,
    detectPage: detectDoubaoPage,
    getObservationRoot: (doc) => doc.querySelector("main") ?? doc,
    findComposer: findDoubaoComposer,
    findSendButton: findDoubaoSendButton,
    collectSignals: collectDoubaoSignals,
  },
];

export function getAdapterForUrl(url: string): SiteAdapter | null {
  return siteAdapters.find((adapter) => adapter.matches(url)) ?? null;
}
