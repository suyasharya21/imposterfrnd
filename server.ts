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

  // Global Game State types
  interface Player {
    id: string;
    name: string;
    position: [number, number, number];
    rotation: number;
    state: 'active' | 'disabled';
    disabledUntil: number;
    score: number;
    color: string;
    role: 'crewmate' | 'imposter';
    isAlive: boolean;
    currentVote: string | null;
  }

  interface Room {
    id: string;
    players: Record<string, Player>;
    arenaSeed: number;
    status: 'waiting' | 'playing';
    roomTimer: number;
    votingTimer: number;
    phase: 'waiting' | 'playing' | 'voting';
    tasks: Array<{ id: string, x: number, z: number }>;
  }

  const MAX_ROOM_SIZE = 8;
  const MIN_PLAYERS_TO_START = 5;
  const rooms: Record<string, Room> = {};
  const socketToRoom: Record<string, string> = {};
  const roomIntervals: Record<string, NodeJS.Timeout> = {};

  const generateRoomId = () => Math.random().toString(36).substring(2, 8).toUpperCase();

  const startRoomInterval = (roomId: string) => {
    if (roomIntervals[roomId]) return;

    roomIntervals[roomId] = setInterval(() => {
      const room = rooms[roomId];
      if (!room) {
        clearInterval(roomIntervals[roomId]);
        delete roomIntervals[roomId];
        return;
      }

      if (room.status !== 'playing') return;

      if (room.phase === 'playing') {
        room.roomTimer--;

        io.to(roomId).emit('timerUpdate', {
          roomTimer: room.roomTimer,
          votingTimer: room.votingTimer,
          phase: room.phase
        });

        if (room.roomTimer <= 0) {
          room.status = 'waiting';
          room.phase = 'waiting';
          io.to(roomId).emit('gameOver', { result: 'imposter_wins', reason: 'time_out' });
          clearInterval(roomIntervals[roomId]);
          delete roomIntervals[roomId];
        }
      } else if (room.phase === 'voting') {
        room.votingTimer--;

        io.to(roomId).emit('timerUpdate', {
          roomTimer: room.roomTimer,
          votingTimer: room.votingTimer,
          phase: room.phase
        });

        if (room.votingTimer <= 0) {
          tallyVotes(roomId);
        }
      }

      // Check win conditions: if all crewmates are dead, imposter wins
      const aliveCrewmates = Object.values(room.players).filter(p => p.role === 'crewmate' && p.isAlive);
      const aliveImposters = Object.values(room.players).filter(p => p.role === 'imposter' && p.isAlive);

      if (room.status === 'playing') {
        if (aliveCrewmates.length === 0) {
          room.status = 'waiting';
          room.phase = 'waiting';
          io.to(roomId).emit('gameOver', { result: 'imposter_wins', reason: 'crewmates_dead' });
          clearInterval(roomIntervals[roomId]);
          delete roomIntervals[roomId];
        } else if (aliveImposters.length === 0) {
          room.status = 'waiting';
          room.phase = 'waiting';
          io.to(roomId).emit('gameOver', { result: 'crewmates_win', reason: 'imposter_dead' });
          clearInterval(roomIntervals[roomId]);
          delete roomIntervals[roomId];
        }
      }
    }, 1000);
  };

  const tallyVotes = (roomId: string) => {
    const room = rooms[roomId];
    if (!room) return;

    const voteCounts: Record<string, number> = {};
    Object.values(room.players).forEach(p => {
      if (p.isAlive) {
        voteCounts[p.id] = 0;
      }
    });

    Object.values(room.players).forEach(p => {
      if (p.currentVote && voteCounts[p.currentVote] !== undefined) {
        voteCounts[p.currentVote]++;
      }
    });

    let maxVotes = -1;
    Object.values(voteCounts).forEach(count => {
      if (count > maxVotes) {
        maxVotes = count;
      }
    });

    const tiedPlayers: string[] = [];
    Object.keys(voteCounts).forEach(id => {
      if (voteCounts[id] === maxVotes) {
        tiedPlayers.push(id);
      }
    });

    if (tiedPlayers.length > 0) {
      const selectedId = tiedPlayers[Math.floor(Math.random() * tiedPlayers.length)];
      const selectedPlayer = room.players[selectedId];

      if (selectedPlayer.role === 'imposter') {
        room.status = 'waiting';
        room.phase = 'waiting';
        io.to(roomId).emit('gameOver', { result: 'crewmates_win', name: selectedPlayer.name });
        if (roomIntervals[roomId]) {
          clearInterval(roomIntervals[roomId]);
          delete roomIntervals[roomId];
        }
      } else {
        selectedPlayer.isAlive = false;
        selectedPlayer.state = 'disabled';

        io.to(roomId).emit('roomUpdate', {
          players: room.players,
          status: room.status,
          playerCount: Object.keys(room.players).length
        });

        const aliveCrewmates = Object.values(room.players).filter(p => p.role === 'crewmate' && p.isAlive);
        if (aliveCrewmates.length === 0) {
          room.status = 'waiting';
          room.phase = 'waiting';
          io.to(roomId).emit('gameOver', { result: 'imposter_wins', reason: 'crewmates_dead' });
          if (roomIntervals[roomId]) {
            clearInterval(roomIntervals[roomId]);
            delete roomIntervals[roomId];
          }
        } else {
          room.phase = 'playing';
          room.votingTimer = 30;
          io.to(roomId).emit('votingEnded', { result: 'crewmate_killed', name: selectedPlayer.name });
        }
      }
    }
  };

  io.on('connection', (socket) => {
    console.log('User connected:', socket.id);

    const joinRoom = (roomId: string, playerName: string) => {
      if (!rooms[roomId]) {
        rooms[roomId] = {
          id: roomId,
          players: {},
          arenaSeed: Math.floor(Math.random() * 1000000),
          status: 'waiting',
          roomTimer: 1200,
          votingTimer: 30,
          phase: 'waiting',
          tasks: []
        };
      }

      if (Object.keys(rooms[roomId].players).length >= MAX_ROOM_SIZE) {
        socket.emit('gameError', 'Room is full');
        return;
      }

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
        color,
        role: 'crewmate',
        isAlive: true,
        currentVote: null
      };

      socketToRoom[socket.id] = roomId;
      socket.join(roomId);

      const playerCount = Object.keys(rooms[roomId].players).length;

      socket.emit('gameJoined', { 
        players: rooms[roomId].players, 
        arenaSeed: rooms[roomId].arenaSeed,
        roomCode: roomId,
        status: rooms[roomId].status
      });
      
      io.to(roomId).emit('roomUpdate', {
        players: rooms[roomId].players,
        status: rooms[roomId].status,
        playerCount
      });

      if (rooms[roomId].status === 'waiting' && playerCount >= MIN_PLAYERS_TO_START) {
        const room = rooms[roomId];
        room.status = 'playing';
        room.phase = 'playing';
        room.roomTimer = 1200;
        room.votingTimer = 30;

        const playerIds = Object.keys(room.players);
        const imposterIdx = Math.floor(Math.random() * playerIds.length);
        const imposterId = playerIds[imposterIdx];

        const roles: Record<string, 'crewmate' | 'imposter'> = {};
        playerIds.forEach(id => {
          const p = room.players[id];
          p.role = (id === imposterId) ? 'imposter' : 'crewmate';
          p.isAlive = true;
          p.currentVote = null;
          roles[id] = p.role;
        });

        room.tasks = [];
        const taskCount = playerIds.length - 1;
        for (let i = 0; i < taskCount; i++) {
          const x = Math.floor((Math.random() - 0.5) * 160);
          const z = Math.floor((Math.random() - 0.5) * 160);
          room.tasks.push({
            id: `task_${i}_${Math.random().toString(36).substring(2, 5)}`,
            x,
            z
          });
        }

        io.to(roomId).emit('gameStart', { roles, tasks: room.tasks });
        startRoomInterval(roomId);
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

    socket.on('playerKilled', (targetId: string) => {
      const roomId = socketToRoom[socket.id];
      if (roomId && rooms[roomId]) {
        const room = rooms[roomId];
        const shooter = room.players[socket.id];
        const target = room.players[targetId];

        if (room.status === 'playing' && room.phase === 'playing' && shooter && target) {
          if (shooter.role === 'imposter' && target.isAlive) {
            target.isAlive = false;
            target.state = 'disabled';
            room.phase = 'voting';
            room.votingTimer = 30;

            Object.values(room.players).forEach(p => {
              p.currentVote = null;
            });

            io.to(roomId).emit('roomUpdate', {
              players: room.players,
              status: room.status,
              playerCount: Object.keys(room.players).length
            });
            io.to(roomId).emit('triggerVotingPhase', {
              players: room.players,
              killedPlayerId: targetId
            });
          }
        }
      }
    });

    socket.on('submitVote', (targetId: string | null) => {
      const roomId = socketToRoom[socket.id];
      if (roomId && rooms[roomId]) {
        const room = rooms[roomId];
        const player = room.players[socket.id];
        if (room.status === 'playing' && room.phase === 'voting' && player && player.isAlive) {
          player.currentVote = targetId;

          io.to(roomId).emit('roomUpdate', {
            players: room.players,
            status: room.status,
            playerCount: Object.keys(room.players).length
          });
        }
      }
    });

    socket.on('taskCompleted', (taskId: string) => {
      const roomId = socketToRoom[socket.id];
      if (roomId && rooms[roomId]) {
        const room = rooms[roomId];
        if (room.status === 'playing' && room.phase === 'playing') {
          room.tasks = room.tasks.filter(t => t.id !== taskId);
          io.to(roomId).emit('tasksUpdate', room.tasks);

          if (room.tasks.length === 0) {
            room.status = 'waiting';
            room.phase = 'waiting';
            io.to(roomId).emit('gameOver', { result: 'crewmates_win', reason: 'tasks_completed' });
            if (roomIntervals[roomId]) {
              clearInterval(roomIntervals[roomId]);
              delete roomIntervals[roomId];
            }
          }
        }
      }
    });

    socket.on('sendChatMessage', (message: string) => {
      const roomId = socketToRoom[socket.id];
      if (roomId && rooms[roomId]) {
        const room = rooms[roomId];
        const player = room.players[socket.id];
        if (player) {
          io.to(roomId).emit('receiveChatMessage', {
            sender: player.name,
            message: message,
            timestamp: Date.now()
          });
        }
      }
    });

    socket.on('webrtc-offer', (data: { sdp: any, targetId: string }) => {
      io.to(data.targetId).emit('webrtc-offer', { sdp: data.sdp, senderId: socket.id });
    });

    socket.on('webrtc-answer', (data: { sdp: any, targetId: string }) => {
      io.to(data.targetId).emit('webrtc-answer', { sdp: data.sdp, senderId: socket.id });
    });

    socket.on('webrtc-ice-candidate', (data: { candidate: any, targetId: string }) => {
      io.to(data.targetId).emit('webrtc-ice-candidate', { candidate: data.candidate, senderId: socket.id });
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
          if (roomIntervals[roomId]) {
            clearInterval(roomIntervals[roomId]);
            delete roomIntervals[roomId];
          }
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