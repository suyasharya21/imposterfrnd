/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/

import { create } from 'zustand';
import * as THREE from 'three';
import { io, Socket } from 'socket.io-client';
import { sounds } from './lib/sounds';
import { mulberry32 } from './constants';

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
  
  // Social Deduction
  role: 'crewmate' | 'imposter' | null;
  isAlive: boolean;
  votingPhase: boolean;
  tasks: Array<{ id: string, x: number, z: number }>;
  chatHistory: Array<{ sender: string, message: string, timestamp: number }>;
  isDoingTask: boolean;
  currentTaskId: string | null;
  setIsDoingTask: (isDoingTask: boolean, taskId: string | null) => void;

  // Multiplayer
  socket: Socket | null;
  roomCode: string | null;
  gameMode: 'cpu' | 'online' | 'room' | null;
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

  timerInterval: NodeJS.Timeout | null;
  startGame: (mode: 'online' | 'cpu' | 'room', code?: string) => void;
  createRoom: () => void;
  joinRoom: (code: string) => void;
  endGame: () => void;
  leaveGame: () => void;
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
  
  // Multiplayer actions
  updatePlayerPosition: (position: [number, number, number], rotation: number) => void;

  // Mobile Controls
  mobileInput: {
    move: { x: number, y: number };
    look: { x: number, y: number };
    shooting: boolean;
    jumping: boolean;
  };
  setMobileInput: (input: Partial<{
    move: { x: number, y: number };
    look: { x: number, y: number };
    shooting: boolean;
    jumping: boolean;
  }>) => void;
}

const INITIAL_ENEMIES: EnemyData[] = [
  { id: 'bot-1', position: [40, 1, 40], state: 'active', disabledUntil: 0, score: 0, health: 2 },
  { id: 'bot-2', position: [-40, 1, 40], state: 'active', disabledUntil: 0, score: 0, health: 2 },
  { id: 'bot-3', position: [40, 1, -40], state: 'active', disabledUntil: 0, score: 0, health: 2 },
  { id: 'bot-4', position: [-40, 1, -40], state: 'active', disabledUntil: 0, score: 0, health: 2 },
  { id: 'bot-5', position: [0, 1, -50], state: 'active', disabledUntil: 0, score: 0, health: 2 },
  { id: 'bot-6', position: [60, 1, 0], state: 'active', disabledUntil: 0, score: 0, health: 2 },
  { id: 'bot-7', position: [-60, 1, 0], state: 'active', disabledUntil: 0, score: 0, health: 2 },
  { id: 'bot-8', position: [0, 1, 50], state: 'active', disabledUntil: 0, score: 0, health: 2 },
];

export const useGameStore = create<GameStore>((set, get) => ({
  gameState: 'menu',
  score: 0,
  timeLeft: 150, // 2.5 minutes
  playerState: 'active',
  playerDisabledUntil: 0,
  enemies: [],
  lasers: [],
  particles: [],
  events: [],
  coins: [],
  
  // Social Deduction defaults
  role: null,
  isAlive: true,
  votingPhase: false,
  tasks: [],
  chatHistory: [],
  isDoingTask: false,
  currentTaskId: null,
  setIsDoingTask: (isDoingTask, taskId) => set({ isDoingTask, currentTaskId: taskId }),

  socket: null,
  roomCode: null,
  gameMode: null,
  otherPlayers: {},
  playerPosition: [0, 1, 0],
  playerRotation: 0,
  currentWeapon: 'gun',
  ammo: { gun: 30, pistol: 20, knife: Infinity },
  arenaSeed: 12345,
  lives: 3,
  isCursorLocked: false,
  isConnecting: false,
  error: null,
  timerInterval: null,

  mobileInput: {
    move: { x: 0, y: 0 },
    look: { x: 0, y: 0 },
    shooting: false,
    jumping: false
  },

  setMobileInput: (input) => set((state) => ({
    mobileInput: { ...state.mobileInput, ...input }
  })),

  startGame: (mode, code) => {
    const { socket, timerInterval } = get();
    
    if (socket) {
      socket.disconnect();
    }

    if (timerInterval) {
      clearInterval(timerInterval);
    }

    set({ error: null, isConnecting: true });

    if (mode === 'cpu') {
      const arenaSeed = Math.floor(Math.random() * 1000000);
      const rng = mulberry32(arenaSeed + 1);
      const enemies: EnemyData[] = Array.from({ length: 16 }).map((_, i) => {
        let x, z;
        do {
          x = (rng() - 0.5) * 170;
          z = (rng() - 0.5) * 170;
        } while (Math.abs(x) < 20 && Math.abs(z) < 20);
        
        return {
          id: `bot-${i + 1}`,
          position: [x, 1, z],
          state: 'active',
          disabledUntil: 0,
          score: 0,
          health: 2
        };
      });

      const coins: CoinData[] = Array.from({ length: 25 }).map((_, i) => ({
        id: `coin-init-${i}`,
        position: [(rng() - 0.5) * 180, 1.2, (rng() - 0.5) * 180],
        collected: false
      }));

      const tasks: Array<{ id: string, x: number, z: number }> = Array.from({ length: 3 }).map((_, i) => ({
        id: `task-cpu-${i}`,
        x: (rng() - 0.5) * 140,
        z: (rng() - 0.5) * 140
      }));

      set({ 
        gameState: 'playing',
        gameMode: 'cpu',
        isConnecting: false,
        roomCode: 'OFFLINE_OPS',
        timeLeft: 300,
        score: 0,
        arenaSeed,
        enemies,
        coins,
        lives: 5,
        ammo: { gun: 100, pistol: 100, knife: Infinity },
        otherPlayers: {},
        role: 'crewmate',
        isAlive: true,
        votingPhase: false,
        tasks,
        chatHistory: [],
        isDoingTask: false,
        currentTaskId: null,
        timerInterval: setInterval(() => {
          get().updateTime(1);
        }, 1000)
      });
      return;
    }

    let newSocket: Socket | null = null;

    newSocket = io(window.location.origin);
    
    newSocket.on('connect', () => {
      if (mode === 'online') {
        newSocket!.emit('joinOnline');
      } else if (mode === 'room' && code) {
        newSocket!.emit('joinWithCode', code);
      } else if (mode === 'room' && !code) {
        newSocket!.emit('createRoom');
      }
    });

    newSocket.on('gameError', (msg: string) => {
      set({ error: msg, isConnecting: false });
      get().leaveGame();
    });

    newSocket.on('gameJoined', ({ players, arenaSeed, roomCode, status }: { players: Record<string, PlayerData>, arenaSeed: number, roomCode: string, status: 'waiting' | 'playing' }) => {
      const otherPlayers = { ...players };
      delete otherPlayers[newSocket!.id!];
      
      const rng = mulberry32(arenaSeed + 1);
      const enemies: EnemyData[] = Array.from({ length: 8 }).map((_, i) => {
        let x, z;
        do {
          x = (rng() - 0.5) * 160;
          z = (rng() - 0.5) * 160;
        } while (Math.abs(x) < 20 && Math.abs(z) < 20);
        
        return {
          id: `bot-${i + 1}`,
          position: [x, 1, z],
          state: 'active',
          disabledUntil: 0,
          score: 0,
          health: 2
        };
      });

      const localPlayer = players[newSocket!.id!];

      set({ 
        otherPlayers,
        roomCode,
        gameMode: mode,
        isConnecting: false,
        gameState: status === 'waiting' ? 'waiting' : 'playing',
        timeLeft: 1200,
        score: 0,
        arenaSeed,
        enemies,
        lives: 3,
        ammo: { gun: 30, pistol: 20, knife: Infinity },
        role: localPlayer ? (localPlayer.role || 'crewmate') : 'crewmate',
        isAlive: localPlayer ? (localPlayer.isAlive ?? true) : true,
        votingPhase: false,
        tasks: [],
        chatHistory: [],
        isDoingTask: false,
        currentTaskId: null
      });

      if (status === 'playing') {
        set({
          timerInterval: setInterval(() => {
            if (get().gameMode === 'cpu') {
              get().updateTime(1);
            }
          }, 1000)
        });
      }
    });

    newSocket.on('roomUpdate', ({ players, status }: { players: Record<string, PlayerData>, status: 'waiting' | 'playing' }) => {
      const otherPlayers = { ...players };
      delete otherPlayers[newSocket!.id!];

      const localPlayer = players[newSocket!.id!];
      if (localPlayer) {
        set({
          isAlive: localPlayer.isAlive ?? get().isAlive,
          role: localPlayer.role ?? get().role
        });
      }

      set({ otherPlayers });
    });

    newSocket.on('gameStart', ({ roles, tasks }: { roles: Record<string, 'crewmate' | 'imposter'>, tasks: Array<{ id: string, x: number, z: number }> }) => {
      const myId = newSocket!.id!;
      const myRole = roles[myId] || 'crewmate';

      const otherPlayers = { ...get().otherPlayers };
      Object.keys(otherPlayers).forEach(id => {
        if (roles[id]) {
          otherPlayers[id].role = roles[id];
          otherPlayers[id].isAlive = true;
          otherPlayers[id].currentVote = null;
        }
      });

      set({ 
        gameState: 'playing',
        role: myRole,
        isAlive: true,
        votingPhase: false,
        tasks: tasks,
        otherPlayers,
        chatHistory: [],
        isDoingTask: false,
        currentTaskId: null,
        timerInterval: setInterval(() => {
          if (get().gameMode === 'cpu') {
            get().updateTime(1);
          }
        }, 1000)
      });
      sounds.playJoin();
    });

    newSocket.on('playerJoined', (player: PlayerData) => {
        sounds.playJoin();
        set(state => ({
          otherPlayers: { ...state.otherPlayers, [player.id]: player },
          events: [...state.events, { id: Math.random().toString(), message: `${player.name} joined`, timestamp: Date.now() }]
        }));
      });

      newSocket.on('playerMoved', (data: { id: string, position: [number, number, number], rotation: number }) => {
        set(state => {
          if (!state.otherPlayers[data.id]) return state;
          return {
            otherPlayers: {
              ...state.otherPlayers,
              [data.id]: {
                ...state.otherPlayers[data.id],
                position: data.position,
                rotation: data.rotation
              }
            }
          };
        });
      });

      newSocket.on('playerShot', (data: { id: string, start: [number, number, number], end: [number, number, number], color: string }) => {
        sounds.playLaser();
        set(state => ({
          lasers: [...state.lasers, { id: Math.random().toString(36).substr(2, 9), start: data.start, end: data.end, timestamp: Date.now(), color: data.color }],
          particles: [...state.particles, { id: Math.random().toString(36).substr(2, 9), position: data.end, timestamp: Date.now(), color: data.color }]
        }));
      });

      newSocket.on('playerHit', (data: { targetId: string, shooterId: string, targetDisabledUntil: number, shooterScore: number }) => {
        set(state => {
          const now = Date.now();
          const isLocalShooter = data.shooterId === newSocket!.id;
          const isLocalTarget = data.targetId === newSocket!.id;
          
          const shooterName = isLocalShooter ? 'You' : (state.otherPlayers[data.shooterId]?.name || 'Unknown');
          const targetName = isLocalTarget ? 'You' : (state.otherPlayers[data.targetId]?.name || 'Unknown');
          const eventMsg = `${shooterName} tagged ${targetName}`;
          const newEvent = { id: Math.random().toString(), message: eventMsg, timestamp: now };

          let newState: Partial<GameStore> = {
            events: [...state.events, newEvent]
          };

          if (isLocalTarget) {
            sounds.playPlayerDisabled();
            const newLives = state.lives - 1;
            
            if (newLives <= 0) {
              if (state.socket) state.socket.disconnect();
              return { 
                gameState: 'gameover', 
                lives: 0,
                events: [...state.events, { id: Math.random().toString(), message: 'GAME OVER - Out of lives!', timestamp: now }]
              };
            }

            newState.playerState = 'disabled';
            newState.playerDisabledUntil = data.targetDisabledUntil;
            newState.lives = newLives;
          } else {
            sounds.playHit();
          }

          if (isLocalShooter) {
            newState.score = data.shooterScore;
          }

          const players = { ...state.otherPlayers };
          let playersChanged = false;

          if (!isLocalTarget && players[data.targetId]) {
            players[data.targetId] = {
              ...players[data.targetId],
              state: 'disabled',
              disabledUntil: data.targetDisabledUntil
            };
            playersChanged = true;
          }

          if (!isLocalShooter && players[data.shooterId]) {
            players[data.shooterId] = {
              ...players[data.shooterId],
              score: data.shooterScore
            };
            playersChanged = true;
          }

          if (playersChanged) {
            newState.otherPlayers = players;
          }

          return newState;
        });
      });

      newSocket.on('playerLeft', (id: string) => {
        sounds.playLeave();
        set(state => {
          const players = { ...state.otherPlayers };
          const playerName = players[id]?.name || 'Unknown';
          delete players[id];
          return { 
            otherPlayers: players,
            events: [...state.events, { id: Math.random().toString(), message: `${playerName} left`, timestamp: Date.now() }]
          };
        });
      });

      newSocket.on('timerUpdate', ({ roomTimer, votingTimer, phase }: { roomTimer: number, votingTimer: number, phase: 'waiting' | 'playing' | 'voting' }) => {
        set({
          timeLeft: phase === 'voting' ? votingTimer : roomTimer,
          votingPhase: phase === 'voting'
        });
      });

      newSocket.on('triggerVotingPhase', ({ players, killedPlayerId }: { players: Record<string, PlayerData>, killedPlayerId: string }) => {
        const myId = newSocket!.id!;
        const localPlayer = players[myId];
        const otherPlayers = { ...players };
        delete otherPlayers[myId];

        set({
          votingPhase: true,
          otherPlayers,
          isAlive: localPlayer ? (localPlayer.isAlive ?? true) : true,
          chatHistory: [],
          isDoingTask: false,
          currentTaskId: null
        });

        sounds.playPlayerDisabled();
        get().addEvent(`ALERT: Voting Phase Triggered! ${players[killedPlayerId]?.name || 'Someone'} was murdered.`);
      });

      newSocket.on('tasksUpdate', (tasks: Array<{ id: string, x: number, z: number }>) => {
        set({ tasks });
      });

      newSocket.on('receiveChatMessage', (msg: { sender: string, message: string, timestamp: number }) => {
        set(state => ({
          chatHistory: [...state.chatHistory, msg]
        }));
      });

      newSocket.on('gameOver', (data: { result: 'imposter_wins' | 'crewmates_win', reason?: string, name?: string }) => {
        if (get().timerInterval) {
          clearInterval(get().timerInterval!);
        }
        set({
          gameState: 'gameover',
          votingPhase: false,
          timeLeft: 0,
          isDoingTask: false,
          currentTaskId: null,
          events: [...get().events, {
            id: Math.random().toString(),
            message: data.result === 'crewmates_win' ? `CREWMATES WIN! Imposter ${data.name || ''} was ejected.` : `IMPOSTER WINS!`,
            timestamp: Date.now()
          }]
        });
      });

    set({ socket: newSocket });
  },

  createRoom: () => get().startGame('room'),
  joinRoom: (code) => get().startGame('room', code),

  endGame: () => {
    const { socket, timerInterval } = get();
    if (socket) {
      socket.disconnect();
    }
    if (timerInterval) {
      clearInterval(timerInterval);
    }
    set({ gameState: 'gameover', socket: null, timerInterval: null, votingPhase: false, isDoingTask: false, currentTaskId: null });
  },

  leaveGame: () => {
    const { socket, timerInterval } = get();
    if (socket) {
      socket.disconnect();
    }
    if (timerInterval) {
      clearInterval(timerInterval);
    }
    set({
      gameState: 'menu',
      socket: null,
      timerInterval: null,
      isConnecting: false,
      otherPlayers: {},
      enemies: [],
      lasers: [],
      particles: [],
      events: [],
      coins: [],
      score: 0,
      timeLeft: 150,
      playerState: 'active',
      lives: 3,
      ammo: { gun: 30, pistol: 20, knife: Infinity },
      role: null,
      isAlive: true,
      votingPhase: false,
      tasks: [],
      chatHistory: [],
      isDoingTask: false,
      currentTaskId: null
    });
  },

  updateTime: (delta) => set((state) => {
    if (state.gameState !== 'playing') return state;
    if (state.gameMode !== 'cpu') return state; // Only tick locally if offline
    
    const newTime = state.timeLeft - delta;
    if (newTime <= 0) {
      const { socket, timerInterval } = get();
      if (socket) socket.disconnect();
      if (timerInterval) clearInterval(timerInterval);
      return { timeLeft: 0, gameState: 'gameover', socket: null, timerInterval: null };
    }
    return { timeLeft: newTime };
  }),

  hitPlayer: (botId) => set((state) => {
    if (state.playerState === 'disabled' || state.gameState !== 'playing') return state;
    sounds.playPlayerDisabled();
    
    const newLives = state.lives - 1;
    let newState: Partial<GameStore> = {};

    if (botId) {
      const enemyIndex = state.enemies.findIndex(e => e.id === botId);
      if (enemyIndex !== -1) {
        const newEnemies = [...state.enemies];
        newEnemies[enemyIndex] = {
          ...newEnemies[enemyIndex],
          score: (newEnemies[enemyIndex].score || 0) + 50
        };
        newState.enemies = newEnemies;
        newState.events = [...state.events, { id: Math.random().toString(), message: `Bot ${botId} scored +50!`, timestamp: Date.now() }];
      }
    }

    if (newLives <= 0) {
      if (state.socket) state.socket.disconnect();
      return { 
        ...newState,
        gameState: 'gameover',
        lives: 0,
        score: Math.max(0, state.score - 50)
      };
    }

    return {
      ...newState,
      playerState: 'disabled',
      playerDisabledUntil: Date.now() + 3000,
      score: Math.max(0, state.score - 50), // Penalty for getting hit
      lives: newLives
    };
  }),

  hitEnemy: (id, damage, byPlayer = false) => set((state) => {
    if (state.gameState !== 'playing') return state;
    
    // Check if it's a multiplayer player
    if (state.socket && state.otherPlayers[id]) {
      state.socket.emit('hitPlayer', id);
      return state;
    }

    let enemyKilled = false;
    let enemyPos: [number, number, number] | null = null;
    const enemies = state.enemies.map(e => {
      if (e.id === id && e.state === 'active') {
        sounds.playHit();
        const newHealth = e.health - damage;
        if (newHealth <= 0) {
          enemyKilled = true;
          enemyPos = e.position;
          return { ...e, health: 0, state: 'disabled' as EntityState, disabledUntil: Date.now() + 999999999 }; // Stay dead
        }
        return { ...e, health: newHealth };
      }
      return e;
    });

    if (!enemyKilled) return { enemies };

    const newCoins = [...state.coins];
    // Offset loot slightly so it's not instantly picked up by a nearby bot or the player
    const angle = Math.random() * Math.PI * 2;
    const distance = 1.5;
    const offsetX = Math.cos(angle) * distance;
    const offsetZ = Math.sin(angle) * distance;

    newCoins.push({
      id: `coin-loot-${Date.now()}-${Math.random()}`,
      position: [enemyPos![0] + offsetX, 1.2, enemyPos![2] + offsetZ],
      collected: false
    });

    return {
      enemies,
      coins: newCoins,
      events: [...state.events, { 
        id: Math.random().toString(), 
        message: byPlayer ? `Bot ${id} eliminated! Loot dropped.` : `Bot ${id} went down!`, 
        timestamp: Date.now() 
      }]
    };
  }),

  collectCoin: (id, collectorId) => set((state) => {
    const coin = state.coins.find(c => c.id === id);
    if (!coin || coin.collected) return state;

    if (collectorId && collectorId.startsWith('bot-')) {
      // Bot collection
      const enemyIndex = state.enemies.findIndex(e => e.id === collectorId);
      if (enemyIndex === -1) return state;

      // Only active bots can collect coins
      if (state.enemies[enemyIndex].state !== 'active') return state;

      const newEnemies = [...state.enemies];
      newEnemies[enemyIndex] = {
        ...newEnemies[enemyIndex],
        score: (newEnemies[enemyIndex].score || 0) + 100
      };

      return {
        enemies: newEnemies,
        coins: state.coins.filter(c => c.id !== id),
        events: [...state.events, { id: Math.random().toString(), message: `Bot ${collectorId} collected +100 SCORE`, timestamp: Date.now() }]
      };
    }

    sounds.playCollect();
    return {
      score: state.score + 100,
      coins: state.coins.filter(c => c.id !== id),
      events: [...state.events, { id: Math.random().toString(), message: '+100 SCORE', timestamp: Date.now() }]
    };
  }),

  addLaser: (start, end, color) => {
    const { socket } = get();
    sounds.playLaser();
    if (socket) {
      socket.emit('shoot', { start, end, color });
    }
    set((state) => ({
      lasers: [...state.lasers, { id: Math.random().toString(36).substr(2, 9), start, end, timestamp: Date.now(), color }]
    }));
  },

  addParticles: (position, color) => set((state) => ({
    particles: [...state.particles, { id: Math.random().toString(36).substr(2, 9), position, timestamp: Date.now(), color }]
  })),

  addEvent: (message) => set((state) => ({
    events: [...state.events, { id: Math.random().toString(), message, timestamp: Date.now() }]
  })),

  updateEnemies: (time) => set((state) => {
    // Enemies (Bots) no longer re-activate once disabled (killed)
    // "once a bot player get killed they cant get alive again"
    const enemies = state.enemies;
    
    // Update other players' states
    let otherPlayers = state.otherPlayers;
    let playersChanged = false;
    Object.values(state.otherPlayers).forEach(p => {
      if (p.state === 'disabled' && time > p.disabledUntil) {
        if (!playersChanged) {
          otherPlayers = { ...state.otherPlayers };
          playersChanged = true;
        }
        otherPlayers[p.id] = { ...p, state: 'active' };
      }
    });

    if (state.playerState === 'disabled' && time > state.playerDisabledUntil) {
      return { enemies, playerState: 'active', otherPlayers: playersChanged ? otherPlayers : state.otherPlayers };
    }
    return playersChanged ? { enemies, otherPlayers } : state;
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
    
    return { 
      currentWeapon: nextWeapon,
      events: [...state.events, { id: Math.random().toString(), message: `Equipped: ${nextWeapon.toUpperCase()} (${state.ammo[nextWeapon] === Infinity ? '∞' : state.ammo[nextWeapon]})`, timestamp: Date.now() }]
    };
  }),

  useAmmo: (weapon) => {
    const state = get();
    if (state.ammo[weapon] <= 0) return false;
    
    if (state.ammo[weapon] !== Infinity) {
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
  }
}));
