import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import styled from "styled-components";
import {
  getLog,
  isShared,
  readLease,
  releaseControl,
  say,
  setAgentLabel,
  subscribeSession,
  takeControl,
} from "../state/session";

// GlobalStyles sets `* { color: var(--main) }`, which lands on every element
// directly and so breaks inheritance: a wrapper with no colour of its own
// computes to black, and `color: inherit` beneath it faithfully picks that up.
// Nothing in this panel may rely on inheriting a colour or a font.
const TEXT = "#e8e8e8";
const FONT = 'ui-monospace, SFMono-Regular, Menlo, monospace';

const Panel = styled.div`
  position: fixed;
  right: 12px;
  bottom: 12px;
  z-index: 2000;
  width: 300px;
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 9px;
  border-radius: 10px;
  background: rgba(16, 16, 18, 0.86);
  border: 1px solid rgba(255, 255, 255, 0.16);
  color: ${TEXT};
  font-family: ${FONT};
  font-size: 11px;
  backdrop-filter: blur(6px);

  @media (max-width: 1000px) {
    width: auto;
    left: 6px;
    right: 6px;
    bottom: 6px;
  }
`;

const Header = styled.button`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  background: none;
  border: none;
  padding: 0;
  color: ${TEXT};
  font-family: ${FONT};
  font-size: 11px;
  cursor: pointer;
  text-align: left;
`;

const Driving = styled.div`
  padding: 5px 7px;
  border-radius: 6px;
  background: rgba(60, 185, 68, 0.14);
  border: 1px solid rgba(60, 185, 68, 0.35);
  color: ${TEXT};
  font-size: 11px;
  line-height: 1.35;
`;

const Log = styled.div`
  max-height: 168px;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 4px;
  line-height: 1.35;
`;

const Line = styled.div`
  word-break: break-word;
  color: ${TEXT};
  font-family: ${FONT};
  font-size: 11px;
`;

const Who = styled.span`
  opacity: 0.55;
  margin-right: 5px;
  color: ${TEXT};
`;

const Row = styled.div`
  display: flex;
  gap: 5px;
`;

const Input = styled.input`
  flex: 1;
  min-width: 0;
  padding: 5px 7px;
  border-radius: 6px;
  border: 1px solid rgba(255, 255, 255, 0.2);
  background: rgba(0, 0, 0, 0.35);
  color: ${TEXT};
  -webkit-text-fill-color: ${TEXT};
  caret-color: ${TEXT};
  font-family: ${FONT};
  font-size: 11px;

  &::placeholder {
    color: rgba(255, 255, 255, 0.35);
  }
`;

const Button = styled.button`
  padding: 5px 8px;
  border-radius: 6px;
  border: 1px solid rgba(255, 255, 255, 0.2);
  background: rgba(255, 255, 255, 0.08);
  color: ${TEXT};
  font-family: ${FONT};
  font-size: 11px;
  cursor: pointer;
  white-space: nowrap;

  &:hover {
    background: rgba(255, 255, 255, 0.16);
  }
`;

const NAME_KEY = "pokemon-chat-name";

const storedName = () => {
  try {
    return localStorage.getItem(NAME_KEY) ?? "";
  } catch {
    return "";
  }
};

/**
 * The human half of the room. Agents already had tell_agents and
 * get_party_agents; this is the same channel with somewhere to type, which is
 * what lets a person watching steer an agent that is about to do something
 * daft - and take the avatar off it when talking is not enough.
 */
const RoomChat = () => {
  const log = useSyncExternalStore(subscribeSession, getLog, getLog);
  const lease = useSyncExternalStore(subscribeSession, readLease, readLease);
  const [open, setOpen] = useState(true);
  const [name, setName] = useState(storedName);
  const [draft, setDraft] = useState("");
  const bottom = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!name) return;
    setAgentLabel(name);
    try {
      localStorage.setItem(NAME_KEY, name);
    } catch {
      // A blocked store just means the name is not remembered next time.
    }
  }, [name]);

  useEffect(() => {
    bottom.current?.scrollIntoView({ block: "end" });
  }, [log.length, open]);

  if (!isShared()) return null;

  const send = () => {
    const text = draft.trim();
    if (!text) return;
    say(text);
    setDraft("");
  };

  return (
    <Panel>
      <Header onClick={() => setOpen((was) => !was)}>
        <span>room chat {log.length > 0 && `(${log.length})`}</span>
        <span style={{ opacity: 0.5 }}>{open ? "hide" : "show"}</span>
      </Header>

      {open && (
        <>
          {lease && (
            <Driving>
              <strong>{lease.label}</strong>
              {lease.human ? " (you)" : ""} is driving: {lease.reason}
            </Driving>
          )}

          <Log>
            {log.length === 0 && (
              <Line style={{ opacity: 0.45 }}>
                Nothing said yet. Tell the agents what to do.
              </Line>
            )}
            {log.map((entry, index) => (
              <Line key={index}>
                <Who>{entry.agentId}</Who>
                {entry.text}
              </Line>
            ))}
            <div ref={bottom} />
          </Log>

          {!name ? (
            <Row>
              <Input
                placeholder="your name, then Enter"
                onKeyDown={(event) => {
                  if (event.key !== "Enter") return;
                  const next = event.currentTarget.value.trim();
                  if (next) setName(next.slice(0, 40));
                }}
              />
            </Row>
          ) : (
            <>
              <Row>
                <Input
                  value={draft}
                  placeholder={`say something as ${name}`}
                  onChange={(event) => setDraft(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") send();
                  }}
                  maxLength={280}
                />
                <Button onClick={send}>Send</Button>
              </Row>
              <Row>
                {lease && lease.human ? (
                  <Button onClick={() => releaseControl(true)}>
                    Hand it back
                  </Button>
                ) : (
                  <Button
                    // A person does not queue behind an agent.
                    onClick={() => takeControl("a person is playing", 600, true)}
                  >
                    Take the Game Boy
                  </Button>
                )}
                {lease && !lease.human && (
                  <Button onClick={() => releaseControl(true)}>
                    Free the avatar
                  </Button>
                )}
              </Row>
            </>
          )}
        </>
      )}
    </Panel>
  );
};

export default RoomChat;
