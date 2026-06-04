// Socket.io hook for real-time pipeline event streaming from backend.
import { useEffect, useRef, useState, useCallback } from 'react';
import { io } from 'socket.io-client';

const MODULE = 'useSocket';
const SOCKET_URL = 'https://supportsense-ai-production.up.railway.app';

export function useSocket() {
  const socketRef = useRef(null);
  const [connected, setConnected] = useState(false);
  const [events, setEvents] = useState([]);
  const [latestEvent, setLatestEvent] = useState(null);

  const addEvent = useCallback((eventName, data) => {
    const entry = { event: eventName, data, receivedAt: new Date().toISOString() };
    console.log(`[${MODULE}] ${new Date().toISOString()} Event: ${eventName}`, data);
    setLatestEvent(entry);
    setEvents((prev) => [entry, ...prev].slice(0, 50));
  }, []);

  useEffect(() => {
    try {
      console.log(`[${MODULE}] ${new Date().toISOString()} Connecting to ${SOCKET_URL}`);
      const apiKey = import.meta.env.VITE_DEMO_API_KEY || 'demo-key';
      const socket = io(SOCKET_URL, {
        transports: ['polling', 'websocket'],
        auth: { token: apiKey }
      });
      socketRef.current = socket;

      socket.on('connect', () => {
        console.log(`[${MODULE}] ${new Date().toISOString()} Connected`);
        setConnected(true);
      });

      socket.on('disconnect', () => {
        console.log(`[${MODULE}] ${new Date().toISOString()} Disconnected`);
        setConnected(false);
      });

      const eventTypes = [
  'connection:established',
  'pipeline:started', 'pipeline:completed', 'pipeline:error',
  'triage:started', 'triage:completed', 'triage:error',
  'resolution:started', 'resolution:completed', 'resolution:error',
  'escalation:started', 'escalation:completed', 'escalation:error',
  'debate:initiated', 'debate:started', 'debate:round',
  'batch:started', 'batch:completed',
  'reasoning:step', 'incident:detected'
];

      eventTypes.forEach((eventName) => {
        socket.on(eventName, (data) => addEvent(eventName, data));
      });

      return () => {
        socket.disconnect();
      };
    } catch (error) {
      console.error(`[${MODULE}] ${new Date().toISOString()} ERROR:`, error);
    }
  }, [addEvent]);

  const clearEvents = useCallback(() => setEvents([]), []);

  return { connected, events, latestEvent, clearEvents, socket: socketRef.current };
}
