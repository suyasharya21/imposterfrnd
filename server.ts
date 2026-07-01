/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/

import express from 'express';
import { createServer as createViteServer } from 'vite';
import { createServer } from 'http';
import { Server } from 'socket.io';
import path from 'path';
import { getObstacles, LEVELS, ObstacleData } from './src/constants';

// --- Anti-Cheat Math Helpers ---

/**
 * 2D Liang-Barsky Segment-AABB Intersection check.
 * Checks if the 2D segment from (ax, az) to (bx, bz) intersects an AABB of size [-halfX, halfX] x [-halfZ, halfZ].
 */
function intersectSegmentAABB(
  ax: number, az: number,
  bx: number, bz: number,
  halfX: number, halfZ: number
): boolean {
  let t_min = 0;
  let t_max = 1;

  const dx = bx - ax;
  const dz = bz - az;

  // Check X boundaries
  const x_min = -halfX;
  const x_max = halfX;
  if (dx === 0) {
    if (ax < x_min || ax > x_max) return false;
  } else {
    let t1 = (x_min - ax) / dx;
    let t2 = (x_max - ax) / dx;
    if (t1 > t2) {
      const temp = t1;
      t1 = t2;
      t2 = temp;
    }
    t_min = Math.max(t_min, t1);
    t_max = Math.min(t_max, t2);
  }

  // Check Z boundaries
  const z_min = -halfZ;
  const z_max = halfZ;
  if (dz === 0) {
    if (az < z_min || az > z_max) return false;
  } else {
    let t1 = (z_min - az) / dz;
    let t2 = (z_max - az) / dz;
    if (t1 > t2) {
      const temp = t1;
      t1 = t2;
      t2 = temp;
    }
    t_min = Math.max(t_min, t1);
    t_max = Math.min(t_max, t2);
  }

  return t_min <= t_max && t_max >= 0 && t_min <= 1;
}

/**
 * Checks if a 2D line segment intersects a rotated box.
 */
function intersectSegmentBox(
  ax: number, az: number,
  bx: number, bz: number,
  cx: number, cz: number,
  width: number, depth: number,
  rotY: number
): boolean {
  // 1. Translate start and end points relative to box center
  const ax_rel = ax - cx;
  const az_rel = az - cz;
  const bx_rel = bx - cx;
  const bz_rel = bz - cz;

  // 2. Rotate points back by -rotY to align with axes
  const theta = -rotY;
  const cosT = Math.cos(theta);
  const sinT = Math.sin(theta);

  const ax_rot = ax_rel * cosT - az_rel * sinT;
  const az_rot = ax_rel * sinT + az_rel * cosT;
  const bx_rot = bx_rel * cosT - bz_rel * sinT;
  const bz_rot = bx_rel * sinT + bz_rel * cosT;

  // 3. Perform AABB check with slightly shrunk half extents to avoid edge/precision false-negatives
  const halfX = Math.max(0.1, (width / 2) - 0.2);
  const halfZ = Math.max(0.1, (depth / 2) - 0.2);

  return intersectSegmentAABB(ax_rot, az_rot, bx_rot, bz_rot, halfX, halfZ);
}

/**
 * 2D Segment-Circle Intersection check.
 * Checks if the 2D segment from (ax, az) to (bx, bz) intersects a circle centered at (cx, cz) with radius r.
 */
function intersectSegmentCircle(
  ax: number, az: number,
  bx: number, bz: number,
  cx: number, cz: number,
  r: number
): boolean {
  const vx = bx - ax;
  const vz = bz - az;
  const v_len2 = vx * vx + vz * vz;

  if (v_len2 === 0) {
    const dx = ax - cx;
    const dz = az - cz;
    return dx * dx + dz * dz <= r * r;
  }

  const acx = cx - ax;
  const acz = cz - az;
  const t = (acx * vx + acz * vz) / v_len2;

  const t_closest = Math.max(0, Math.min(1, t));
  const closestX = ax + t_closest * vx;
  const closestZ = az + t_closest * vz;

  const dx = closestX - cx;
  const dz = closestZ - cz;
  return dx * dx + dz * dz <= r * r;
}

/**
 * Iterates over all room obstacles to determine if the shot line of sight is blocked.
 */
function isShotBlocked(
  ax: number, az: number,
  bx: number, bz: number,
  obstacles: ObstacleData[]
): boolean {
  for (const obs of obstacles) {
    const cx = obs.position[0];
    const cz = obs.position[2];

    if (obs.type === 'cylinder') {
      const radius = obs.size[0] / 2;
      const radiusEff = Math.max(0.1, radius - 0.2);
      if (intersectSegmentCircle(ax, az, bx, bz, cx, cz, radiusEff)) {
        return true;
      }
    } else if (obs.type === 'box') {
      const width = obs.size[0];
      const depth = obs.size[2];
      const rotY = obs.rotation[1];
      if (intersectSegmentBox(ax, az, bx, bz, cx, cz, width, depth, rotY)) {
        return true;
      }
    }
  }
  return false;
}

export interface Player {
  id: string;
  name: string;
  position: [number, number, number];
  rotation: number;
  state: 'active' | 'disabled';
  disabledUntil: number;
  score: number;
  color: string;
}

export interface Room {
  id: string;
  players: Record<string, Player>;
  arenaSeed: number;
  status: 'waiting' | 'playing';
  obstacles?: ObstacleData[];
}

export interface IRoomManager {
  getRoom(roomId: string): Promise<Room | null>;
  createRoom(roomId: string, arenaSeed: number): Promise<Room>;
  addPlayer(roomId: string, player: Player): Promise<Room>;
  updatePlayerPosition(roomId: string, socketId: string, position: [number, number, number], rotation: number): Promise<void>;
  updatePlayerState(roomId: string, socketId: string, state: 'active' | 'disabled', disabledUntil: number): Promise<void>;
  updatePlayerScore(roomId: string, socketId: string, score: number): Promise<void>;
  removePlayer(roomId: string, socketId: string): Promise<{ room: Room | null, roomEmpty: boolean }>;
  setRoomStatus(roomId: string, status: 'waiting' | 'playing'): Promise<void>;
  findAvailableRoom(maxRoomSize: number): Promise<string | null>;
  getRoomIdForSocket(socketId: string): Promise<string | null>;
  setRoomIdForSocket(socketId: string, roomId: string): Promise<void>;
  deleteSocketMapping(socketId: string): Promise<void>;
}

export class InMemoryRoomManager implements IRoomManager {
  private rooms = new Map<string, Room>();
  private socketToRoom = new Map<string, string>();

  constructor() {
    // Aggressive garbage collection periodic sweep for any stale empty rooms
    setInterval(() => {
      this.cleanupStaleRooms();
    }, 60000);
  }

  async getRoom(roomId: string): Promise<Room | null> {
    const room = this.rooms.get(roomId);
    return room || null;
  }

  async createRoom(roomId: string, arenaSeed: number): Promise<Room> {
    const room: Room = {
      id: roomId,
      players: {},
      arenaSeed,
      status: 'waiting',
      obstacles: getObstacles(false, arenaSeed, LEVELS[2])
    };
    this.rooms.set(roomId, room);
    return room;
  }

  async addPlayer(roomId: string, player: Player): Promise<Room> {
    const room = this.rooms.get(roomId);
    if (!room) {
      throw new Error(`Room ${roomId} not found`);
    }
    room.players[player.id] = player;
    return room;
  }

  async updatePlayerPosition(
    roomId: string,
    socketId: string,
    position: [number, number, number],
    rotation: number
  ): Promise<void> {
    const room = this.rooms.get(roomId);
    if (room && room.players[socketId]) {
      room.players[socketId].position = position;
      room.players[socketId].rotation = rotation;
    }
  }

  async updatePlayerState(
    roomId: string,
    socketId: string,
    state: 'active' | 'disabled',
    disabledUntil: number
  ): Promise<void> {
    const room = this.rooms.get(roomId);
    if (room && room.players[socketId]) {
      room.players[socketId].state = state;
      room.players[socketId].disabledUntil = disabledUntil;
    }
  }

  async updatePlayerScore(roomId: string, socketId: string, score: number): Promise<void> {
    const room = this.rooms.get(roomId);
    if (room && room.players[socketId]) {
      room.players[socketId].score = score;
    }
  }

  async removePlayer(roomId: string, socketId: string): Promise<{ room: Room | null, roomEmpty: boolean }> {
    const room = this.rooms.get(roomId);
    if (!room) {
      return { room: null, roomEmpty: true };
    }

    delete room.players[socketId];
    const playerCount = Object.keys(room.players).length;

    if (playerCount === 0) {
      this.rooms.delete(roomId);
      return { room: null, roomEmpty: true };
    }

    return { room, roomEmpty: false };
  }

  async setRoomStatus(roomId: string, status: 'waiting' | 'playing'): Promise<void> {
    const room = this.rooms.get(roomId);
    if (room) {
      room.status = status;
    }
  }

  async findAvailableRoom(maxRoomSize: number): Promise<string | null> {
    for (const [roomId, room] of this.rooms.entries()) {
      if (
        room.status === 'waiting' &&
        Object.keys(room.players).length < maxRoomSize &&
        roomId.length === 6
      ) {
        return roomId;
      }
    }
    return null;
  }

  async getRoomIdForSocket(socketId: string): Promise<string | null> {
    return this.socketToRoom.get(socketId) || null;
  }

  async setRoomIdForSocket(socketId: string, roomId: string): Promise<void> {
    this.socketToRoom.set(socketId, roomId);
  }

  async deleteSocketMapping(socketId: string): Promise<void> {
    this.socketToRoom.delete(socketId);
  }

  private cleanupStaleRooms(): void {
    for (const [roomId, room] of this.rooms.entries()) {
      const playerCount = Object.keys(room.players).length;
      if (playerCount === 0) {
        console.log(`[GC] Aggressively garbage collected empty room: ${roomId}`);
        this.rooms.delete(roomId);
      }
    }
  }
}

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

  const roomManager: IRoomManager = new InMemoryRoomManager();

  // Anti-Cheat State Trackers
  const lastShootTimeBySocket: Record<string, number> = {};

  interface PlayerPositionData {
    lastValidPosition: [number, number, number];
    windowStartTime: number;
    windowStartPos: [number, number, number];
    lastUpdateTime: number;
  }
  const playerPositionTracker: Record<string, PlayerPositionData> = {};

  const generateRoomId = () => Math.random().toString(36).substring(2, 8).toUpperCase();

  io.on('connection', (socket) => {
    console.log('User connected:', socket.id);

    const joinRoom = async (roomId: string, playerName: string) => {
      let room = await roomManager.getRoom(roomId);
      if (!room) {
        const arenaSeed = Math.floor(Math.random() * 1000000);
        room = await roomManager.createRoom(roomId, arenaSeed);
      }

      const players = room.players;
      const playerCount = Object.keys(players).length;

      if (playerCount >= MAX_ROOM_SIZE) {
        socket.emit('gameError', 'Room is full');
        return;
      }

      const colors = ['#ff0055', '#32cd32', '#ffff00', '#ff00ff', '#39ff14', '#00ffff', '#ffa500', '#ffffff'];
      const color = colors[playerCount % colors.length];

      const spawnX = (Math.random() - 0.5) * 70;
      const spawnZ = (Math.random() - 0.5) * 70;

      const newPlayer: Player = {
        id: socket.id,
        name: playerName,
        position: [spawnX, 0, spawnZ],
        rotation: 0,
        state: 'active',
        disabledUntil: 0,
        score: 0,
        color
      };

      room = await roomManager.addPlayer(roomId, newPlayer);
      await roomManager.setRoomIdForSocket(socket.id, roomId);

      // Initialize anti-cheat tracker for this player
      playerPositionTracker[socket.id] = {
        lastValidPosition: [spawnX, 0, spawnZ],
        windowStartTime: Date.now(),
        windowStartPos: [spawnX, 0, spawnZ],
        lastUpdateTime: Date.now()
      };

      socket.join(roomId);

      const updatedPlayerCount = Object.keys(room.players).length;

      // Send initial state
      socket.emit('gameJoined', { 
        players: room.players, 
        arenaSeed: room.arenaSeed,
        roomCode: roomId,
        status: room.status
      });
      
      // Broadcast to others in the room
      io.to(roomId).emit('roomUpdate', {
        players: room.players,
        status: room.status,
        playerCount: updatedPlayerCount
      });

      // Check if we can start
      if (room.status === 'waiting' && updatedPlayerCount >= MIN_PLAYERS_TO_START) {
        await roomManager.setRoomStatus(roomId, 'playing');
        io.to(roomId).emit('gameStart');
      }
    };

    socket.on('createRoom', async () => {
      const roomId = generateRoomId();
      await joinRoom(roomId, `Player ${Math.floor(Math.random() * 1000)}`);
    });

    socket.on('joinWithCode', async (code: string) => {
      const room = await roomManager.getRoom(code);
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
      await joinRoom(code, `Player ${Math.floor(Math.random() * 1000)}`);
    });

    socket.on('joinOnline', async () => {
      // Find a room with space AND in waiting state
      let roomId = await roomManager.findAvailableRoom(MAX_ROOM_SIZE);

      if (!roomId) {
        roomId = generateRoomId();
      }
      await joinRoom(roomId, `Player ${Math.floor(Math.random() * 1000)}`);
    });

    socket.on('updatePosition', async (data: { position: [number, number, number], rotation: number }) => {
      const roomId = await roomManager.getRoomIdForSocket(socket.id);
      if (roomId) {
        const room = await roomManager.getRoom(roomId);
        if (!room || !room.players[socket.id]) return;

        const now = Date.now();
        const player = room.players[socket.id];
        const tracker = playerPositionTracker[socket.id];
        
        // If the player was disabled (dead), allow teleport and reactivate them
        const isRespawning = player.state === 'disabled';
        if (isRespawning) {
          player.state = 'active';
          player.disabledUntil = 0;
          await roomManager.updatePlayerState(roomId, socket.id, 'active', 0);
          
          if (tracker) {
            tracker.lastValidPosition = data.position;
            tracker.windowStartTime = now;
            tracker.windowStartPos = data.position;
            tracker.lastUpdateTime = now;
          }
        }

        if (!tracker) {
          playerPositionTracker[socket.id] = {
            lastValidPosition: data.position,
            windowStartTime: now,
            windowStartPos: data.position,
            lastUpdateTime: now
          };
          await roomManager.updatePlayerPosition(roomId, socket.id, data.position, data.rotation);
          socket.to(roomId).emit('playerMoved', { id: socket.id, ...data });
          return;
        }

        // If respawning, skip anti-cheat checks for this single update
        if (isRespawning) {
          await roomManager.updatePlayerPosition(roomId, socket.id, data.position, data.rotation);
          socket.to(roomId).emit('playerMoved', { id: socket.id, ...data });
          return;
        }

        // 1. Teleport check: check distance from last valid pos
        const lastPos = tracker.lastValidPosition;
        const dx = data.position[0] - lastPos[0];
        const dy = data.position[1] - lastPos[1];
        const dz = data.position[2] - lastPos[2];
        const distDelta = Math.sqrt(dx * dx + dy * dy + dz * dz);

        if (distDelta > 40) {
          console.log(`[Anti-Cheat] Teleport detected for player ${socket.id}: delta=${distDelta.toFixed(2)} units`);
          socket.emit('forcePosition', { position: tracker.lastValidPosition });
          return;
        }

        // 2. Speed hack check: check speed in sliding time windows (>= 150ms to account for packet jitter)
        const timeElapsed = now - tracker.windowStartTime;
        const dx_win = data.position[0] - tracker.windowStartPos[0];
        const dy_win = data.position[1] - tracker.windowStartPos[1];
        const dz_win = data.position[2] - tracker.windowStartPos[2];
        const dist_win = Math.sqrt(dx_win * dx_win + dy_win * dy_win + dz_win * dz_win);

        if (timeElapsed >= 150) {
          const speed = dist_win / (timeElapsed / 1000); // units per second
          if (speed > 26) {
            console.log(`[Anti-Cheat] Speed hack detected for player ${socket.id}: speed=${speed.toFixed(2)} units/sec`);
            socket.emit('forcePosition', { position: tracker.lastValidPosition });
            
            // Reset the window to prevent overflow / continuous check issues
            tracker.windowStartTime = now;
            tracker.windowStartPos = tracker.lastValidPosition;
            return;
          } else {
            tracker.windowStartTime = now;
            tracker.windowStartPos = data.position;
          }
        }

        // Update tracking state
        tracker.lastValidPosition = data.position;
        tracker.lastUpdateTime = now;

        await roomManager.updatePlayerPosition(roomId, socket.id, data.position, data.rotation);
        socket.to(roomId).emit('playerMoved', { id: socket.id, ...data });
      }
    });

    socket.on('shoot', async (data: { start: [number, number, number], end: [number, number, number], color: string }) => {
      const roomId = await roomManager.getRoomIdForSocket(socket.id);
      if (roomId) {
        const now = Date.now();
        const lastTime = lastShootTimeBySocket[socket.id] || 0;

        if (now - lastTime < 150) {
          console.log(`[Anti-Cheat] Rate limit exceeded on shoot for player ${socket.id}`);
          return;
        }

        lastShootTimeBySocket[socket.id] = now;
        socket.to(roomId).emit('playerShot', { id: socket.id, ...data });
      }
    });

    socket.on('hitPlayer', async (targetId: string) => {
      const roomId = await roomManager.getRoomIdForSocket(socket.id);
      if (roomId) {
        const room = await roomManager.getRoom(roomId);
        if (!room || !room.players[targetId] || !room.players[socket.id]) return;

        const now = Date.now();
        const target = room.players[targetId];
        const shooter = room.players[socket.id];

        const shooterPos = shooter.position;
        const targetPos = target.position;

        // 1. Distance check
        const dx = targetPos[0] - shooterPos[0];
        const dy = targetPos[1] - shooterPos[1];
        const dz = targetPos[2] - shooterPos[2];
        const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);

        if (dist > 105) {
          console.log(`[Anti-Cheat] Hit rejected: shooter ${socket.id} distance to target ${targetId} too large (${dist.toFixed(2)} > 105)`);
          return;
        }

        // 2. Wall obstruction check
        const obstacles = room.obstacles || [];
        if (isShotBlocked(shooterPos[0], shooterPos[2], targetPos[0], targetPos[2], obstacles)) {
          console.log(`[Anti-Cheat] Hit rejected: shooter ${socket.id} fired through wall at target ${targetId}`);
          return;
        }

        if (target.state === 'active' || now > target.disabledUntil) {
          const disabledUntil = now + 3000;
          const newScore = shooter.score + 100;

          await roomManager.updatePlayerState(roomId, targetId, 'disabled', disabledUntil);
          await roomManager.updatePlayerScore(roomId, socket.id, newScore);
          
          io.to(roomId).emit('playerHit', {
            targetId,
            shooterId: socket.id,
            targetDisabledUntil: disabledUntil,
            shooterScore: newScore
          });
        }
      }
    });

    socket.on('disconnect', async () => {
      const roomId = await roomManager.getRoomIdForSocket(socket.id);
      
      // Cleanup trackers
      delete lastShootTimeBySocket[socket.id];
      delete playerPositionTracker[socket.id];

      if (roomId) {
        await roomManager.deleteSocketMapping(socket.id);
        const { room, roomEmpty } = await roomManager.removePlayer(roomId, socket.id);
        io.to(roomId).emit('playerLeft', socket.id);

        if (room) {
          if (room.status === 'waiting') {
            io.to(roomId).emit('roomUpdate', {
              players: room.players,
              status: room.status,
              playerCount: Object.keys(room.players).length
            });
          }
        } else if (roomEmpty) {
          console.log(`[GC] Cleaned up room ${roomId} on player disconnect`);
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