/** Thin client for the Telegram Bot API — plain fetch, no SDK dependency, matching the same
 * style as lib/ai/ollama.ts. Long-polling via getUpdates rather than a webhook: no public
 * HTTPS URL, no ngrok/tunnel needed for local dev, which is the whole point of the blueprint's
 * own "free, instant setup" framing for a hackathon build. */

const API_BASE = "https://api.telegram.org";

export interface TelegramUser {
  id: number;
  first_name: string;
  username?: string;
}

export interface TelegramMessage {
  message_id: number;
  from?: TelegramUser;
  chat: { id: number };
  text?: string;
}

export interface TelegramCallbackQuery {
  id: string;
  from: TelegramUser;
  message?: { chat: { id: number } };
  data?: string;
}

export interface TelegramUpdate {
  update_id: number;
  message?: TelegramMessage;
  callback_query?: TelegramCallbackQuery;
}

export interface InlineKeyboardButton {
  text: string;
  callback_data: string;
}

export class TelegramClient {
  private base: string;

  constructor(token: string) {
    this.base = `${API_BASE}/bot${token}`;
  }

  /** Long-polls for new updates. Blocks up to `timeoutS` server-side (Telegram holds the
   * connection open), so a tight loop calling this doesn't hammer the API — the standard,
   * documented way to poll without a webhook. */
  async getUpdates(offset: number, timeoutS = 25): Promise<TelegramUpdate[]> {
    const res = await fetch(`${this.base}/getUpdates?offset=${offset}&timeout=${timeoutS}`, { signal: AbortSignal.timeout((timeoutS + 10) * 1000) });
    if (!res.ok) throw new Error(`getUpdates failed: ${res.status}`);
    const data = (await res.json()) as { ok: boolean; result: TelegramUpdate[] };
    if (!data.ok) throw new Error("getUpdates returned ok:false");
    return data.result;
  }

  async sendMessage(chatId: number | string, text: string, buttons?: InlineKeyboardButton[][]): Promise<void> {
    await fetch(`${this.base}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        parse_mode: "Markdown",
        reply_markup: buttons ? { inline_keyboard: buttons } : undefined,
      }),
    });
  }

  async answerCallbackQuery(callbackQueryId: string, text?: string): Promise<void> {
    await fetch(`${this.base}/answerCallbackQuery`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ callback_query_id: callbackQueryId, text }),
    });
  }

  async getMe(): Promise<{ id: number; username: string } | null> {
    try {
      const res = await fetch(`${this.base}/getMe`, { signal: AbortSignal.timeout(5000) });
      if (!res.ok) return null;
      const data = (await res.json()) as { ok: boolean; result: { id: number; username: string } };
      return data.ok ? data.result : null;
    } catch {
      return null;
    }
  }
}
