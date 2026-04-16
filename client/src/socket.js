import { io } from 'socket.io-client';

// Get server URL from environment or use localhost for development
const SERVER_URL = import.meta.env.VITE_SERVER_URL || 'http://localhost:3001';

const socket = io(SERVER_URL, { autoConnect: false });

export default socket;
