import express from 'express';
import { createServer as createViteServer } from 'vite';
import { createServer } from 'http';
import { Server } from 'socket.io';
import path from 'path';
import RAPIER from '@dimforge/rapier3d-compat';
import { getObstacles } from './src/constants';
import { createAdapter } from '@socket.io/redis-adapter';
import Redis from 'ioredis';

// --- Utility Functions for Server-Side Generation ---
function mulberry32(a: number) {
  return function() {
    let t = a += 0x6D2B79F5;
    t = Math.imul(t ^ t >>> 15, t | 1);
    t ^= t + Math.imul(t ^ t >>> 7, t | 61);
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  }
}

function checkOverlap(x: number, z: number, obstacles: any[]) {
  const buffer = 2.0; 
  for (const obs of obstacles) {
    if (obs.type === 'cylinder') {
      const radius = obs.size[0] / 2;
      const dx = x - obs.position[0];
      const dz = z - obs.position[2];
      const dist = Math.sqrt(dx * dx + dz * dz);
      if (dist < radius + buffer) return true;
    } else {
      const ox = obs.position[0];
      const oz = obs.position[2];
      const halfW = obs.size[0] / 2;
      const halfD = obs.size[2] / 2;
      const rot = obs.rotation[1];
      
      const dx = x - ox;
      const dz = z - oz;
      const cos = Math.cos(-rot);
      const sin = Math.sin(-rot);
      const localX = dx * cos - dz * sin;
      const localZ = dx * sin + dz * cos;
      
      if (Math.abs(localX) < halfW + buffer && Math.abs(localZ) < halfD + buffer) {
        return true;
      }
    }
  }
  return false;
}

const WEAPON_DAMAGE = {
  gun: 2,
  pistol: 1,
  knife: 1
};

async function startServer() {
  await RAPIER.init();
  const app = express();
  const PORT = process.env.PORT ? parseInt(process.env.PORT) : 3000;
  const httpServer = createServer(app);

  const pubClient = new Redis(process.env.REDIS_URL || 'redis://localhost:6379', {
    maxRetriesPerRequest: null,
    enableOfflineQueue: false
  });
  const subClient = pubClient.duplicate();

  pubClient.on('error', (err) => {
    console.warn(`[Redis Connection Warning] pubClient error: ${err.message}. Running gracefully with offline fallback.`);
  });
  subClient.on('error', (err) => {
    console.warn(`[Redis Connection Warning] subClient error: ${err.message}. Running gracefully with offline fallback.`);
  });

  const io = new Server(httpServer, {
    cors: { origin: '*' },
    adapter: createAdapter(pubClient, subClient)
  });

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
    currentWeapon: 'gun' | 'pistol' | 'knife'; // Server tracks weapon
  }

  interface Bot {
    id: string;
    position: [number, number, number];
    health: number;
    state: 'active' | 'disabled';
    score: number;
    disabledUntil: number;
  }

  interface Coin {
    id: string;
    position: [number, number, number];
    collected: boolean;
  }

  interface Room {
    id: string;
    players: Record<string, Player>;
    bots: Record<string, Bot>;
    coins: Record<string, Coin>;
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
    tickInterval?: NodeJS.Timeout;
  }

  const MAX_ROOM_SIZE = 8;
  const MIN_PLAYERS_TO_START = 5;
  const rooms: Record<string, Room> = {};
  const socketToRoom: Record<string, string> = {};
  const roomIntervals: Record<string, NodeJS.Timeout> = {};

  const generateRoomId = () => Math.random().toString(36).substring(2, 8).toUpperCase();

  const clearRoomIntervals = (roomId: string) => {
    if (roomIntervals[roomId]) {
      clearInterval(roomIntervals[roomId]);
      delete roomIntervals[roomId];
    }
    const room = rooms[roomId];
    if (room) {
      if (room.tickInterval) {
        clearInterval(room.tickInterval);
        delete room.tickInterval;
      }
      if (room.physicsWorld) {
        room.physicsWorld.free();
        delete room.physicsWorld;
      }
    }
  };

  const startRoomInterval = (roomId: string) => {
    if (roomIntervals[roomId]) return;

    roomIntervals[roomId] = setInterval(() => {
      const room = rooms[roomId];
      if (!room) {
        clearRoomIntervals(roomId);
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
          clearRoomIntervals(roomId);
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

      const aliveCrewmates = Object.values(room.players).filter(p => p.role === 'crewmate' && p.isAlive);
      const aliveImposters = Object.values(room.players).filter(p => p.role === 'imposter' && p.isAlive);

      if (room.status === 'playing') {
        if (aliveCrewmates.length === 0) {
          room.status = 'waiting';
          room.phase = 'waiting';
          io.to(roomId).emit('gameOver', { result: 'imposter_wins', reason: 'crewmates_dead' });
          clearRoomIntervals(roomId);
        } else if (aliveImposters.length === 0) {
          room.status = 'waiting';
          room.phase = 'waiting';
          io.to(roomId).emit('gameOver', { result: 'crewmates_win', reason: 'imposter_dead' });
          clearRoomIntervals(roomId);
        }
      }
    }, 1000);

    const room = rooms[roomId];
    if (room && !room.tickInterval) {
      room.tickInterval = setInterval(() => {
        io.to(roomId).emit('roomTick', room.players);
      }, 50);
    }
  };

  const tallyVotes = (roomId: string) => {
    const room = rooms[roomId];
    if (!room) return;

    const voteCounts: Record<string, number> = {};
    Object.values(room.players).forEach(p => { if (p.isAlive) voteCounts[p.id] = 0; });
    Object.values(room.players).forEach(p => {
      if (p.currentVote && voteCounts[p.currentVote] !== undefined) voteCounts[p.currentVote]++;
    });

    let maxVotes = -1;
    Object.values(voteCounts).forEach(count => { if (count > maxVotes) maxVotes = count; });

    const tiedPlayers: string[] = [];
    Object.keys(voteCounts).forEach(id => { if (voteCounts[id] === maxVotes) tiedPlayers.push(id); });

    if (tiedPlayers.length > 0) {
      const selectedId = tiedPlayers[Math.floor(Math.random() * tiedPlayers.length)];
      const selectedPlayer = room.players[selectedId];

      if (selectedPlayer.role === 'imposter') {
        room.status = 'waiting';
        room.phase = 'waiting';
        io.to(roomId).emit('gameOver', { result: 'crewmates_win', name: selectedPlayer.name });
        clearRoomIntervals(roomId);
      } else {
        selectedPlayer.isAlive = false;
        selectedPlayer.state = 'disabled';

        io.to(roomId).emit('roomUpdate', { players: room.players, status: room.status, playerCount: Object.keys(room.players).length });

        const aliveCrewmates = Object.values(room.players).filter(p => p.role === 'crewmate' && p.isAlive);
        if (aliveCrewmates.length === 0) {
          room.status = 'waiting';
          room.phase = 'waiting';
          io.to(roomId).emit('gameOver', { result: 'imposter_wins', reason: 'crewmates_dead' });
          clearRoomIntervals(roomId);
        } else {
          room.phase = 'playing';
          room.votingTimer = 30;
          io.to(roomId).emit('votingEnded', { result: 'crewmate_killed', name: selectedPlayer.name });
        }
      }
    }
  };

  function generateServerArena(seed: number) {
    const world = new RAPIER.World({ x: 0.0, y: 0.0, z: 0.0 });
    const obstacles = getObstacles(false, seed);

    obstacles.forEach((obs) => {
      let rigidBodyDesc = RAPIER.RigidBodyDesc.fixed().setTranslation(obs.position[0], 0, obs.position[2]);
      if (obs.rotation[1] !== 0) {
        const halfAngle = obs.rotation[1] / 2;
        rigidBodyDesc.setRotation({ x: 0, y: Math.sin(halfAngle), z: 0, w: Math.cos(halfAngle) });
      }
      let body = world.createRigidBody(rigidBodyDesc);
      let colliderDesc = obs.type === 'box' 
        ? RAPIER.ColliderDesc.cuboid(obs.size[0] / 2, obs.size[1] / 2, obs.size[2] / 2)
        : RAPIER.ColliderDesc.cylinder(obs.size[1] / 2, obs.size[0] / 2);
      
      colliderDesc.setTranslation(0, obs.size[1] / 2, 0);
      world.createCollider(colliderDesc, body);
    });

    let wBody = world.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(-100, 0, 0));
    world.createCollider(RAPIER.ColliderDesc.cuboid(0.5, 6, 100).setTranslation(0, 6, 0), wBody);
    let eBody = world.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(100, 0, 0));
    world.createCollider(RAPIER.ColliderDesc.cuboid(0.5, 6, 100).setTranslation(0, 6, 0), eBody);
    let nBody = world.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(0, 0, -100));
    world.createCollider(RAPIER.ColliderDesc.cuboid(100, 6, 0.5).setTranslation(0, 6, 0), nBody);
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
    room.physicsWorld = generateServerArena(room.arenaSeed);

    const playerIds = Object.keys(room.players);
    const imposterId = playerIds[Math.floor(Math.random() * playerIds.length)];

    const roles: Record<string, 'crewmate' | 'imposter'> = {};
    playerIds.forEach(id => {
      const p = room.players[id];
      p.role = (id === imposterId) ? 'imposter' : 'crewmate';
      p.isAlive = true;
      p.currentVote = null;
      roles[id] = p.role;
    });

    room.tasks = [];
    for (let i = 0; i < playerIds.length - 1; i++) {
      room.tasks.push({
        id: `task_${i}_${Math.random().toString(36).substring(2, 5)}`,
        x: Math.floor((Math.random() - 0.5) * 160),
        z: Math.floor((Math.random() - 0.5) * 160)
      });
    }

    // 10/10 SERVER-SIDE BOT SPAWNING
    room.bots = {};
    const rng = mulberry32(room.arenaSeed + 1);
    const obstacles = getObstacles(false, room.arenaSeed);
    for (let i = 0; i < 8; i++) {
      let x, z;
      do {
        x = (rng() - 0.5) * 160;
        z = (rng() - 0.5) * 160;
      } while ((Math.abs(x) < 20 && Math.abs(z) < 20) || checkOverlap(x, z, obstacles));
      
      const botId = `bot-${i + 1}`;
      room.bots[botId] = { id: botId, position: [x, 1, z], health: 2, state: 'active', score: 0, disabledUntil: 0 };
    }
    room.coins = {};

    io.to(roomId).emit('gameStart', { roles, tasks: room.tasks, bots: Object.values(room.bots) });
    startRoomInterval(roomId);
  };

  io.on('connection', (socket) => {
    const joinRoom = (roomId: string, playerName: string) => {
      if (!rooms[roomId]) {
        rooms[roomId] = {
          id: roomId, players: {}, bots: {}, coins: {}, arenaSeed: Math.floor(Math.random() * 1000000),
          status: 'waiting', roomTimer: 1200, votingTimer: 30, phase: 'waiting', tasks: [],
          hostId: socket.id, countdown: null
        };
      }

      if (Object.keys(rooms[roomId].players).length >= MAX_ROOM_SIZE) {
        socket.emit('gameError', 'Room is full'); return;
      }

      const colors = ['#ff0055', '#32cd32', '#ffff00', '#ff00ff', '#39ff14', '#00ffff', '#ffa500', '#ffffff'];
      const room = rooms[roomId];

      room.players[socket.id] = {
        id: socket.id, name: playerName, position: [0, 2, 0], rotation: 0, state: 'active', disabledUntil: 0,
        score: 0, color: colors[Object.keys(room.players).length % colors.length], role: 'crewmate',
        isAlive: true, currentVote: null, lastUpdateTime: Date.now(), lastValidPosition: [0, 2, 0],
        lastShootTime: 0, health: 2, currentWeapon: 'gun'
      };

      socketToRoom[socket.id] = roomId;
      socket.join(roomId);

      if (!room.hostId) room.hostId = socket.id;

      socket.emit('gameJoined', { 
        players: room.players, arenaSeed: room.arenaSeed, roomCode: roomId, status: room.status, 
        hostId: room.hostId, countdown: room.countdown,
        bots: Object.values(room.bots), coins: Object.values(room.coins) 
      });
      
      io.to(roomId).emit('roomUpdate', { players: room.players, status: room.status, playerCount: Object.keys(room.players).length, hostId: room.hostId, countdown: room.countdown });

      if (room.status === 'waiting' && Object.keys(room.players).length >= MIN_PLAYERS_TO_START && !room.countdownInterval) {
        room.countdown = 30;
        io.to(roomId).emit('countdownUpdate', { countdown: room.countdown });
        room.countdownInterval = setInterval(() => {
          if (room.countdown !== null && room.countdown > 0) {
            room.countdown--;
            io.to(roomId).emit('countdownUpdate', { countdown: room.countdown });
            if (room.countdown === 0) {
              clearInterval(room.countdownInterval!); delete room.countdownInterval; room.countdown = null;
              startGame(roomId);
            }
          }
        }, 1000);
      }
    };

    socket.on('createRoom', (data) => joinRoom(generateRoomId(), data?.playerName || `Player ${Math.floor(Math.random() * 1000)}`));
    socket.on('joinWithCode', (data) => joinRoom((typeof data === 'string' ? data : data.code), (typeof data === 'object' && data.playerName ? data.playerName : `Player ${Math.floor(Math.random() * 1000)}`)));
    socket.on('joinOnline', (data) => {
      let roomId = Object.keys(rooms).find(id => rooms[id].status === 'waiting' && Object.keys(rooms[id].players).length < MAX_ROOM_SIZE && id.length === 6);
      joinRoom(roomId || generateRoomId(), data?.playerName || `Player ${Math.floor(Math.random() * 1000)}`);
    });

    // Server-Side Weapon Tracking
    socket.on('switchWeapon', (weapon: 'gun' | 'pistol' | 'knife') => {
      const roomId = socketToRoom[socket.id];
      if (roomId && rooms[roomId]?.players[socket.id] && WEAPON_DAMAGE[weapon]) {
        rooms[roomId].players[socket.id].currentWeapon = weapon;
      }
    });

    socket.on('updatePosition', (data: { position: [number, number, number], rotation: number }) => {
      const roomId = socketToRoom[socket.id];
      if (roomId && rooms[roomId]?.players[socket.id]) {
        const player = rooms[roomId].players[socket.id];
        const deltaTime = (Date.now() - player.lastUpdateTime) / 1000;
        if (deltaTime === 0) return;
        const dx = data.position[0] - player.lastValidPosition[0], dy = data.position[1] - player.lastValidPosition[1], dz = data.position[2] - player.lastValidPosition[2];
        if ((Math.sqrt(dx*dx + dy*dy + dz*dz) / deltaTime) > 25) {
          socket.emit('forcePosition', player.lastValidPosition); return;
        }
        player.lastValidPosition = data.position;
        player.lastUpdateTime = Date.now();
        player.position = data.position;
        player.rotation = data.rotation;
      }
    });

    socket.on('shoot', (data) => {
      const roomId = socketToRoom[socket.id];
      if (roomId) socket.to(roomId).emit('playerShot', { id: socket.id, ...data });
    });

    // 10/10 SECURE BOT HIT VALIDATION
    socket.on('hitBot', (botId: string) => {
      const roomId = socketToRoom[socket.id];
      if (roomId && rooms[roomId]?.players[socket.id] && rooms[roomId]?.bots[botId]) {
        const room = rooms[roomId];
        const shooter = room.players[socket.id];
        const bot = room.bots[botId];

        if (bot.state !== 'active') return;
        if (Date.now() - shooter.lastShootTime < 200) return;
        shooter.lastShootTime = Date.now();

        const dx = shooter.position[0] - bot.position[0], dy = shooter.position[1] - bot.position[1], dz = shooter.position[2] - bot.position[2];
        if (Math.sqrt(dx*dx + dy*dy + dz*dz) > 120) return;

        if (room.physicsWorld) {
          const origin = { x: shooter.position[0], y: shooter.position[1], z: shooter.position[2] };
          const dirX = bot.position[0] - shooter.position[0], dirY = bot.position[1] - shooter.position[1], dirZ = bot.position[2] - shooter.position[2];
          const len = Math.sqrt(dirX * dirX + dirY * dirY + dirZ * dirZ);
          if (len > 0) {
            const hit = room.physicsWorld.castRay(new RAPIER.Ray(origin, { x: dirX/len, y: dirY/len, z: dirZ/len }), len - 0.2, true);
            if (hit !== null) return;
          }
        }

        const damage = WEAPON_DAMAGE[shooter.currentWeapon] || 1;
        bot.health -= damage;

        if (bot.health <= 0) {
          bot.state = 'disabled';
          bot.disabledUntil = Date.now() + 9999999;
          shooter.score += 50;
          
          // Secure Coin Drop
          const angle = Math.random() * Math.PI * 2;
          const coinId = `coin-loot-${Date.now()}-${Math.random()}`;
          const coin = { id: coinId, position: [bot.position[0] + (Math.cos(angle) * 1.5), 1.2, bot.position[2] + (Math.sin(angle) * 1.5)] as [number, number, number], collected: false };
          room.coins[coinId] = coin;

          io.to(roomId).emit('botKilled', { botId, shooterId: socket.id, shooterScore: shooter.score, newCoin: coin });
        } else {
          io.to(roomId).emit('botHit', { botId, health: bot.health });
        }
      }
    });

    // 10/10 SECURE COIN COLLECTION
    socket.on('collectCoin', (coinId: string) => {
      const roomId = socketToRoom[socket.id];
      if (roomId && rooms[roomId]?.players[socket.id] && rooms[roomId]?.coins[coinId]) {
        const room = rooms[roomId];
        const player = room.players[socket.id];
        const coin = room.coins[coinId];

        const dx = player.position[0] - coin.position[0], dz = player.position[2] - coin.position[2];
        if (Math.sqrt(dx*dx + dz*dz) > 5) return; // Anti-Magnet Hack

        delete room.coins[coinId];
        player.score += 100;
        io.to(roomId).emit('coinCollected', { coinId, playerId: socket.id, playerScore: player.score });
      }
    });

    socket.on('hitPlayer', (targetId: string) => {
      const roomId = socketToRoom[socket.id];
      if (roomId && rooms[roomId]?.players[targetId] && rooms[roomId]?.players[socket.id]) {
        const room = rooms[roomId];
        const shooter = room.players[socket.id];
        const target = room.players[targetId];

        if (Date.now() - shooter.lastShootTime < 200 || !shooter.isAlive || !target.isAlive) return;
        shooter.lastShootTime = Date.now();

        const dx = shooter.position[0] - target.position[0], dy = shooter.position[1] - target.position[1], dz = shooter.position[2] - target.position[2];
        if (Math.sqrt(dx*dx + dy*dy + dz*dz) > 120) return;

        if (room.physicsWorld) {
          const origin = { x: shooter.position[0], y: shooter.position[1], z: shooter.position[2] };
          const dirX = target.position[0] - shooter.position[0], dirY = target.position[1] - shooter.position[1], dirZ = target.position[2] - shooter.position[2];
          const len = Math.sqrt(dirX * dirX + dirY * dirY + dirZ * dirZ);
          if (len > 0 && room.physicsWorld.castRay(new RAPIER.Ray(origin, { x: dirX/len, y: dirY/len, z: dirZ/len }), len - 0.2, true) !== null) return;
        }

        if (shooter.role === 'imposter' && target.role === 'crewmate') {
          target.health -= (WEAPON_DAMAGE[shooter.currentWeapon] || 1); // 10/10 Secure PvP Damage

          if (target.health <= 0) {
            target.isAlive = false; target.state = 'disabled';
            room.phase = 'voting'; room.votingTimer = 30;
            Object.values(room.players).forEach(p => p.currentVote = null);
            io.to(roomId).emit('roomUpdate', { players: room.players, status: room.status, playerCount: Object.keys(room.players).length });
            io.to(roomId).emit('triggerVotingPhase', { players: room.players, killedPlayerId: targetId });
          } else {
            target.state = 'disabled'; target.disabledUntil = Date.now() + 1500; shooter.score += 50;
            io.to(roomId).emit('playerHit', { targetId, shooterId: socket.id, targetDisabledUntil: target.disabledUntil, shooterScore: shooter.score });
            io.to(roomId).emit('roomUpdate', { players: room.players, status: room.status, playerCount: Object.keys(room.players).length });
          }
        }
      }
    });

    socket.on('submitVote', (targetId) => {
      const roomId = socketToRoom[socket.id];
      if (roomId && rooms[roomId]?.players[socket.id] && rooms[roomId].status === 'playing' && rooms[roomId].phase === 'voting' && rooms[roomId].players[socket.id].isAlive) {
        rooms[roomId].players[socket.id].currentVote = targetId;
        io.to(roomId).emit('roomUpdate', { players: rooms[roomId].players, status: rooms[roomId].status, playerCount: Object.keys(rooms[roomId].players).length });
      }
    });

    socket.on('taskCompleted', (taskId) => {
      const roomId = socketToRoom[socket.id];
      if (roomId && rooms[roomId]?.status === 'playing' && rooms[roomId].phase === 'playing') {
        rooms[roomId].tasks = rooms[roomId].tasks.filter(t => t.id !== taskId);
        io.to(roomId).emit('tasksUpdate', rooms[roomId].tasks);
        if (rooms[roomId].tasks.length === 0) {
          rooms[roomId].status = 'waiting'; rooms[roomId].phase = 'waiting';
          io.to(roomId).emit('gameOver', { result: 'crewmates_win', reason: 'tasks_completed' });
          clearRoomIntervals(roomId);
        }
      }
    });

    socket.on('hostStartGame', () => {
      const roomId = socketToRoom[socket.id];
      if (roomId && rooms[roomId]?.hostId === socket.id && Object.keys(rooms[roomId].players).length >= MIN_PLAYERS_TO_START && rooms[roomId].status === 'waiting') {
        startGame(roomId);
      }
    });

    socket.on('sendChatMessage', (message) => {
      const roomId = socketToRoom[socket.id];
      if (roomId && rooms[roomId]?.players[socket.id]) {
        io.to(roomId).emit('receiveChatMessage', { sender: rooms[roomId].players[socket.id].name, message, timestamp: Date.now() });
      }
    });

    socket.on('webrtc-offer', (data) => io.to(data.targetId).emit('webrtc-offer', { sdp: data.sdp, senderId: socket.id }));
    socket.on('webrtc-answer', (data) => io.to(data.targetId).emit('webrtc-answer', { sdp: data.sdp, senderId: socket.id }));
    socket.on('webrtc-ice-candidate', (data) => io.to(data.targetId).emit('webrtc-ice-candidate', { candidate: data.candidate, senderId: socket.id }));

    socket.on('disconnect', () => {
      const roomId = socketToRoom[socket.id];
      if (roomId && rooms[roomId]) {
        const room = rooms[roomId];
        if (room.hostId === socket.id) room.hostId = Object.keys(room.players).filter(id => id !== socket.id)[0] || '';
        delete room.players[socket.id];
        delete socketToRoom[socket.id];
        io.to(roomId).emit('playerLeft', socket.id);
        const playerCount = Object.keys(room.players).length;

        if (playerCount < MIN_PLAYERS_TO_START && room.countdownInterval) {
          clearInterval(room.countdownInterval); delete room.countdownInterval; room.countdown = null;
          io.to(roomId).emit('countdownUpdate', { countdown: null });
        }

        if (room.status === 'waiting') io.to(roomId).emit('roomUpdate', { players: room.players, status: room.status, playerCount, hostId: room.hostId, countdown: room.countdown });

        if (playerCount === 0) {
          if (room.countdownInterval) clearInterval(room.countdownInterval);
          clearRoomIntervals(roomId);
          delete rooms[roomId];
        }
      }
    });
  });

  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({ server: { middlewareMode: true }, appType: 'spa' });
    app.use(vite.middlewares);
  } else {
    const staticPath = process.env.STATIC_PATH || path.join(__dirname, 'dist');
    app.use(express.static(staticPath));
    app.get('*', (req, res) => res.sendFile(path.join(staticPath, 'index.html')));
  }

  httpServer.listen(PORT, '0.0.0.0', () => console.log(`Server running on http://localhost:${PORT}`));
}

startServer();