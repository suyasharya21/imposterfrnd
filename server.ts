import express from 'express';
import { createServer as createViteServer } from 'vite';
import { createServer } from 'http';
import { Server } from 'socket.io';
import path from 'path';
import RAPIER from '@dimforge/rapier3d-compat';
import { getObstacles } from './src/constants';

async function startServer() {
  await RAPIER.init();
  const app = express();
  const PORT = process.env.PORT ? parseInt(process.env.PORT) : 3000;
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
    lastUpdateTime: number;
    lastValidPosition: [number, number, number];
    lastShootTime: number;
    health: number;
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
    physicsWorld?: any;
    hostId?: string;
    countdown?: number | null;
    countdownInterval?: NodeJS.Timeout;
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

  function generateServerArena(seed: number) {
    // Create a gravity-free 3D Rapier world
    const world = new RAPIER.World({ x: 0.0, y: 0.0, z: 0.0 });
    const obstacles = getObstacles(false, seed);

    obstacles.forEach((obs, index) => {
      let rigidBodyDesc = RAPIER.RigidBodyDesc.fixed()
        .setTranslation(obs.position[0], 0, obs.position[2]);
      if (obs.rotation[1] !== 0) {
        // Represent y-axis rotation as a quaternion
        const halfAngle = obs.rotation[1] / 2;
        rigidBodyDesc.setRotation({ x: 0, y: Math.sin(halfAngle), z: 0, w: Math.cos(halfAngle) });
      }
      
      let body = world.createRigidBody(rigidBodyDesc);
      let colliderDesc;
      if (obs.type === 'box') {
        colliderDesc = RAPIER.ColliderDesc.cuboid(obs.size[0] / 2, obs.size[1] / 2, obs.size[2] / 2);
      } else {
        colliderDesc = RAPIER.ColliderDesc.cylinder(obs.size[1] / 2, obs.size[0] / 2);
      }
      // Offset collider by half height locally to sit flush on y=0 floor
      colliderDesc.setTranslation(0, obs.size[1] / 2, 0);
      world.createCollider(colliderDesc, body);
    });

    // Add boundary walls at y=0, offset colliders to y=6 locally
    // West Wall
    let wBody = world.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(-100, 0, 0));
    world.createCollider(RAPIER.ColliderDesc.cuboid(0.5, 6, 100).setTranslation(0, 6, 0), wBody);
    // East Wall
    let eBody = world.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(100, 0, 0));
    world.createCollider(RAPIER.ColliderDesc.cuboid(0.5, 6, 100).setTranslation(0, 6, 0), eBody);
    // North Wall
    let nBody = world.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(0, 0, -100));
    world.createCollider(RAPIER.ColliderDesc.cuboid(100, 6, 0.5).setTranslation(0, 6, 0), nBody);
    // South Wall
    let sBody = world.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(0, 0, 100));
    world.createCollider(RAPIER.ColliderDesc.cuboid(100, 6, 0.5).setTranslation(0, 6, 0), sBody);

    return world;
  }

  function startGame(roomId: string) {
    const room = rooms[roomId];
    if (!room || room.status !== 'waiting') return;

    if (room.countdownInterval) {
      clearInterval(room.countdownInterval);
      delete room.countdownInterval;
      room.countdown = null;
    }

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

    // Initialize server physics world
    room.physicsWorld = generateServerArena(room.arenaSeed);

    io.to(roomId).emit('gameStart', { roles, tasks: room.tasks });
    startRoomInterval(roomId);
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
          tasks: [],
          hostId: socket.id,
          countdown: null
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
        currentVote: null,
        lastUpdateTime: Date.now(),
        lastValidPosition: [0, 2, 0],
        lastShootTime: 0,
        health: 2
      };

      socketToRoom[socket.id] = roomId;
      socket.join(roomId);

      const playerCount = Object.keys(rooms[roomId].players).length;
      const room = rooms[roomId];

      // Set hostId if not set
      if (!room.hostId) {
        room.hostId = socket.id;
      }

      socket.emit('gameJoined', { 
        players: room.players, 
        arenaSeed: room.arenaSeed,
        roomCode: roomId,
        status: room.status,
        hostId: room.hostId,
        countdown: room.countdown
      });
      
      io.to(roomId).emit('roomUpdate', {
        players: room.players,
        status: room.status,
        playerCount,
        hostId: room.hostId,
        countdown: room.countdown
      });

      // Start 30-second countdown once minimum player count (5) is met
      if (room.status === 'waiting' && playerCount >= MIN_PLAYERS_TO_START && !room.countdownInterval) {
        room.countdown = 30;
        io.to(roomId).emit('countdownUpdate', { countdown: room.countdown });

        room.countdownInterval = setInterval(() => {
          if (room.countdown !== null && room.countdown > 0) {
            room.countdown--;
            io.to(roomId).emit('countdownUpdate', { countdown: room.countdown });

            if (room.countdown === 0) {
              clearInterval(room.countdownInterval!);
              delete room.countdownInterval;
              room.countdown = null;
              startGame(roomId);
            }
          } else {
            if (room.countdownInterval) {
              clearInterval(room.countdownInterval);
              delete room.countdownInterval;
            }
            room.countdown = null;
          }
        }, 1000);
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
        const player = rooms[roomId].players[socket.id];
        const deltaTime = (Date.now() - player.lastUpdateTime) / 1000;
        if (deltaTime === 0) return;

        const dx = data.position[0] - player.lastValidPosition[0];
        const dy = data.position[1] - player.lastValidPosition[1];
        const dz = data.position[2] - player.lastValidPosition[2];
        const distance = Math.sqrt(dx*dx + dy*dy + dz*dz);
        const speed = distance / deltaTime;
        const MAX_SPEED_TOLERANCE = 25;

        if (speed > MAX_SPEED_TOLERANCE) {
          socket.emit('forcePosition', player.lastValidPosition);
          return;
        }

        player.lastValidPosition = data.position;
        player.lastUpdateTime = Date.now();
        player.position = data.position;
        player.rotation = data.rotation;
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
        const room = rooms[roomId];
        const shooter = room.players[socket.id];
        const target = room.players[targetId];

        // 1. Rate Limiting Check
        const shootDelay = Date.now() - shooter.lastShootTime;
        if (shootDelay < 200) {
          return;
        }
        shooter.lastShootTime = Date.now();

        // 2. State Check
        if (!shooter.isAlive || !target.isAlive) {
          return;
        }

        // 3. Distance Check
        const dx = shooter.position[0] - target.position[0];
        const dy = shooter.position[1] - target.position[1];
        const dz = shooter.position[2] - target.position[2];
        const distance = Math.sqrt(dx * dx + dy * dy + dz * dz);
        const MAX_WEAPON_RANGE = 120;
        if (distance > MAX_WEAPON_RANGE) {
          return;
        }

        // 4. Line-of-Sight Check (Wallhack prevention)
        if (room.physicsWorld) {
          const origin = { x: shooter.position[0], y: shooter.position[1], z: shooter.position[2] };
          const dirX = target.position[0] - shooter.position[0];
          const dirY = target.position[1] - shooter.position[1];
          const dirZ = target.position[2] - shooter.position[2];
          const len = Math.sqrt(dirX * dirX + dirY * dirY + dirZ * dirZ);
          if (len > 0) {
            const dir = { x: dirX / len, y: dirY / len, z: dirZ / len };
            const ray = new RAPIER.Ray(origin, dir);
            // Cast ray up to len - 0.2 to avoid floating-point/target self-collision inaccuracies
            const hit = room.physicsWorld.castRay(ray, len - 0.2, true);
            if (hit !== null) {
              return;
            }
          }
        }

        // 5. Role and Health Check
        if (shooter.role === 'imposter' && target.role === 'crewmate') {
          target.health -= 1;

          if (target.health <= 0) {
            // Execute kill sequence
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
          } else {
            // First hit: play disabled visual effect and decrement player health
            target.state = 'disabled';
            target.disabledUntil = Date.now() + 1500;
            shooter.score += 50;

            io.to(roomId).emit('playerHit', {
              targetId,
              shooterId: socket.id,
              targetDisabledUntil: target.disabledUntil,
              shooterScore: shooter.score
            });

            io.to(roomId).emit('roomUpdate', {
              players: room.players,
              status: room.status,
              playerCount: Object.keys(room.players).length
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

    socket.on('hostStartGame', () => {
      const roomId = socketToRoom[socket.id];
      if (roomId && rooms[roomId]) {
        const room = rooms[roomId];
        const playerCount = Object.keys(room.players).length;
        if (room.hostId === socket.id && playerCount >= MIN_PLAYERS_TO_START && room.status === 'waiting') {
          startGame(roomId);
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
        const room = rooms[roomId];
        
        // Reassign host if host leaves
        if (room.hostId === socket.id) {
          const remainingIds = Object.keys(room.players).filter(id => id !== socket.id);
          room.hostId = remainingIds[0] || '';
        }

        delete room.players[socket.id];
        delete socketToRoom[socket.id];
        io.to(roomId).emit('playerLeft', socket.id);

        const playerCount = Object.keys(room.players).length;

        // Cancel countdown if player count falls below minimum to start (5)
        if (playerCount < MIN_PLAYERS_TO_START && room.countdownInterval) {
          clearInterval(room.countdownInterval);
          delete room.countdownInterval;
          room.countdown = null;
          io.to(roomId).emit('countdownUpdate', { countdown: null });
        }

        if (room.status === 'waiting') {
          io.to(roomId).emit('roomUpdate', {
            players: room.players,
            status: room.status,
            playerCount,
            hostId: room.hostId,
            countdown: room.countdown
          });
        }

        if (playerCount === 0) {
          if (room.countdownInterval) {
            clearInterval(room.countdownInterval);
          }
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
    const staticPath = process.env.STATIC_PATH || path.join(__dirname, 'dist');
    app.use(express.static(staticPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(staticPath, 'index.html'));
    });
  }

  httpServer.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();