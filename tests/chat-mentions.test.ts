import { describe, it, expect } from "vitest";
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import {
  moveMentions,
  mentionQuery,
  messageParts,
} from "../src/lib/chat-mentions";

describe("chat mention composition", () => {
  it("upgrades existing chat history without changing messages or read cursors", () => {
    const db = new DatabaseSync(":memory:");
    try {
      db.exec(readFileSync("server/chat-schema.sql", "utf8"));
      db.prepare(
        "INSERT INTO chat_messages(thread_key,sender_id,sender_label,body,sent_at,client_id) VALUES('general','alice','Alice','Existing message',1,'previous-send')",
      ).run();
      db.prepare("INSERT INTO chat_reads VALUES('bob','general',1)").run();
      db.exec(readFileSync("server/chat-mentions.sql", "utf8"));
      expect(
        db.prepare("SELECT body,mentions_json FROM chat_messages").get(),
      ).toMatchObject({ body: "Existing message", mentions_json: "[]" });
      expect(
        db.prepare("SELECT last_seq FROM chat_reads").get()?.last_seq,
      ).toBe(1);
      expect(
        db.prepare("SELECT COUNT(*) AS n FROM chat_mentions").get()?.n,
      ).toBe(0);
    } finally {
      db.close();
    }
  });
  const text = "Hi @Bob#1234, welcome!",
    mentions = [{ id: "bob", start: 3, end: 12 }];
  it("keeps identity after edits before or after a mention and drops it when its name is edited", () => {
    expect(moveMentions(text, "Hey " + text, mentions)).toEqual([
      { id: "bob", start: 7, end: 16 },
    ]);
    expect(moveMentions(text, text + " 🎉", mentions)).toEqual(mentions);
    expect(moveMentions(text, text.replace("Bob", "Carol"), mentions)).toEqual(
      [],
    );
    expect(moveMentions(text, "Hi welcome!", mentions)).toEqual([]);
    expect(moveMentions(text, "Hi @Bob#1234, @Bob#1234!", mentions)).toEqual(
      mentions,
    );
  });
  it("offers names with spaces, respects the caret, and ignores email addresses and already selected mentions", () => {
    expect(mentionQuery("Hi @Fictional O", 15, [])).toEqual({
      start: 3,
      end: 15,
      query: "Fictional O",
    });
    expect(mentionQuery("Hi @B later", 5, [])).toEqual({
      start: 3,
      end: 5,
      query: "B",
    });
    expect(mentionQuery("x@example.com", 13, [])).toBeNull();
    expect(mentionQuery(text, 7, mentions)).toBeNull();
  });
  it("renders only selected text as mentions and preserves HTML-like text as plain text", () => {
    expect(messageParts(text, mentions)).toEqual([
      { text: "Hi " },
      { text: "@Bob#1234", id: "bob" },
      { text: ", welcome!" },
    ]);
    expect(messageParts("<script>alert(1)</script> @everyone", [])).toEqual([
      { text: "<script>alert(1)</script> @everyone" },
    ]);
  });
});
