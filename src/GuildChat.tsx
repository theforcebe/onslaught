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
  AtSign,
  Bell,
  Volume2,
  VolumeX,
  Settings2,
} from "lucide-react";
import { chatCall, ChatError } from "./lib/api";
import { RANK_NAMES } from "./lib/access";
import type { Identity } from "./lib/model";
import type {
  ChatMessage,
  ChatStatus,
  ChatPage,
  ChatMention,
  ChatPerson,
  ChatNotification,
  ChatDelivery,
} from "./lib/chat";
import { mentionQuery, moveMentions, messageParts } from "./lib/chat-mentions";
import { chatBell, newChatAlert } from "./lib/chat-alerts";

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
  const [notice, setNotice] = useState<ChatNotification | null>(null),
    [preferences, setPreferences] = useState(false),
    [savingPreferences, setSavingPreferences] = useState(false),
    [delivery, setDelivery] = useState<ChatDelivery | null>(null),
    [sound, setSound] = useState(() => {
      try {
        return localStorage.getItem("onslaught-chat-sound") !== "off";
      } catch {
        return true;
      }
    });
  const bell = useRef<ReturnType<typeof chatBell> | null>(null),
    soundRef = useRef(sound),
    notificationSeq = useRef<number | null>(null),
    reading = useRef({ peer: "", visible: false });
  soundRef.current = sound;
  const [mentionsOnly, setMentionsOnly] = useState(false),
    [draftMentions, setDraftMentions] = useState<ChatMention[]>([]),
    [caret, setCaret] = useState(0),
    [mentionIndex, setMentionIndex] = useState(0),
    [mentionDismissed, setMentionDismissed] = useState(false);
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
  const scope = `${peer}:${mentionsOnly}`,
    currentScope = useRef(scope),
    loadedScope = useRef(""),
    acknowledgedMentions = useRef(new Set<number>());
  currentScope.current = scope;
  const pending = useRef<{
    peer: string;
    body: string;
    clientId: string;
    mentionKey: string;
  } | null>(null);
  currentPeer.current = peer;
  currentOpen.current = open;
  reading.current = {
    peer,
    visible: open && !directory && !preferences && bottom.current,
  };
  refreshRef.current = refresh;
  useEffect(() => {
    mounted.current = true;
    bell.current = chatBell();
    const unlock = () => {
      if (soundRef.current) void bell.current?.unlock();
    };
    window.addEventListener("pointerdown", unlock);
    window.addEventListener("keydown", unlock);
    return () => {
      mounted.current = false;
      window.removeEventListener("pointerdown", unlock);
      window.removeEventListener("keydown", unlock);
      bell.current?.close();
    };
  }, []);
  useEffect(() => {
    try {
      localStorage.setItem("onslaught-chat-sound", sound ? "on" : "off");
    } catch {
      /* Private browsing may disable storage. */
    }
  }, [sound]);
  const receiveStatus = (data: ChatStatus) => {
    const latest = data.latestNotification;
    const viewing = {
      ...reading.current,
      visible:
        reading.current.visible &&
        bottom.current &&
        document.visibilityState === "visible" &&
        document.hasFocus(),
    };
    if (newChatAlert(latest, notificationSeq.current, viewing)) {
      setNotice(latest!);
      if (soundRef.current) bell.current?.play();
    } else if (
      notificationSeq.current === null &&
      latest &&
      !(viewing.visible && latest.peer === viewing.peer)
    )
      setNotice(latest);
    notificationSeq.current = Math.max(
      notificationSeq.current || 0,
      latest?.seq || 0,
    );
    setNotice((old) =>
      old &&
      (!latest ||
        old.seq > latest.seq ||
        (viewing.visible && old.peer === viewing.peer))
        ? null
        : old,
    );
    setStatus(data);
  };
  const saveDiscordPreference = async (enabled: boolean) => {
    setSavingPreferences(true);
    try {
      const data = await chatCall<{
        discord: { linked: boolean; enabled: boolean };
      }>("preferences", { discordDM: enabled });
      setStatus((s) => ({ ...s, discord: data.discord }));
    } catch (e) {
      fail(e);
    } finally {
      setSavingPreferences(false);
    }
  };
  const fail = (e: unknown) => {
    if (!mounted.current) return;
    setError(
      e instanceof Error ? e.message : "Chat could not connect. Try again.",
    );
    if (e instanceof ChatError && (e.status === 401 || e.status === 403)) {
      setMessages([]);
      setStatus({ people: [], unread: {} });
      setDraft("");
      setDraftMentions([]);
      setBlocked(true);
      setNotice(null);
      refreshRef.current();
    }
  };
  useEffect(() => {
    if (blocked) return;
    let active = true,
      busy = false;
    const poll = async () => {
      if (busy) return;
      busy = true;
      try {
        const data = await chatCall<ChatStatus>("status");
        if (active) receiveStatus(data);
      } catch (e) {
        if (active) fail(e);
      } finally {
        busy = false;
      }
    };
    void poll();
    const timer = setInterval(() => void poll(), 10000);
    document.addEventListener("visibilitychange", poll);
    window.addEventListener("focus", poll);
    return () => {
      active = false;
      clearInterval(timer);
      document.removeEventListener("visibilitychange", poll);
      window.removeEventListener("focus", poll);
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
    loadedScope.current = "";
    acknowledgedMentions.current = new Set();
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
          if (mentionsOnly) p.set("mentions", "1");
          if (initial === false) p.set("after", String(last.current));
          const data = await chatCall<ChatPage>(`messages?${p}`);
          if (!active) return;
          loadedScope.current = scope;
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
    const timer = setInterval(() => void poll(), 5000);
    document.addEventListener("visibilitychange", poll);
    return () => {
      active = false;
      clearInterval(timer);
      document.removeEventListener("visibilitychange", poll);
    };
  }, [open, peer, mentionsOnly, blocked]);
  const markRead = () => {
    const through = mentionsOnly ? 0 : last.current;
    if (
      !open ||
      directory ||
      preferences ||
      blocked ||
      !bottom.current ||
      document.visibilityState !== "visible" ||
      !document.hasFocus() ||
      loadedScope.current !== scope
    )
      return;
    const mentionSeqs = peer
      ? []
      : messages
          .filter(
            (m) =>
              m.mentions?.some((n) => n.id === identity.id) &&
              !acknowledgedMentions.current.has(m.seq),
          )
          .map((m) => m.seq)
          .slice(0, 50);
    if (through <= seen.current && !mentionSeqs.length) return;
    const selectedScope = scope;
    mentionSeqs.forEach((seq) => acknowledgedMentions.current.add(seq));
    seen.current = through;
    void chatCall<
      Pick<ChatStatus, "unread" | "unreadMentions" | "latestNotification">
    >("read", {
      ...(peer ? { peer } : {}),
      through,
      mentionSeqs,
    })
      .then((result) => {
        if (mounted.current && currentScope.current === selectedScope)
          setStatus((s) => ({
            ...s,
            unread: result.unread,
            unreadMentions: result.unreadMentions,
            latestNotification: result.latestNotification,
          }));
        if (!result.latestNotification) setNotice(null);
      })
      .catch((e) => {
        if (currentScope.current === selectedScope) {
          seen.current = 0;
          mentionSeqs.forEach((seq) =>
            acknowledgedMentions.current.delete(seq),
          );
        }
        fail(e);
      });
  };
  useEffect(() => {
    if (open && bottom.current && !directory) {
      if (log.current) log.current.scrollTop = log.current.scrollHeight;
      markRead();
    }
    document.addEventListener("visibilitychange", markRead);
    window.addEventListener("focus", markRead);
    return () => {
      document.removeEventListener("visibilitychange", markRead);
      window.removeEventListener("focus", markRead);
    };
  }, [messages, open, directory, preferences, scope]);
  useEffect(() => {
    if (open && !directory && !sending && !mentionsOnly) field.current?.focus();
  }, [open, directory, peer, sending, mentionsOnly]);
  const choose = (id: string, showMentions = false) => {
    if (`${id}:${showMentions}` !== scope) loadedScope.current = "";
    setPeer(id);
    setMentionsOnly(showMentions);
    setDirectory(false);
    setPreferences(false);
    setNotice(null);
    setDelivery(null);
    if (id !== peer) {
      setDraft("");
      setDraftMentions([]);
      pending.current = null;
    }
    setMentionDismissed(true);
    setError("");
  };
  const close = () => {
    setOpen(false);
    launcher.current?.focus();
  };
  const loadOlder = async () => {
    if (!messages.length || loadingOlder) return;
    const selectedScope = scope,
      oldHeight = log.current?.scrollHeight || 0;
    setLoadingOlder(true);
    bottom.current = false;
    try {
      const p = new URLSearchParams({
        before: String(messages[0].seq),
        ...(peer ? { peer } : {}),
      });
      if (mentionsOnly) p.set("mentions", "1");
      const data = await chatCall<ChatPage>(`messages?${p}`);
      if (currentScope.current !== selectedScope || !mounted.current) return;
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
    const body = draft,
      selected = peer;
    if (!body.trim() || sending || blocked) return;
    const mentionKey = JSON.stringify(draftMentions);
    if (
      !pending.current ||
      pending.current.peer !== peer ||
      pending.current.body !== body ||
      pending.current.mentionKey !== mentionKey
    )
      pending.current = {
        peer,
        body,
        mentionKey,
        clientId: crypto.randomUUID(),
      };
    setSending(true);
    setError("");
    try {
      const result = await chatCall<{
        message: ChatMessage;
        discordDelivery?: ChatDelivery;
      }>("messages", {
        body,
        mentions: draftMentions,
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
        setDraftMentions([]);
        pending.current = null;
        setDelivery(result.discordDelivery || null);
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
    unread = Object.values(status.unread).reduce((a, b) => a + b, 0),
    unreadMentions = status.unreadMentions || 0;
  const privateUnread = unread - (status.unread.general || 0);
  useEffect(() => {
    const original = document.title.replace(/^\(\d+\) /, "");
    const count = privateUnread + unreadMentions;
    document.title = count ? `(${count}) ${original}` : original;
    return () => {
      document.title = original;
    };
  }, [privateUnread, unreadMentions]);
  const match =
    !peer && !mentionDismissed && draftMentions.length < 10
      ? mentionQuery(draft, caret, draftMentions)
      : null;
  const suggestions = match
    ? status.people
        .filter((p) =>
          p.label.toLocaleLowerCase().includes(match.query.toLocaleLowerCase()),
        )
        .slice(0, 6)
    : [];
  const selectedSuggestion = Math.min(
    mentionIndex,
    Math.max(0, suggestions.length - 1),
  );
  const insertMention = (member: ChatPerson) => {
    if (!match) return;
    const label = `@${member.label}`,
      next = draft.slice(0, match.start) + label + " " + draft.slice(match.end),
      end = match.start + label.length;
    if (next.length > 2000) {
      setError(
        "Make a little room in your message before adding this mention.",
      );
      return;
    }
    setDraftMentions(
      [
        ...moveMentions(draft, next, draftMentions),
        { id: member.id, start: match.start, end },
      ].sort((a, b) => a.start - b.start),
    );
    setDraft(next);
    setCaret(end + 1);
    setMentionDismissed(true);
    setMentionIndex(0);
    requestAnimationFrame(() => {
      field.current?.focus();
      field.current?.setSelectionRange(end + 1, end + 1);
    });
  };
  return (
    <>
      {notice && !blocked && (
        <aside className="chat-notification" role="status" aria-live="polite">
          <Bell size={20} />
          <button
            onClick={() => {
              choose(notice.peer, notice.kind === "mention");
              setOpen(true);
            }}
          >
            <strong>
              {notice.kind === "dm" ? "Private message" : "You were mentioned"}
            </strong>
            <span>{notice.senderName} · Open conversation</span>
          </button>
          <button
            className="icon-btn"
            aria-label="Dismiss chat notification"
            onClick={() => setNotice(null)}
          >
            <X size={16} />
          </button>
        </aside>
      )}
      <button
        ref={launcher}
        className={`chat-launcher ${open ? "is-open" : ""}`}
        onClick={() => {
          if (!open && privateUnread > 0) {
            setDirectory(true);
            setPreferences(false);
          } else if (!open && unreadMentions > 0) choose("", true);
          setOpen((v) => !v);
        }}
        aria-expanded={open}
        aria-controls="guild-messenger"
      >
        <MessageCircle size={19} />
        <span>Guild chat</span>
        {unreadMentions > 0 && (
          <b
            className="chat-mention-badge"
            aria-label={`${unreadMentions} unread mentions`}
            title="You were mentioned in general chat"
          >
            @{unreadMentions > 99 ? "99+" : unreadMentions}
          </b>
        )}
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
              aria-label="Chat notification settings"
              aria-pressed={preferences}
              onClick={() => setPreferences((v) => !v)}
            >
              <Settings2 size={17} />
            </button>
            <button
              className="icon-btn"
              onClick={close}
              aria-label="Minimize guild chat"
            >
              <X size={17} />
            </button>
          </header>
          {error && (
            <p className="chat-error" role="alert">
              {error}
            </p>
          )}
          {preferences && (
            <div className="chat-preferences">
              <strong>Message notifications</strong>
              <button
                className="chat-preference-toggle"
                aria-pressed={sound}
                onClick={() => {
                  setSound((v) => !v);
                  if (!sound)
                    void bell.current
                      ?.unlock()
                      .then(() => bell.current?.play());
                }}
              >
                {sound ? <Volume2 size={18} /> : <VolumeX size={18} />}
                <span>Ping for private messages & @mentions</span>
                <b>{sound ? "On" : "Off"}</b>
              </button>
              <small>
                Sound starts after you interact with this page. Keep the site
                open for in-app alerts.
              </small>
              <button
                className="btn secondary"
                disabled={!sound}
                onClick={() =>
                  void bell.current?.unlock().then(() => bell.current?.play())
                }
              >
                Test ping
              </button>
              <label className="chat-discord-toggle">
                <input
                  type="checkbox"
                  checked={!!status.discord?.enabled}
                  disabled={!status.discord?.linked || savingPreferences}
                  onChange={(e) => void saveDiscordPreference(e.target.checked)}
                />
                <span>Send my private messages to Discord too</span>
              </label>
              <small>
                {status.discord?.linked
                  ? "Copies the sender’s name and full message to you through the guild bot. Reply on the site; Discord replies aren’t synced."
                  : "Link Discord in Guild coordination → Discord connection, then turn this on."}
              </small>
              <button
                className="btn secondary"
                onClick={() => setPreferences(false)}
              >
                Back to chat
              </button>
            </div>
          )}
          {!preferences && (
            <>
              <div className="messenger-tabs">
                <button
                  className={!peer && !directory ? "active" : ""}
                  onClick={() => choose("")}
                >
                  <Hash size={16} />
                  General
                  {unreadMentions > 0 && (
                    <b
                      className="chat-mention-badge"
                      aria-label={`${unreadMentions} unread mentions`}
                    >
                      @{unreadMentions}
                    </b>
                  )}
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
                              Only the two of you can open this conversation in
                              the app. The recipient can opt into a Discord
                              copy.
                            </small>
                          </span>
                        </>
                      ) : (
                        <>
                          <Users size={17} />
                          <span>
                            <strong>Guild general</strong>
                            <small>
                              A shared room for approved guild members.
                            </small>
                          </span>
                        </>
                      )}
                    </div>
                    {!peer && (
                      <div
                        className="chat-filters"
                        aria-label="General chat view"
                      >
                        <button
                          className={!mentionsOnly ? "active" : ""}
                          aria-pressed={!mentionsOnly}
                          onClick={() => choose("")}
                        >
                          All messages
                        </button>
                        <button
                          className={mentionsOnly ? "active" : ""}
                          aria-pressed={mentionsOnly}
                          onClick={() => choose("", true)}
                        >
                          <AtSign size={14} />
                          Your mentions
                          {unreadMentions > 0 && <b>{unreadMentions}</b>}
                        </button>
                      </div>
                    )}
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
                            el.scrollHeight - el.scrollTop - el.clientHeight <
                            65;
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
                            {mentionsOnly
                              ? "No mentions yet"
                              : peer
                                ? "Start a conversation"
                                : "Meet by the guild fire"}
                          </strong>
                          <p>
                            {mentionsOnly
                              ? "When someone selects you in an @mention, their message will appear here."
                              : peer
                                ? "Send a private message to this guild member."
                                : "Ask a question, find a group, or catch up with the guild."}
                          </p>
                        </div>
                      ) : (
                        messages.map((m, i) => (
                          <div
                            key={m.seq}
                            className={`chat-message ${m.senderId === identity.id ? "own" : ""} ${m.mentions?.some((n) => n.id === identity.id) ? "mentioned" : ""}`}
                          >
                            {(i === 0 ||
                              new Date(
                                messages[i - 1].sentAt,
                              ).toDateString() !==
                                new Date(m.sentAt).toDateString()) && (
                              <div className="chat-date">
                                {new Date(m.sentAt).toLocaleDateString(
                                  undefined,
                                  {
                                    month: "short",
                                    day: "numeric",
                                    year: "numeric",
                                  },
                                )}
                              </div>
                            )}
                            <div className="chat-byline">
                              <strong>
                                {m.senderId === identity.id
                                  ? "You"
                                  : m.senderName}
                              </strong>
                              <time
                                dateTime={new Date(m.sentAt).toISOString()}
                                title={new Date(m.sentAt).toLocaleString()}
                              >
                                {new Date(m.sentAt).toLocaleTimeString(
                                  undefined,
                                  {
                                    hour: "numeric",
                                    minute: "2-digit",
                                  },
                                )}
                              </time>
                              {m.mentions?.some(
                                (n) => n.id === identity.id,
                              ) && (
                                <span className="chat-mentioned-label">
                                  <AtSign size={12} />
                                  Mentioned you
                                </span>
                              )}
                            </div>
                            <p>
                              {messageParts(m.body, m.mentions || []).map(
                                (part, index) =>
                                  part.id ? (
                                    <mark
                                      key={index}
                                      className={`chat-mention ${part.id === identity.id ? "is-you" : ""}`}
                                    >
                                      {part.text}
                                    </mark>
                                  ) : (
                                    part.text
                                  ),
                              )}
                            </p>
                          </div>
                        ))
                      )}
                    </div>
                    {mentionsOnly ? (
                      <div className="chat-mention-return">
                        <button
                          className="btn secondary"
                          onClick={() => choose("")}
                        >
                          Reply in general chat
                        </button>
                      </div>
                    ) : (
                      <form
                        className="chat-compose"
                        onSubmit={(e) => {
                          e.preventDefault();
                          void send();
                        }}
                      >
                        {delivery && (
                          <p className="chat-delivery" role="status">
                            {delivery === "sent"
                              ? "Delivered here and to Discord."
                              : delivery === "failed"
                                ? "Delivered here. Discord couldn’t receive a copy; the recipient may need to allow bot DMs."
                                : delivery === "uncertain" ||
                                    delivery === "sending"
                                  ? "Delivered here. Discord delivery is unconfirmed."
                                  : "Delivered here. Discord forwarding is off for this recipient."}
                          </p>
                        )}
                        {match && (
                          <div className="chat-mention-picker">
                            <div className="chat-mention-picker-title">
                              <AtSign size={14} />
                              Mention a guild member
                            </div>
                            <div
                              id="chat-mention-options"
                              role="listbox"
                              aria-label="Guild members to mention"
                            >
                              {suggestions.map((member, index) => (
                                <button
                                  key={member.id}
                                  id={`chat-mention-option-${index}`}
                                  type="button"
                                  role="option"
                                  aria-selected={index === selectedSuggestion}
                                  tabIndex={-1}
                                  onMouseDown={(e) => e.preventDefault()}
                                  onClick={() => insertMention(member)}
                                >
                                  <span className="chat-avatar">
                                    {member.label.slice(0, 1)}
                                  </span>
                                  <span>
                                    <strong>{member.label}</strong>
                                    <small>{RANK_NAMES[member.role]}</small>
                                  </span>
                                </button>
                              ))}
                              {!suggestions.length && (
                                <p>No matching guild members.</p>
                              )}
                            </div>
                          </div>
                        )}
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
                              : "Message the guild… @ to mention"
                          }
                          aria-autocomplete="list"
                          aria-controls={
                            match ? "chat-mention-options" : undefined
                          }
                          aria-activedescendant={
                            match && suggestions.length
                              ? `chat-mention-option-${selectedSuggestion}`
                              : undefined
                          }
                          onChange={(e) => {
                            setDraftMentions(
                              moveMentions(
                                draft,
                                e.target.value,
                                draftMentions,
                              ),
                            );
                            setDraft(e.target.value);
                            setCaret(e.target.selectionStart);
                            setMentionIndex(0);
                            setMentionDismissed(false);
                          }}
                          onSelect={(e) =>
                            setCaret(e.currentTarget.selectionStart)
                          }
                          onBlur={() => setMentionDismissed(true)}
                          disabled={sending}
                          onKeyDown={(e) => {
                            if (e.nativeEvent.isComposing) return;
                            if (match && e.key === "Escape") {
                              e.preventDefault();
                              e.stopPropagation();
                              setMentionDismissed(true);
                              return;
                            }
                            if (
                              match &&
                              suggestions.length &&
                              ["ArrowDown", "ArrowUp", "Enter", "Tab"].includes(
                                e.key,
                              ) &&
                              !e.shiftKey
                            ) {
                              e.preventDefault();
                              if (e.key === "ArrowDown")
                                setMentionIndex(
                                  (selectedSuggestion + 1) % suggestions.length,
                                );
                              else if (e.key === "ArrowUp")
                                setMentionIndex(
                                  (selectedSuggestion +
                                    suggestions.length -
                                    1) %
                                    suggestions.length,
                                );
                              else
                                insertMention(suggestions[selectedSuggestion]);
                              return;
                            }
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
                        {draftMentions.length > 0 && (
                          <p className="chat-notifying">
                            <AtSign size={12} />
                            {new Set(draftMentions.map((m) => m.id)).size}{" "}
                            member
                            {new Set(draftMentions.map((m) => m.id)).size > 1
                              ? "s"
                              : ""}{" "}
                            will be notified
                          </p>
                        )}
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
                    )}
                  </>
                ))}
              <footer className="chat-footnote">
                Messages refresh every 5s · Alerts every 10s
              </footer>
            </>
          )}
        </section>
      )}
    </>
  );
}
