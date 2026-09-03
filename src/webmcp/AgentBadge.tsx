import { useSyncExternalStore } from "react";
import styled, { keyframes } from "styled-components";
import { isShared, listPeers, ROOM, subscribeSession } from "../state/session";

const pulse = keyframes`
  0% { opacity: 1; }
  50% { opacity: 0.35; }
  100% { opacity: 1; }
`;

const StyledBadge = styled.div`
  position: fixed;
  top: 10px;
  right: 12px;
  z-index: 2000;
  display: flex;
  align-items: center;
  gap: 7px;
  padding: 6px 11px;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.08);
  border: 1px solid rgba(255, 255, 255, 0.16);
  color: #e8e8e8;
  font-family: "PressStart2P", monospace;
  font-size: 9px;
  line-height: 1;
  letter-spacing: 0.5px;
  user-select: none;
  backdrop-filter: blur(4px);

  @media (max-width: 1000px) {
    top: 6px;
    right: 6px;
    padding: 5px 8px;
    font-size: 7px;
  }
`;

const Dot = styled.span<{ $live: boolean }>`
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: ${(props) => (props.$live ? "#3cb944" : "#8a8a8a")};
  animation: ${pulse} 2s ease-in-out infinite;
`;

const Room = styled.span`
  opacity: 0.5;
`;

const AgentBadge = () => {
  const peers = useSyncExternalStore(subscribeSession, listPeers, listPeers);

  if (!isShared()) return null;

  // Presence lands a beat after subscribe; until then this tab is the one agent
  // it knows about, and showing 0 while you are plainly connected reads as broken.
  const count = Math.max(peers.length, 1);

  return (
    <StyledBadge
      title={
        peers.length > 0
          ? peers.map((peer) => peer.label).join("\n")
          : "connecting"
      }
    >
      <Dot $live={peers.length > 0} />
      {count} {count === 1 ? "agent" : "agents"}
      <Room>{ROOM}</Room>
    </StyledBadge>
  );
};

export default AgentBadge;
