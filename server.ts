/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/

import express from 'express';
import { createServer as createViteServer } from 'vite';
import { createServer } from 'http';
import { Server } from 'socket.io';
import path from 'path';

async function startServer() {
  const app = express();
  const PORT = 3000;
  const httpServer = createServer(app);
  const io = new Server(httpServer, {
    cors: {
      origin: '*',
    },
  });

  // Global Game State
  const MAX_ROOM_SIZE = 8;
  const MIN_PLAYERS_TO_START = 3;
  const rooms: Record<string, { id: string, players: Record<string, { id: string, name: string, position: [number, number, number], rotation: number, state: 'active' | 'disabled', disabledUntil: number, score: number, color: string }>, arenaSeed: number, status: 'waiting' | 'playing' }> = {};
  const socketToRoom: Record<string, string> = {};

  const generateRoomId = () => Math.random().toString(36).substring(2, 8).toUpperCase();

  io.on('connection', (socket) => {
    console.log('User connected:', socket.id);

    const joinRoom = (roomId: string, playerName: string) => {
      if (!rooms[roomId]) {
        rooms[roomId] = {
          id: roomId,
          players: {},
          arenaSeed: Math.floor(Math.random() * 1000000),
          status: 'waiting'
        };
      }

      if (Object.keys(rooms[roomId].players).length >= MAX_ROOM_SIZE) {
        socket.emit('gameError', 'Room is full');
        return;
      }

      // If room is already playing and it's a random join, we should have handled it in joinOnline
      // But for joinWithCode, maybe we allow spectators or reject? 
      // User says: "if a game started then also a new joinee will get into new room"
      // This implies joining a 'playing' room via code might also be restricted or redirected.
      // For now, let's allow code-joining to empty/waiting rooms primarily.

      const colors = ['#ff0055', '#32cd32', '#ffff00', '#ff00ff', '#39ff14', '#00ffff', '#ffa500', '#ffffff'];
      const color = colors[Object.keys(rooms[roomId].players).length % colors.length];

      rooms[roomId].players[socket.id] = {
        id: socket.id,
        name: playerName,
        position: [0, 2, 0],
        rotation: 0,
        state: 'active',
        disabledUntil: 0,
        score: 0,
        color
      };

      socketToRoom[socket.id] = roomId;
      socket.join(roomId);

      const playerCount = Object.keys(rooms[roomId].players).length;

      // Send initial state
      socket.emit('gameJoined', { 
        players: rooms[roomId].players, 
        arenaSeed: rooms[roomId].arenaSeed,
        roomCode: roomId,
        status: rooms[roomId].status
      });
      
      // Broadcast to others in the room
      io.to(roomId).emit('roomUpdate', {
        players: rooms[roomId].players,
        status: rooms[roomId].status,
        playerCount
      });

      // Check if we can start
      if (rooms[roomId].status === 'waiting' && playerCount >= MIN_PLAYERS_TO_START) {
        rooms[roomId].status = 'playing';
        io.to(roomId).emit('gameStart');
      }
    };

    socket.on('createRoom', () => {
      const roomId = generateRoomId();
      joinRoom(roomId, `Player ${Math.floor(Math.random() * 1000)}`);
    });

    socket.on('joinWithCode', (code: string) => {
      const room = rooms[code];
      if (!room) {
        socket.emit('gameError', 'Room not found');
        return;
      }
      if (Object.keys(room.players).length >= MAX_ROOM_SIZE) {
        socket.emit('gameError', 'Room is full');
        return;
      }
      if (room.status === 'playing') {
        socket.emit('gameError', 'Game already started in this room');
        return;
      }
      joinRoom(code, `Player ${Math.floor(Math.random() * 1000)}`);
    });

    socket.on('joinOnline', () => {
      // Find a room with space AND in waiting state
      let roomId = Object.keys(rooms).find(id => {
        return rooms[id].status === 'waiting' && Object.keys(rooms[id].players).length < MAX_ROOM_SIZE && id.length === 6;
      });

      if (!roomId) {
        roomId = generateRoomId();
      }
      joinRoom(roomId, `Player ${Math.floor(Math.random() * 1000)}`);
    });

    socket.on('updatePosition', (data: { position: [number, number, number], rotation: number }) => {
      const roomId = socketToRoom[socket.id];
      if (roomId && rooms[roomId] && rooms[roomId].players[socket.id]) {
        rooms[roomId].players[socket.id].position = data.position;
        rooms[roomId].players[socket.id].rotation = data.rotation;
        socket.to(roomId).emit('playerMoved', { id: socket.id, ...data });
      }
    });

    socket.on('shoot', (data: { start: [number, number, number], end: [number, number, number], color: string }) => {
      const roomId = socketToRoom[socket.id];
      if (roomId) {
        socket.to(roomId).emit('playerShot', { id: socket.id, ...data });
      }
    });

    socket.on('hitPlayer', (targetId: string) => {
      const roomId = socketToRoom[socket.id];
      if (roomId && rooms[roomId] && rooms[roomId].players[targetId] && rooms[roomId].players[socket.id]) {
        const now = Date.now();
        const target = rooms[roomId].players[targetId];
        const shooter = rooms[roomId].players[socket.id];

        if (target.state === 'active' || now > target.disabledUntil) {
          target.state = 'disabled';
          target.disabledUntil = now + 3000;
          shooter.score += 100;
          
          io.to(roomId).emit('playerHit', {
            targetId,
            shooterId: socket.id,
            targetDisabledUntil: target.disabledUntil,
            shooterScore: shooter.score
          });
        }
      }
    });

    socket.on('disconnect', () => {
      const roomId = socketToRoom[socket.id];
      if (roomId && rooms[roomId]) {
        delete rooms[roomId].players[socket.id];
        delete socketToRoom[socket.id];
        io.to(roomId).emit('playerLeft', socket.id);

        if (rooms[roomId] && rooms[roomId].status === 'waiting') {
          io.to(roomId).emit('roomUpdate', {
            players: rooms[roomId].players,
            status: rooms[roomId].status,
            playerCount: Object.keys(rooms[roomId].players).length
          });
        }

        if (Object.keys(rooms[roomId].players).length === 0) {
          delete rooms[roomId];
        }
      }
    });
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static('dist'));
    app.get('*', (req, res) => {
      res.sendFile(path.join(process.cwd(), 'dist', 'index.html'));
    });
  }

  httpServer.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();