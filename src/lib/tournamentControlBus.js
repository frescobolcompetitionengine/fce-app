const TOURNAMENT_CONTROL_EVENT = 'fce:tournament-control';
const TOURNAMENT_CONTROL_CHANNEL = 'frescobol:tournament-control';

let broadcastChannel = null;

function getBroadcastChannel() {
  if (typeof window === 'undefined' || typeof BroadcastChannel === 'undefined') return null;
  if (!broadcastChannel) {
    broadcastChannel = new BroadcastChannel(TOURNAMENT_CONTROL_CHANNEL);
  }
  return broadcastChannel;
}

function newCommandId() {
  return globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export function emitTournamentControl(command, payload = {}) {
  const message = {
    id: newCommandId(),
    command,
    payload,
    issued_at: new Date().toISOString(),
  };

  try {
    const channel = getBroadcastChannel();
    if (channel) {
      channel.postMessage(message);
    }
  } catch {
    // ignore broadcast failures, custom event still reaches same window
  }

  window.dispatchEvent(new CustomEvent(TOURNAMENT_CONTROL_EVENT, { detail: message }));
  return message;
}

export function listenTournamentControl(handler) {
  const handleCustomEvent = (event) => {
    if (event?.detail) {
      handler(event.detail);
    }
  };

  const channel = getBroadcastChannel();
  const handleBroadcastMessage = (event) => {
    if (event?.data) {
      handler(event.data);
    }
  };

  window.addEventListener(TOURNAMENT_CONTROL_EVENT, handleCustomEvent);
  if (channel) {
    channel.addEventListener('message', handleBroadcastMessage);
  }

  return () => {
    window.removeEventListener(TOURNAMENT_CONTROL_EVENT, handleCustomEvent);
    if (channel) {
      channel.removeEventListener('message', handleBroadcastMessage);
    }
  };
}
