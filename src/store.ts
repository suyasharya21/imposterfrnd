/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/

import { create } from 'zustand';
import * as THREE from 'three';
import { io, Socket } from 'socket.io-client';
import { sounds } from './lib/sounds';
import { mulberry32, getObstacles, ObstacleData } from './constants';

export type GameState = 'menu' | 'waiting' | 'playing' | 'gameover';
export type EntityState = 'active' | 'disabled';

export type WeaponType = 'gun' | 'knife' | 'pistol';

export interface EnemyData {
  id: string;
  position: [number, number, number];
  state: EntityState;
  disabledUntil: number;
  score: number;
  health: number;
}

export interface PlayerData {
  id: string;
  name: string;
  position: [number, number, number];
  rotation: number;
  state: EntityState;
  disabledUntil: number;
  score: number;
  color: string;
  role?: 'crewmate' | 'imposter';
  isAlive?: boolean;
  currentVote?: string | null;
}

export interface LaserData {
  id: string;
  start: [number, number, number];
  end: [number, number, number];
  timestamp: number;
  color: string;
}

export interface ParticleData {
  id: string;
  position: [number, number, number];
  timestamp: number;
  color: string;
}

export interface GameEvent {
  id: string;
  message: string;
  timestamp: number;
}

export interface CoinData {
  id: string;
  position: [number, number, number];
  collected: boolean;
}

interface GameStore {
  gameState: GameState;
  score: number;
  timeLeft: number;
  playerState: EntityState;
  playerDisabledUntil: number;
  enemies: EnemyData[];
  lasers: LaserData[];
  particles: ParticleData[];
  events: GameEvent[];
  coins: CoinData[];
  
  role: 'crewmate' | 'imposter' | null;
  isAlive: boolean;
  votingPhase: boolean;
  tasks: Array<{ id: string, x: number, z: number }>;
  chatHistory: Array<{ sender: string, message: string, timestamp: number }>;
  isDoingTask: boolean;
  currentTaskId: string | null;
  setIsDoingTask: (isDoingTask: boolean, taskId: string | null) => void;

  socket: Socket | null;
  roomCode: string | null;
  gameMode: 'cpu' | 'online' | 'room' | null;
  cpuLevel: number;
  cpuLevelCleared: boolean;
  otherPlayers: Record<string, PlayerData>;
  playerPosition: [number, number, number];
  playerRotation: number;
  currentWeapon: WeaponType;
  ammo: Record<WeaponType, number>;
  arenaSeed: number;
  lives: number;
  isCursorLocked: boolean;
  isConnecting: boolean;
  error: string | null;
  forcedPosition: [number, number, number] | null;

  timerInterval: NodeJS.Timeout | null;
  hostId: string | null;
  lobbyCountdown: number | null;
  playerName: string;
  setPlayerName: (name: string) => void;
  hostStartGame: () => void;
  startGame: (mode: 'online' | 'cpu' | 'room', code?: string) => void;
  createRoom: () => void;
  joinRoom: (code: string) => void;
  endGame: () => void;
  leaveGame: () => void;
  advanceCpuLevel: () => void;
  updateTime: (delta: number) => void;
  hitPlayer: (botId?: string) => void;
  hitEnemy: (id: string, damage: number, byPlayer?: boolean) => void;
  collectCoin: (id: string, collectorId?: string) => void;
  addLaser: (start: [number, number, number], end: [number, number, number], color: string) => void;
  addParticles: (position: [number, number, number], color: string) => void;
  addEvent: (message: string) => void;
  updateEnemies: (time: number) => void;
  setEnemies: (enemies: EnemyData[]) => void;
  updateEnemyPosition: (id: string, position: [number, number, number]) => void;
  cleanupEffects: (time: number) => void;
  setPlayerState: (state: EntityState) => void;
  setCursorLocked: (locked: boolean) => void;
  cycleWeapon: () => void;
  useAmmo: (weapon: WeaponType) => boolean;
  
  updatePlayerPosition: (position: [number, number, number], rotation: number) => void;

  mobileInput: { move: { x: number, y: number }; look: { x: number, y: number }; shooting: boolean; jumping: boolean; };
  setMobileInput: (input: Partial<{ move: { x: number, y: number }; look: { x: number, y: number }; shooting: boolean; jumping: boolean; }>) => void;
}

const checkOverlap = (x: number, z: number, obstacles: ObstacleData[]) => {
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
      if (Math.abs(localX) < halfW + buffer && Math.abs(localZ) < halfD + buffer) return true;
    }
  }
  return false;
}

export const useGameStore = create<GameStore>((set, get) => ({
  gameState: 'menu', score: 0, timeLeft: 150, playerState: 'active', playerDisabledUntil: 0,
  enemies: [], lasers: [], particles: [], events: [], coins: [], role: null, isAlive: true,
  votingPhase: false, tasks: [], chatHistory: [], isDoingTask: false, currentTaskId: null,
  setIsDoingTask: (isDoingTask, taskId) => set({ isDoingTask, currentTaskId: taskId }), forcedPosition: null,

  socket: null, roomCode: null, gameMode: null, hostId: null, lobbyCountdown: null,
  playerName: `Pilot-${Math.floor(100 + Math.random() * 900)}`, setPlayerName: (name) => set({ playerName: name }),
  cpuLevel: 1, cpuLevelCleared: false, otherPlayers: {}, playerPosition: [0, 1, 0], playerRotation: 0,
  currentWeapon: 'gun', ammo: { gun: 30, pistol: 20, knife: Infinity }, arenaSeed: 12345, lives: 3,
  isCursorLocked: false, isConnecting: false, error: null, timerInterval: null,

  mobileInput: { move: { x: 0, y: 0 }, look: { x: 0, y: 0 }, shooting: false, jumping: false },
  setMobileInput: (input) => set((state) => ({ mobileInput: { ...state.mobileInput, ...input } })),

  startGame: (mode, code) => {
    const { socket, timerInterval } = get();
    if (socket) socket.disconnect();
    if (timerInterval) clearInterval(timerInterval);

    set({ error: null, isConnecting: true });

    if (mode === 'cpu') {
      const arenaSeed = Math.floor(Math.random() * 1000000);
      const rng = mulberry32(arenaSeed + 1);
      const obstacles = getObstacles(false, arenaSeed);
      const enemies: EnemyData[] = Array.from({ length: 3 }).map((_, i) => {
        let x, z;
        do { x = (rng() - 0.5) * 170; z = (rng() - 0.5) * 170; } while ((Math.abs(x) < 20 && Math.abs(z) < 20) || checkOverlap(x, z, obstacles));
        return { id: `bot-${i + 1}`, position: [x, 1, z], state: 'active', disabledUntil: 0, score: 0, health: 2 };
      });
      const coins: CoinData[] = Array.from({ length: 25 }).map((_, i) => ({ id: `coin-init-${i}`, position: [(rng() - 0.5) * 180, 1.2, (rng() - 0.5) * 180], collected: false }));
      
      set({ 
        gameState: 'playing', gameMode: 'cpu', cpuLevel: 1, cpuLevelCleared: false, isConnecting: false, roomCode: 'OFFLINE_OPS', timeLeft: 480, score: 0, arenaSeed, enemies, coins, lives: 3, ammo: { gun: 100, pistol: 100, knife: Infinity }, otherPlayers: {}, role: 'crewmate', isAlive: true, votingPhase: false, tasks: [], chatHistory: [], isDoingTask: false, currentTaskId: null,
        timerInterval: setInterval(() => get().updateTime(1), 1000)
      }); return;
    }

    let newSocket: Socket | null = io(window.location.origin);
    
    newSocket.on('connect', () => {
      const playerName = get().playerName;
      if (mode === 'online') newSocket!.emit('joinOnline', { playerName });
      else if (mode === 'room' && code) newSocket!.emit('joinWithCode', { code, playerName });
      else if (mode === 'room' && !code) newSocket!.emit('createRoom', { playerName });
    });

    newSocket.on('gameError', (msg: string) => { set({ error: msg, isConnecting: false }); get().leaveGame(); });

    newSocket.on('gameJoined', ({ players, arenaSeed, roomCode, status, hostId, countdown, bots, coins }: any) => {
      const otherPlayers = { ...players }; delete otherPlayers[newSocket!.id!];
      const localPlayer = players[newSocket!.id!];

      set({ 
        otherPlayers, roomCode, gameMode: mode, isConnecting: false, gameState: status === 'waiting' ? 'waiting' : 'playing',
        timeLeft: 1200, score: 0, hostId: hostId || null, lobbyCountdown: countdown !== undefined ? countdown : null,
        arenaSeed, enemies: bots || [], coins: coins || [], lives: 3, ammo: { gun: 30, pistol: 20, knife: Infinity },
        role: localPlayer ? (localPlayer.role || 'crewmate') : 'crewmate', isAlive: localPlayer ? (localPlayer.isAlive ?? true) : true,
        votingPhase: false, tasks: [], chatHistory: [], isDoingTask: false, currentTaskId: null
      });

      if (status === 'playing') set({ timerInterval: setInterval(() => { if (get().gameMode === 'cpu') get().updateTime(1); }, 1000) });
    });

    newSocket.on('roomUpdate', ({ players, status, hostId, countdown }: any) => {
      const otherPlayers = { ...players }; delete otherPlayers[newSocket!.id!];
      const localPlayer = players[newSocket!.id!];
      if (localPlayer) set({ isAlive: localPlayer.isAlive ?? get().isAlive, role: localPlayer.role ?? get().role });
      set({ otherPlayers, hostId: hostId !== undefined ? hostId : get().hostId, lobbyCountdown: countdown !== undefined ? countdown : get().lobbyCountdown });
    });

    newSocket.on('countdownUpdate', ({ countdown }: { countdown: number | null }) => set({ lobbyCountdown: countdown }));

    newSocket.on('gameStart', ({ roles, tasks, bots }: any) => {
      const myId = newSocket!.id!;
      const otherPlayers = { ...get().otherPlayers };
      Object.keys(otherPlayers).forEach(id => { if (roles[id]) { otherPlayers[id].role = roles[id]; otherPlayers[id].isAlive = true; otherPlayers[id].currentVote = null; } });

      set({ 
        gameState: 'playing', role: roles[myId] || 'crewmate', isAlive: true, votingPhase: false, tasks: tasks, otherPlayers, enemies: bots || [], chatHistory: [], isDoingTask: false, currentTaskId: null, lobbyCountdown: null,
        timerInterval: setInterval(() => { if (get().gameMode === 'cpu') get().updateTime(1); }, 1000)
      });
      sounds.playJoin();
    });

    // --- NEW SECURE BOT LISTENERS ---
    newSocket.on('botKilled', ({ botId, shooterId, shooterScore, newCoin }: any) => {
      set(state => {
        const enemies = state.enemies.map(e => e.id === botId ? { ...e, health: 0, state: 'disabled' as EntityState, disabledUntil: Date.now() + 9999999 } : e);
        const coins = [...state.coins, { ...newCoin, collected: false }];
        let otherPlayers = { ...state.otherPlayers };
        if (shooterId !== newSocket!.id && otherPlayers[shooterId]) otherPlayers[shooterId].score = shooterScore;
        const isLocal = shooterId === newSocket!.id;
        
        return { enemies, coins, score: isLocal ? shooterScore : state.score, otherPlayers, events: [...state.events, { id: Math.random().toString(), message: `Bot ${botId} eliminated! Loot dropped.`, timestamp: Date.now() }] };
      });
      sounds.playHit();
    });

    newSocket.on('botHit', ({ botId, health }: any) => {
      set(state => ({ enemies: state.enemies.map(e => e.id === botId ? { ...e, health } : e) }));
      sounds.playHit();
    });

    newSocket.on('coinCollected', ({ coinId, playerId, playerScore }: any) => {
      set(state => {
        const isLocal = playerId === newSocket!.id;
        let otherPlayers = { ...state.otherPlayers };
        if (!isLocal && otherPlayers[playerId]) otherPlayers[playerId].score = playerScore;
        if (isLocal) sounds.playCollect();
        return {
          coins: state.coins.filter(c => c.id !== coinId),
          score: isLocal ? playerScore : state.score, otherPlayers,
          events: [...state.events, { id: Math.random().toString(), message: isLocal ? '+100 SCORE' : `Player collected loot`, timestamp: Date.now() }]
        };
      });
    });

    newSocket.on('playerJoined', (player: PlayerData) => { sounds.playJoin(); set(state => ({ otherPlayers: { ...state.otherPlayers, [player.id]: player }, events: [...state.events, { id: Math.random().toString(), message: `${player.name} joined`, timestamp: Date.now() }] })); });
    newSocket.on('forcePosition', (pos: [number, number, number]) => set({ forcedPosition: pos }));
    newSocket.on('playerMoved', (data: any) => set(state => !state.otherPlayers[data.id] ? state : { otherPlayers: { ...state.otherPlayers, [data.id]: { ...state.otherPlayers[data.id], position: data.position, rotation: data.rotation } } }));
    newSocket.on('roomTick', (serverPlayers: Record<string, PlayerData>) => {
      set(state => {
        const otherPlayers = { ...state.otherPlayers };
        let updated = false;
        Object.keys(serverPlayers).forEach(id => {
          if (id !== newSocket!.id && otherPlayers[id]) {
            otherPlayers[id] = {
              ...otherPlayers[id],
              position: serverPlayers[id].position,
              rotation: serverPlayers[id].rotation
            };
            updated = true;
          }
        });
        return updated ? { otherPlayers } : state;
      });
    });
    newSocket.on('playerShot', (data: any) => { sounds.playLaser(); set(state => ({ lasers: [...state.lasers, { id: Math.random().toString(36).substr(2, 9), start: data.start, end: data.end, timestamp: Date.now(), color: data.color }], particles: [...state.particles, { id: Math.random().toString(36).substr(2, 9), position: data.end, timestamp: Date.now(), color: data.color }] })); });
    
    newSocket.on('playerHit', (data: any) => {
      set(state => {
        const now = Date.now();
        const isLocalShooter = data.shooterId === newSocket!.id;
        const isLocalTarget = data.targetId === newSocket!.id;
        const eventMsg = `${isLocalShooter ? 'You' : (state.otherPlayers[data.shooterId]?.name || 'Unknown')} tagged ${isLocalTarget ? 'You' : (state.otherPlayers[data.targetId]?.name || 'Unknown')}`;
        
        let newState: Partial<GameStore> = { events: [...state.events, { id: Math.random().toString(), message: eventMsg, timestamp: now }] };
        if (isLocalTarget) {
          sounds.playPlayerDisabled();
          if (state.lives - 1 <= 0) { if (state.socket) state.socket.disconnect(); return { gameState: 'gameover', lives: 0, events: [...state.events, { id: Math.random().toString(), message: 'GAME OVER - Out of lives!', timestamp: now }] }; }
          newState.playerState = 'disabled'; newState.playerDisabledUntil = data.targetDisabledUntil; newState.lives = state.lives - 1;
        } else { sounds.playHit(); }
        
        if (isLocalShooter) newState.score = data.shooterScore;
        const players = { ...state.otherPlayers }; let playersChanged = false;
        
        if (!isLocalTarget && players[data.targetId]) { players[data.targetId] = { ...players[data.targetId], state: 'disabled', disabledUntil: data.targetDisabledUntil }; playersChanged = true; }
        if (!isLocalShooter && players[data.shooterId]) { players[data.shooterId] = { ...players[data.shooterId], score: data.shooterScore }; playersChanged = true; }
        if (playersChanged) newState.otherPlayers = players;
        
        return newState;
      });
    });

    newSocket.on('playerLeft', (id: string) => { sounds.playLeave(); set(state => { const players = { ...state.otherPlayers }; const name = players[id]?.name || 'Unknown'; delete players[id]; return { otherPlayers: players, events: [...state.events, { id: Math.random().toString(), message: `${name} left`, timestamp: Date.now() }] }; }); });
    newSocket.on('timerUpdate', ({ roomTimer, votingTimer, phase }: any) => set({ timeLeft: phase === 'voting' ? votingTimer : roomTimer, votingPhase: phase === 'voting' }));
    newSocket.on('triggerVotingPhase', ({ players, killedPlayerId }: any) => {
      const myId = newSocket!.id!; const otherPlayers = { ...players }; delete otherPlayers[myId];
      set({ votingPhase: true, otherPlayers, isAlive: players[myId] ? (players[myId].isAlive ?? true) : true, chatHistory: [], isDoingTask: false, currentTaskId: null });
      sounds.playPlayerDisabled(); get().addEvent(`ALERT: Voting Phase Triggered! ${players[killedPlayerId]?.name || 'Someone'} was murdered.`);
    });
    newSocket.on('tasksUpdate', (tasks: any) => set({ tasks }));
    newSocket.on('receiveChatMessage', (msg: any) => set(state => ({ chatHistory: [...state.chatHistory, msg] })));
    newSocket.on('gameOver', (data: any) => {
      if (get().timerInterval) clearInterval(get().timerInterval!);
      set({ gameState: 'gameover', votingPhase: false, timeLeft: 0, isDoingTask: false, currentTaskId: null, events: [...get().events, { id: Math.random().toString(), message: data.result === 'crewmates_win' ? `CREWMATES WIN! Imposter ${data.name || ''} was ejected.` : `IMPOSTER WINS!`, timestamp: Date.now() }] });
    });

    set({ socket: newSocket });
  },

  createRoom: () => get().startGame('room'), joinRoom: (code) => get().startGame('room', code),
  hostStartGame: () => { const { socket } = get(); if (socket) socket.emit('hostStartGame'); },
  endGame: () => { const { socket, timerInterval } = get(); if (socket) socket.disconnect(); if (timerInterval) clearInterval(timerInterval); set({ gameState: 'gameover', socket: null, timerInterval: null, votingPhase: false, isDoingTask: false, currentTaskId: null }); },
  leaveGame: () => { const { socket, timerInterval } = get(); if (socket) socket.disconnect(); if (timerInterval) clearInterval(timerInterval); set({ gameState: 'menu', socket: null, timerInterval: null, isConnecting: false, otherPlayers: {}, hostId: null, lobbyCountdown: null, enemies: [], lasers: [], particles: [], events: [], coins: [], score: 0, timeLeft: 150, playerState: 'active', lives: 3, ammo: { gun: 30, pistol: 20, knife: Infinity }, role: null, isAlive: true, votingPhase: false, tasks: [], chatHistory: [], isDoingTask: false, currentTaskId: null }); },
  updateTime: (delta) => set((state) => {
    if (state.gameState !== 'playing' || state.gameMode !== 'cpu') return state;
    const newTime = state.timeLeft - delta;
    if (newTime <= 0) { const { socket, timerInterval } = get(); if (socket) socket.disconnect(); if (timerInterval) clearInterval(timerInterval); return { timeLeft: 0, gameState: 'gameover', socket: null, timerInterval: null }; }
    return { timeLeft: newTime };
  }),

  hitPlayer: (botId) => set((state) => {
    if (state.playerState === 'disabled' || state.gameState !== 'playing') return state;
    sounds.playPlayerDisabled();
    const newLives = state.lives - 1; let newState: Partial<GameStore> = {};
    if (botId) {
      const enemyIndex = state.enemies.findIndex(e => e.id === botId);
      if (enemyIndex !== -1) {
        const newEnemies = [...state.enemies]; newEnemies[enemyIndex] = { ...newEnemies[enemyIndex], score: (newEnemies[enemyIndex].score || 0) + 50 };
        newState.enemies = newEnemies; newState.events = [...state.events, { id: Math.random().toString(), message: `Bot ${botId} scored +50!`, timestamp: Date.now() }];
      }
    }
    if (newLives <= 0) { if (state.socket) state.socket.disconnect(); return { ...newState, gameState: 'gameover', lives: 0, score: Math.max(0, state.score - 50) }; }
    return { ...newState, playerState: 'disabled', playerDisabledUntil: Date.now() + 3000, score: Math.max(0, state.score - 50), lives: newLives };
  }),

  hitEnemy: (id, damage, byPlayer = false) => set((state) => {
    if (state.gameState !== 'playing') return state;
    
    // 10/10 DELEGATE ALL MULTIPLAYER PVE TO THE SERVER
    if (state.gameMode !== 'cpu') {
      if (state.socket) state.socket.emit('hitBot', id);
      return state;
    }

    // Offline mode logic remains identical
    let enemyKilled = false; let enemyPos: [number, number, number] | null = null;
    const enemies = state.enemies.map(e => {
      if (e.id === id && e.state === 'active') {
        sounds.playHit();
        if (e.health - damage <= 0) { enemyKilled = true; enemyPos = e.position; return { ...e, health: 0, state: 'disabled' as EntityState, disabledUntil: Date.now() + 999999999 }; }
        return { ...e, health: e.health - damage };
      }
      return e;
    });

    if (!enemyKilled) return { enemies };
    const newCoins = [...state.coins];
    const angle = Math.random() * Math.PI * 2;
    newCoins.push({ id: `coin-loot-${Date.now()}-${Math.random()}`, position: [enemyPos![0] + (Math.cos(angle) * 1.5), 1.2, enemyPos![2] + (Math.sin(angle) * 1.5)], collected: false });

    const nextState: Partial<GameStore> = { enemies, coins: newCoins, events: [...state.events, { id: Math.random().toString(), message: byPlayer ? `Bot ${id} eliminated! Loot dropped.` : `Bot ${id} went down!`, timestamp: Date.now() }] };
    if (state.gameMode === 'cpu' && enemies.every(e => e.state === 'disabled')) {
      if (state.cpuLevel >= 10) { nextState.gameState = 'gameover'; nextState.events = [...nextState.events!, { id: Math.random().toString(), message: "VICTORY! You completed all 10 levels!", timestamp: Date.now() }]; }
      else { nextState.cpuLevelCleared = true; sounds.playCollect(); }
    }
    return nextState;
  }),

  collectCoin: (id, collectorId) => set((state) => {
    // 10/10 DELEGATE ALL MULTIPLAYER ECONOMY TO SERVER
    if (state.gameMode !== 'cpu') {
      if (state.socket) state.socket.emit('collectCoin', id);
      return state;
    }

    const coin = state.coins.find(c => c.id === id); if (!coin || coin.collected) return state;
    if (collectorId && collectorId.startsWith('bot-')) {
      const enemyIndex = state.enemies.findIndex(e => e.id === collectorId);
      if (enemyIndex === -1 || state.enemies[enemyIndex].state !== 'active') return state;
      const newEnemies = [...state.enemies]; newEnemies[enemyIndex] = { ...newEnemies[enemyIndex], score: (newEnemies[enemyIndex].score || 0) + 100 };
      return { enemies: newEnemies, coins: state.coins.filter(c => c.id !== id), events: [...state.events, { id: Math.random().toString(), message: `Bot ${collectorId} collected +100 SCORE`, timestamp: Date.now() }] };
    }
    sounds.playCollect();
    return { score: state.score + 100, coins: state.coins.filter(c => c.id !== id), events: [...state.events, { id: Math.random().toString(), message: '+100 SCORE', timestamp: Date.now() }] };
  }),

  addLaser: (start, end, color) => { const { socket } = get(); sounds.playLaser(); if (socket) { socket.emit('shoot', { start, end, color }); } set((state) => ({ lasers: [...state.lasers, { id: Math.random().toString(36).substr(2, 9), start, end, timestamp: Date.now(), color }] })); },
  addParticles: (position, color) => set((state) => ({ particles: [...state.particles, { id: Math.random().toString(36).substr(2, 9), position, timestamp: Date.now(), color }] })),
  addEvent: (message) => set((state) => ({ events: [...state.events, { id: Math.random().toString(), message, timestamp: Date.now() }] })),
  updateEnemies: (time) => set((state) => {
    let otherPlayers = state.otherPlayers; let playersChanged = false;
    Object.values(state.otherPlayers).forEach(p => { if (p.state === 'disabled' && time > p.disabledUntil) { if (!playersChanged) { otherPlayers = { ...state.otherPlayers }; playersChanged = true; } otherPlayers[p.id] = { ...p, state: 'active' }; } });
    if (state.playerState === 'disabled' && time > state.playerDisabledUntil) return { playerState: 'active', otherPlayers: playersChanged ? otherPlayers : state.otherPlayers };
    return playersChanged ? { otherPlayers } : state;
  }),
  setEnemies: (enemies) => set({ enemies }),
  
  updateEnemyPosition: (id, position) => set((state) => {
    const index = state.enemies.findIndex(e => e.id === id);
    if (index === -1) return state;
    if (
      Math.abs(state.enemies[index].position[0] - position[0]) < 0.01 &&
      Math.abs(state.enemies[index].position[2] - position[2]) < 0.01
    ) return state;
    
    const newEnemies = [...state.enemies];
    newEnemies[index] = { ...newEnemies[index], position };
    return { enemies: newEnemies };
  }),

  cleanupEffects: (time) => set((state) => {
    const lasers = state.lasers.filter(l => time - l.timestamp < 50); // Lasers last 50ms (quick flash)
    const particles = state.particles.filter(p => time - p.timestamp < 500); // Particles last 500ms
    const events = state.events.filter(e => time - e.timestamp < 5000); // Events last 5s
    if (lasers.length !== state.lasers.length || particles.length !== state.particles.length || events.length !== state.events.length) {
      return { lasers, particles, events };
    }
    return state;
  }),

  setPlayerState: (playerState) => set({ playerState }),

  setCursorLocked: (isCursorLocked) => set({ isCursorLocked }),

  cycleWeapon: () => set((state) => {
    const weapons: WeaponType[] = ['gun', 'knife', 'pistol'];
    const currentIndex = weapons.indexOf(state.currentWeapon);
    const nextIndex = (currentIndex + 1) % weapons.length;
    const nextWeapon = weapons[nextIndex];
    
    if (state.socket) {
      state.socket.emit('switchWeapon', nextWeapon);
    }
    
    return { 
      currentWeapon: nextWeapon,
      events: [...state.events, { id: Math.random().toString(), message: `Equipped: ${nextWeapon.toUpperCase()} (${state.ammo[nextWeapon] === Infinity ? '∞' : state.ammo[nextWeapon]})`, timestamp: Date.now() }]
    };
  }),

  useAmmo: (weapon) => {
    const state = get();
    if (state.ammo[weapon] <= 0) return false;
    
    if (state.ammo[weapon] !== Infinity) {
      if (weapon === 'gun' && Math.random() > 0.5) {
        return true;
      }
      set((s) => ({
        ammo: {
          ...s.ammo,
          [weapon]: s.ammo[weapon] - 1
        }
      }));
    }
    return true;
  },

  updatePlayerPosition: (position, rotation) => {
    const { socket } = get();
    if (socket) {
      socket.emit('updatePosition', { position, rotation });
    }
    set({ playerPosition: position, playerRotation: rotation });
  },

  advanceCpuLevel: () => set((state) => {
    if (state.gameMode !== 'cpu' || !state.cpuLevelCleared) return state;

    const nextLevel = state.cpuLevel + 1;
    const nextSeed = Math.floor(Math.random() * 1000000);
    const rng = mulberry32(nextSeed + nextLevel);
    const obstacles = getObstacles(false, nextSeed);
    const newLevelEnemies: EnemyData[] = Array.from({ length: nextLevel + 2 }).map((_, i) => {
      let x, z;
      do {
        x = (rng() - 0.5) * 170;
        z = (rng() - 0.5) * 170;
      } while ((Math.abs(x) < 20 && Math.abs(z) < 20) || checkOverlap(x, z, obstacles));

      return {
        id: `bot-${i + 1}`,
        position: [x, 1, z],
        state: 'active',
        disabledUntil: 0,
        score: 0,
        health: 2
      };
    });

    const newCoins: CoinData[] = Array.from({ length: 25 }).map((_, i) => ({
      id: `coin-init-${nextLevel}-${i}`,
      position: [(rng() - 0.5) * 180, 1.2, (rng() - 0.5) * 180],
      collected: false
    }));

    return {
      cpuLevel: nextLevel,
      cpuLevelCleared: false,
      arenaSeed: nextSeed,
      enemies: newLevelEnemies,
      coins: newCoins,
      timeLeft: state.timeLeft + 30,
      ammo: { gun: 100, pistol: 100, knife: Infinity },
      lives: Math.min(3, state.lives + 1), // bonus life reward
      forcedPosition: [0, 1, 0], // teleport player back to center spawn point
      events: [...state.events, {
        id: Math.random().toString(),
        message: `LEVEL ${nextLevel} STARTED! Spawned ${nextLevel + 2} bots.`,
        timestamp: Date.now()
      }]
    };
  })
}));
