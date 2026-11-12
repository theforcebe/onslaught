import { useEffect, useRef, useState } from "react";
import {
  MessageCircle,
  X,
  Send,
  Users,
  LockKeyhole,
  ChevronLeft,
  Search,
  Hash,
  Mail,
  LoaderCircle,
} from "lucide-react";
import { chatCall, ChatError } from "./lib/api";
import { RANK_NAMES } from "./lib/access";
import type { Identity } from "./lib/model";
import type { ChatMessage, ChatStatus, ChatPage } from "./lib/chat";

export function GuildChat({
  identity,
  refresh,
}: {
  identity: Identity;
  refresh: () => void;
}) {
  const [open, setOpen] = useState(false),
    [directory, setDirectory] = useState(false),
    [peer, setPeer] = useState("");
  const [status, setStatus] = useState<ChatStatus>({ people: [], unread: {} }),
    [messages, setMessages] = useState<ChatMessage[]>([]);
  const [query, setQuery] = useState(""),
    [draft, setDraft] = useState(""),
    [error, setError] = useState("");
  const [loading, setLoading] = useState(false),
    [sending, setSending] = useState(false),
    [older, setOlder] = useState(false),
    [loadingOlder, setLoadingOlder] = useState(false),
    [blocked, setBlocked] = useState(false);
  const log = useRef<HTMLDivElement>(null),
    launcher = useRef<HTMLButtonElement>(null),
    field = useRef<HTMLTextAreaElement>(null);
  const bottom = useRef(true),
    seen = useRef(0),
    last = useRef(0),
    currentPeer = useRef(peer),
    currentOpen = useRef(open),
    mounted = useRef(true),
    refreshRef = useRef(refresh);
  const pending = useRef<{
    peer: string;
    body: string;
    clientId: string;
  } | null>(null);
  currentPeer.current = peer;
  currentOpen.current = open;
  refreshRef.current = refresh;
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const fail = (e: unknown) => {
    if (!mounted.current) return;
    setError(
      e instanceof Error ? e.message : "Chat could not connect. Try again.",
    );
    if (e instanceof ChatError && (e.status === 401 || e.status === 403)) {
      setMessages([]);
      setStatus({ people: [], unread: {} });
      setDraft("");
      setBlocked(true);
      refreshRef.current();
    }
  };
  useEffect(() => {
    if (blocked) return;
    let active = true,
      busy = false;
    const poll = async () => {
      if (busy || document.visibilityState !== "visible") return;
      busy = true;
      try {
        const data = await chatCall<ChatStatus>("status");
        if (active) setStatus(data);
      } catch (e) {
        if (active) fail(e);
      } finally {
        busy = false;
      }
    };
    void poll();
    const timer = setInterval(() => void poll(), open ? 15000 : 30000);
    document.addEventListener("visibilitychange", poll);
    return () => {
      active = false;
      clearInterval(timer);
      document.removeEventListener("visibilitychange", poll);
    };
  }, [open, blocked]);
  useEffect(() => {
    if (!open || blocked) return;
    let active = true,
      busy = false,
      initialized = false;
    setMessages([]);
    setLoading(true);
    setError("");
    last.current = 0;
    seen.current = 0;
    bottom.current = true;
    const poll = async () => {
      if (busy || document.visibilityState !== "visible") return;
      busy = true;
      try {
        let more = true,
          pages = 0;
        while (more && pages++ < 10 && active) {
          const initial = !initialized;
          const p = new URLSearchParams(peer ? { peer } : {});
          if (initial === false) p.set("after", String(last.current));
          const data = await chatCall<ChatPage>(`messages?${p}`);
          if (!active) return;
          if (initial) setOlder(data.hasMore);
          if (data.messages.length) {
            last.current = data.messages.at(-1)!.seq;
            setMessages((old) =>
              initial
                ? data.messages
                : [
                    ...old,
                    ...data.messages.filter(
                      (m) => !old.some((x) => x.seq === m.seq),
                    ),
                  ].sort((a, b) => a.seq - b.seq),
            );
          }
          initialized = true;
          more = !initial && data.hasMore;
        }
        if (active) setError("");
      } catch (e) {
        if (active) fail(e);
      } finally {
        busy = false;
        if (active) setLoading(false);
      }
    };
    void poll();
    const timer = setInterval(() => void poll(), 10000);
    document.addEventListener("visibilitychange", poll);
    return () => {
      active = false;
      clearInterval(timer);
      document.removeEventListener("visibilitychange", poll);
    };
  }, [open, peer, blocked]);
  const markRead = () => {
    const through = last.current;
    if (
      !open ||
      directory ||
      blocked ||
      !bottom.current ||
      document.visibilityState !== "visible" ||
      through <= seen.current
    )
      return;
    const selected = peer;
    seen.current = through;
    void chatCall("read", { ...(peer ? { peer } : {}), through })
      .then(() => {
        if (mounted.current && currentPeer.current === selected)
          setStatus((s) => ({
            ...s,
            unread: { ...s.unread, [selected || "general"]: 0 },
          }));
      })
      .catch((e) => {
        seen.current = 0;
        fail(e);
      });
  };
  useEffect(() => {
    if (open && bottom.current && !directory) {
      if (log.current) log.current.scrollTop = log.current.scrollHeight;
      markRead();
    }
    document.addEventListener("visibilitychange", markRead);
    return () => document.removeEventListener("visibilitychange", markRead);
  }, [messages, open, directory]);
  useEffect(() => {
    if (open && !directory && !sending) field.current?.focus();
  }, [open, directory, peer, sending]);
  const choose = (id: string) => {
    setPeer(id);
    setDirectory(false);
    setDraft("");
    pending.current = null;
    setError("");
  };
  const close = () => {
    setOpen(false);
    launcher.current?.focus();
  };
  const loadOlder = async () => {
    if (!messages.length || loadingOlder) return;
    const selected = peer,
      oldHeight = log.current?.scrollHeight || 0;
    setLoadingOlder(true);
    bottom.current = false;
    try {
      const p = new URLSearchParams({
        before: String(messages[0].seq),
        ...(peer ? { peer } : {}),
      });
      const data = await chatCall<ChatPage>(`messages?${p}`);
      if (currentPeer.current !== selected || !mounted.current) return;
      setMessages((old) => [
        ...data.messages.filter((m) => !old.some((x) => x.seq === m.seq)),
        ...old,
      ]);
      setOlder(data.hasMore);
      requestAnimationFrame(() => {
        if (log.current)
          log.current.scrollTop += log.current.scrollHeight - oldHeight;
      });
    } catch (e) {
      fail(e);
    } finally {
      if (mounted.current) setLoadingOlder(false);
    }
  };
  const send = async () => {
    const body = draft.trim(),
      selected = peer;
    if (!body || sending || blocked) return;
    if (
      !pending.current ||
      pending.current.peer !== peer ||
      pending.current.body !== body
    )
      pending.current = { peer, body, clientId: crypto.randomUUID() };
    setSending(true);
    setError("");
    try {
      const result = await chatCall<{ message: ChatMessage }>("messages", {
        body,
        clientId: pending.current.clientId,
        ...(peer ? { peer } : {}),
      });
      if (!mounted.current) return;
      if (currentPeer.current === selected && currentOpen.current) {
        // Do not advance the incremental cursor: messages arriving during this send must still be fetched.
        setMessages((old) =>
          [
            ...old.filter((m) => m.seq !== result.message.seq),
            result.message,
          ].sort((a, b) => a.seq - b.seq),
        );
        setDraft("");
        pending.current = null;
        bottom.current = true;
        field.current?.focus();
      }
    } catch (e) {
      fail(e);
    } finally {
      if (mounted.current) setSending(false);
    }
  };
  const person = status.people.find((p) => p.id === peer),
    unread = Object.values(status.unread).reduce((a, b) => a + b, 0);
  return (
    <>
      <button
        ref={launcher}
        className={`chat-launcher ${open ? "is-open" : ""}`}
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-controls="guild-messenger"
      >
        <MessageCircle size={19} />
        <span>Guild chat</span>
        {unread > 0 && (
          <b aria-label={`${unread} unread messages`}>
            {unread > 99 ? "99+" : unread}
          </b>
        )}
      </button>
      {open && (
        <section
          id="guild-messenger"
          className="guild-messenger"
          role="dialog"
          aria-label="Guild messenger"
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              e.stopPropagation();
              close();
            }
          }}
        >
          <header className="messenger-title">
            <MessageCircle size={17} />
            <strong>Ønslaught messenger</strong>
            <button
              className="icon-btn"
              onClick={close}
              aria-label="Minimize guild chat"
            >
              <X size={17} />
            </button>
          </header>
          <div className="messenger-tabs">
            <button
              className={!peer && !directory ? "active" : ""}
              onClick={() => choose("")}
            >
              <Hash size={16} />
              General
              {(status.unread.general || 0) > 0 && (
                <b>{status.unread.general}</b>
              )}
            </button>
            <button
              className={peer || directory ? "active" : ""}
              onClick={() => setDirectory((v) => !v)}
            >
              <Mail size={16} />
              Private messages
              {unread - (status.unread.general || 0) > 0 && (
                <b>{unread - (status.unread.general || 0)}</b>
              )}
            </button>
          </div>
          {error && (
            <p className="chat-error" role="alert">
              {error}
            </p>
          )}
          {!blocked &&
            (directory ? (
              <div className="chat-directory">
                <label className="chat-search">
                  <Search size={16} />
                  <input
                    autoFocus
                    placeholder="Find a guild member…"
                    aria-label="Find a guild member"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                  />
                </label>
                <p>Choose a member to start a private conversation.</p>
                <div className="chat-people">
                  {status.people
                    .filter((p) =>
                      p.label.toLowerCase().includes(query.toLowerCase()),
                    )
                    .map((p) => (
                      <button key={p.id} onClick={() => choose(p.id)}>
                        <span className="chat-avatar">
                          {p.label.slice(0, 1)}
                        </span>
                        <span>
                          <strong>{p.label}</strong>
                          <small>{RANK_NAMES[p.role]}</small>
                        </span>
                        {status.unread[p.id] > 0 ? (
                          <b>{status.unread[p.id]}</b>
                        ) : (
                          <LockKeyhole size={14} />
                        )}
                      </button>
                    ))}
                  {!status.people.length && (
                    <p>No other approved members yet.</p>
                  )}
                </div>
              </div>
            ) : (
              <>
                <div className="chat-conversation-heading">
                  {peer ? (
                    <>
                      <button
                        className="icon-btn"
                        aria-label="Choose another member"
                        onClick={() => setDirectory(true)}
                      >
                        <ChevronLeft size={17} />
                      </button>
                      <LockKeyhole size={14} />
                      <span>
                        <strong>{person?.label || "Guild member"}</strong>
                        <small>
                          Only the two of you can open this conversation in the
                          app.
                        </small>
                      </span>
                    </>
                  ) : (
                    <>
                      <Users size={17} />
                      <span>
                        <strong>Guild general</strong>
                        <small>A shared room for approved guild members.</small>
                      </span>
                    </>
                  )}
                </div>
                <div
                  className="chat-log"
                  ref={log}
                  role="log"
                  aria-label={
                    peer ? "Private conversation" : "General guild messages"
                  }
                  aria-live="polite"
                  aria-relevant="additions"
                  onScroll={() => {
                    const el = log.current;
                    if (el) {
                      bottom.current =
                        el.scrollHeight - el.scrollTop - el.clientHeight < 65;
                      markRead();
                    }
                  }}
                >
                  {older && (
                    <button
                      className="chat-history"
                      disabled={loadingOlder}
                      onClick={() => void loadOlder()}
                    >
                      {loadingOlder ? "Loading…" : "Load earlier messages"}
                    </button>
                  )}
                  {loading ? (
                    <p className="chat-empty">
                      <LoaderCircle size={20} />
                      Opening the conversation…
                    </p>
                  ) : !messages.length ? (
                    <div className="chat-empty">
                      <MessageCircle size={30} />
                      <strong>
                        {peer
                          ? "Start a conversation"
                          : "Meet by the guild fire"}
                      </strong>
                      <p>
                        {peer
                          ? "Send a private message to this guild member."
                          : "Ask a question, find a group, or catch up with the guild."}
                      </p>
                    </div>
                  ) : (
                    messages.map((m, i) => (
                      <div
                        key={m.seq}
                        className={`chat-message ${m.senderId === identity.id ? "own" : ""}`}
                      >
                        {(i === 0 ||
                          new Date(messages[i - 1].sentAt).toDateString() !==
                            new Date(m.sentAt).toDateString()) && (
                          <div className="chat-date">
                            {new Date(m.sentAt).toLocaleDateString(undefined, {
                              month: "short",
                              day: "numeric",
                              year: "numeric",
                            })}
                          </div>
                        )}
                        <div className="chat-byline">
                          <strong>
                            {m.senderId === identity.id ? "You" : m.senderName}
                          </strong>
                          <time
                            dateTime={new Date(m.sentAt).toISOString()}
                            title={new Date(m.sentAt).toLocaleString()}
                          >
                            {new Date(m.sentAt).toLocaleTimeString(undefined, {
                              hour: "numeric",
                              minute: "2-digit",
                            })}
                          </time>
                        </div>
                        <p>{m.body}</p>
                      </div>
                    ))
                  )}
                </div>
                <form
                  className="chat-compose"
                  onSubmit={(e) => {
                    e.preventDefault();
                    void send();
                  }}
                >
                  <label className="sr-only" htmlFor="guild-chat-message">
                    Message
                  </label>
                  <textarea
                    ref={field}
                    id="guild-chat-message"
                    value={draft}
                    maxLength={2000}
                    rows={2}
                    placeholder={
                      peer
                        ? `Message ${person?.label.split("#")[0] || "member"}…`
                        : "Message the guild…"
                    }
                    onChange={(e) => setDraft(e.target.value)}
                    disabled={sending}
                    onKeyDown={(e) => {
                      if (
                        e.key === "Enter" &&
                        !e.shiftKey &&
                        !e.nativeEvent.isComposing
                      ) {
                        e.preventDefault();
                        void send();
                      }
                    }}
                  />
                  <div>
                    <small>
                      {draft.length}/2000 · Shift + Enter for a new line
                    </small>
                    <button
                      className="btn primary"
                      disabled={sending || !draft.trim()}
                      type="submit"
                    >
                      {sending ? (
                        <LoaderCircle size={15} />
                      ) : (
                        <Send size={15} />
                      )}
                      Send
                    </button>
                  </div>
                </form>
              </>
            ))}
          <footer className="chat-footnote">
            Site chat · updates every 10 seconds when open
          </footer>
        </section>
      )}
    </>
  );
}
