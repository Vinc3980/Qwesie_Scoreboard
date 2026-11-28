import { useEffect, useState } from 'react';
import { getSocket } from '../services/socket.js';

/** Returns true while the Socket.IO connection is healthy. Used to disable polling when push is available. */
export function useSocketHealthy(): boolean {
  const socket = getSocket();
  const [healthy, setHealthy] = useState(() => socket.connected);
  useEffect(() => {
    const onConnect = () => setHealthy(true);
    const onDisconnect = () => setHealthy(false);
    socket.on('connect', onConnect);
    socket.on('disconnect', onDisconnect);
    setHealthy(socket.connected);
    return () => {
      socket.off('connect', onConnect);
      socket.off('disconnect', onDisconnect);
    };
  }, [socket]);
  return healthy;
}

/** Polling interval: false when socket is healthy, fallback ms when unhealthy. */
export function usePollingFallback(fallbackMs = 20_000): number | false {
  const healthy = useSocketHealthy();
  return healthy ? false : fallbackMs;
}
