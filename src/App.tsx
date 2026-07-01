/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/

import { useEffect, useState, useMemo, useRef } from 'react';
import { Game } from './components/Game';
import { MobileControls } from './components/MobileControls';
import { Minimap } from './components/Minimap';
import { useGameStore } from './store';
import { sounds } from './lib/sounds';
import { Heart, ArrowLeft, Copy } from 'lucide-react';
import { LEVELS } from './constants';

function HUD() {
  const gameState = useGameStore(state => state.gameState);
  const score = useGameStore(state => state.score);
  const timeLeft = useGameStore(state => state.timeLeft);
  const playerState = useGameStore(state => state.playerState);
  const lives = useGameStore(state => state.lives);
  const otherPlayers = useGameStore(state => state.otherPlayers);
  const events = useGameStore(state => state.events);
  const currentWeapon = useGameStore(state => state.currentWeapon);
  const ammo = useGameStore(state => state.ammo);
  const playerCount = Object.keys(otherPlayers).length + 1;
  const leaveGame = useGameStore(state => state.leaveGame);
  const isMobile = useIsMobile();
  const playerColor = useGameStore(state => state.playerColor) || '#39ff14';
  const playerRotation = useGameStore(state => state.playerRotation) || 0;

  const enemies = useGameStore(state => state.enemies);

  const leaderboard = useMemo(() => {
    const players = [];

    // Add local player if active
    if (playerState === 'active') {
      players.push({ id: 'You', score: score, isMe: true });
    }

    // Add other players if active
    Object.values(otherPlayers).forEach(p => {
      if (p.state === 'active') {
        players.push({
          id: p.name,
          score: p.score,
          isMe: false
        });
      }
    });

    // Add enemies (bots) if active
    enemies.forEach(e => {
      if (e.state === 'active') {
        players.push({
          id: e.id,
          score: e.score,
          isMe: false
        });
      }
    });

    // Sort by score descending and take top 4
    return players.sort((a, b) => b.score - a.score).slice(0, 4);
  }, [score, playerState, otherPlayers, enemies]);

  const heading = Math.round(((playerRotation * 180 / Math.PI) % 360 + 360) % 360);
  const compassDirections = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
  const directionName = compassDirections[Math.round(heading / 45) % 8];

  return (
    <>
      {/* Curved Helmet Visor Frame */}
      <div 
        className="absolute inset-0 pointer-events-none z-[30] transition-all duration-500"
        style={{
          boxShadow: `inset 0 0 120px rgba(0,0,0,0.85), inset 0 0 30px ${playerColor}15`,
          border: `1px solid ${playerColor}08`
        }}
      />

      {/* Cyber Visor Corner Brackets */}
      {/* Top Left Bracket */}
      <div 
        className="absolute top-4 left-4 pointer-events-none flex flex-col gap-1 transition-all duration-300 font-mono text-[9px] font-black z-45"
        style={{ color: playerColor }}
      >
        <div className="flex gap-1.5 items-center">
          <div className="w-1.5 h-1.5 rounded-full bg-current animate-pulse" />
          <span>HUD LINK: ACTIVE</span>
        </div>
        <div className="opacity-40">SYS_V: 1.0.4</div>
        <div className="opacity-40">GRID: SYNCED</div>
        <div className="w-8 h-8 border-t border-l border-current absolute -top-1 -left-1 opacity-70" />
      </div>

      {/* Top Right Bracket */}
      <div 
        className="absolute top-4 right-4 pointer-events-none flex flex-col items-end gap-1 transition-all duration-300 font-mono text-[9px] font-black z-45"
        style={{ color: playerColor }}
      >
        <div>FCS TYPE: AM-08</div>
        <div className="opacity-40">LOCK RANGE: 45M</div>
        <div className="opacity-40">PWR: 100%</div>
        <div className="w-8 h-8 border-t border-r border-current absolute -top-1 -right-1 opacity-70" />
      </div>

      {/* Top Center Compass HUD */}
      <div 
        className="absolute top-4 left-1/2 -translate-x-1/2 flex flex-col items-center pointer-events-none transition-all duration-300 z-45"
        style={{ color: playerColor }}
      >
        <div className="text-[9px] font-black uppercase tracking-[0.2em] opacity-80 mb-1">
          Tactical Heading
        </div>
        <div className="flex items-center gap-3 bg-black/60 border border-current/30 px-4 py-1 rounded-lg shadow-[0_0_15px_rgba(0,0,0,0.5)] backdrop-blur-sm">
          <span className="font-black text-xs tracking-widest">{directionName}</span>
          <span className="w-px h-3 bg-current/30" />
          <span className="font-black text-sm w-9 text-center tabular-nums">{heading}°</span>
        </div>
        <div className="w-48 h-5 border-b border-current/20 mt-1 relative overflow-hidden flex items-end">
          <div 
            className="flex gap-4 absolute bottom-0 left-1/2 h-3 transition-transform duration-75 ease-out"
            style={{ 
              transform: `translateX(calc(-50% - ${playerRotation * 180}px))` 
            }}
          >
            {Array.from({ length: 36 }).map((_, idx) => {
              const deg = idx * 10;
              let label = `${deg}`;
              if (deg === 0 || deg === 360) label = 'N';
              else if (deg === 90) label = 'E';
              else if (deg === 180) label = 'S';
              else if (deg === 270) label = 'W';
              
              const isMajor = deg % 30 === 0;
              return (
                <div key={idx} className="flex flex-col items-center w-8 shrink-0">
                  <span className="text-[6px] font-black tracking-tighter opacity-80">{label}</span>
                  <div className={`w-0.5 bg-current ${isMajor ? 'h-1.5' : 'h-0.5'} mt-0.5 opacity-60`} />
                </div>
              );
            })}
          </div>
          <div className="absolute left-1/2 -translate-x-1/2 bottom-0 w-0.5 h-2 bg-current shadow-[0_0_5px_currentColor]" />
        </div>
      </div>

      {/* Crosshair */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 pointer-events-none flex flex-col items-center z-45">
        <div className="relative">
          <div 
            className="w-5 h-5 border-2 rounded-full transition-all duration-300" 
            style={{ borderColor: playerState === 'disabled' ? '#ef4444' : playerColor }}
          />
          <div 
            className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-1.5 h-1.5 rounded-full transition-all duration-300" 
            style={{ backgroundColor: playerState === 'disabled' ? '#ef4444' : playerColor }}
          />
        </div>
      </div>

      {/* HUD Left - Score & Leaderboard */}
      <div className="absolute top-2 left-2 md:top-4 md:left-4 flex flex-col gap-2 md:gap-4 pointer-events-none z-45">
        <div 
          className="text-lg md:text-2xl font-black italic uppercase tracking-wider" 
          style={{ color: playerColor, filter: `drop-shadow(0 0 6px ${playerColor}cc)` }}
        >
          SCORE: {score.toString().padStart(4, '0')}
        </div>

        <div 
          className="bg-black/60 border p-2 md:p-3 rounded-lg flex flex-col gap-1 md:gap-2 shadow-[0_0_15px_rgba(0,0,0,0.5)] backdrop-blur-sm"
          style={{ borderColor: `${playerColor}30` }}
        >
          <div 
            className="text-[10px] md:text-xs font-black uppercase tracking-[0.2em]"
            style={{ color: `${playerColor}90` }}
          >
            Weapon Systems
          </div>
          <div className="flex items-end justify-between gap-4">
            <div 
              className="text-base md:text-xl font-black uppercase tracking-tighter"
              style={{ color: playerColor }}
            >
              {currentWeapon}
            </div>
            <div 
              className="text-xl md:text-3xl font-black transition-all"
              style={{ color: ammo[currentWeapon] < 5 ? '#ef4444' : playerColor }}
            >
              {ammo[currentWeapon] === Infinity ? '∞' : ammo[currentWeapon].toString().padStart(2, '0')}
            </div>
          </div>
          {ammo[currentWeapon] !== Infinity && (
            <div className="w-full bg-black/80 h-1 rounded-full overflow-hidden">
              <div 
                className="h-full transition-all duration-300"
                style={{ 
                  backgroundColor: ammo[currentWeapon] < 5 ? '#ef4444' : playerColor,
                  width: `${(ammo[currentWeapon] / (currentWeapon === 'gun' ? 30 : 20)) * 100}%` 
                }}
              />
            </div>
          )}
        </div>

        <div className="flex gap-1 md:gap-2 mt-1">
          {Array.from({ length: 3 }).map((_, i) => (
            <Heart
              key={i}
              size={isMobile ? 16 : 24}
              fill={i < lives ? playerColor : "transparent"}
              color={i < lives ? playerColor : "#333"}
              className="transition-all duration-300"
              style={{ filter: i < lives ? `drop-shadow(0 0 5px ${playerColor}cc)` : 'none' }}
            />
          ))}
        </div>
        
        {/* Leaderboard */}
        {!isMobile && (
          <div 
            className="bg-black/60 border p-3 rounded w-48 flex flex-col gap-1 shadow-[0_0_15px_rgba(0,0,0,0.5)] backdrop-blur-sm"
            style={{ borderColor: `${playerColor}20` }}
          >
            <div 
              className="text-xs font-black tracking-widest mb-1 border-b pb-1"
              style={{ color: playerColor, borderColor: `${playerColor}20` }}
            >
              LEADERBOARD
            </div>
            {leaderboard.map((p, i) => (
              <div 
                key={p.id} 
                className={`flex justify-between text-xs font-bold ${p.isMe ? 'opacity-100' : 'opacity-60'}`}
                style={{ color: playerColor }}
              >
                <span>{i + 1}. {p.id}</span>
                <span>{p.score}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Minimap - Bottom Left */}
      <div className="absolute bottom-4 left-4 md:bottom-8 md:left-8 pointer-events-none z-45">
        <Minimap />
      </div>
      
      {/* HUD Right - Time, Leave, Events */}
      <div className="absolute top-2 right-2 md:top-4 md:right-4 flex flex-col items-end gap-1 md:gap-2 pointer-events-none z-45">
        {gameState === 'playing' && (
          <div 
            className="text-lg md:text-2xl font-black italic uppercase tracking-wider"
            style={{ color: playerColor, filter: `drop-shadow(0 0 6px ${playerColor}cc)` }}
          >
            TIME: {Math.floor(timeLeft / 60)}:{(Math.floor(timeLeft) % 60).toString().padStart(2, '0')}
          </div>
        )}
        <button
          onClick={leaveGame}
          className="px-2 py-1 md:px-4 md:py-2 bg-red-500/20 border border-red-500 text-red-500 text-xs md:text-sm font-bold rounded hover:bg-red-500 hover:text-black transition-all duration-200 pointer-events-auto"
        >
          LEAVE
        </button>
        {!isMobile && (
          <div 
            className="text-[10px] mt-1 uppercase tracking-widest font-black"
            style={{ color: playerColor, opacity: 0.5 }}
          >
            ESC to unlock cursor
          </div>
        )}

        {/* Event Log */}
        <div className="mt-2 md:mt-4 flex flex-col items-end gap-1 pointer-events-none">
          {events.slice(-3).map(event => (
            <div 
              key={event.id} 
              className="text-[10px] md:text-xs font-black bg-black/60 px-2 py-1 rounded border animate-pulse"
              style={{ color: playerColor, borderColor: `${playerColor}30` }}
            >
              {event.message}
            </div>
          ))}
        </div>
      </div>

      {/* Multiplayer Info */}
      <div className="absolute top-12 left-1/2 -translate-x-1/2 flex flex-col items-center pointer-events-none z-45">
        <div 
          className="text-[10px] md:text-xs font-black tracking-widest uppercase"
          style={{ color: playerColor, filter: `drop-shadow(0 0 4px ${playerColor}aa)`, opacity: 0.7 }}
        >
          PLAYERS ONLINE: {playerCount}
        </div>
      </div>

      {/* Damage Overlay */}
      {playerState === 'disabled' && (
        <div className="absolute inset-0 bg-red-950/40 pointer-events-none flex items-center justify-center z-50">
          <div className="text-red-500 text-4xl md:text-6xl font-black tracking-widest drop-shadow-[0_0_20px_rgba(239,68,68,1)] animate-pulse text-center uppercase italic">
            SYSTEM DISABLED
          </div>
        </div>
      )}

      {/* Mobile Controls */}
      {isMobile && gameState === 'playing' && <MobileControls />}
    </>
  );
}

function useIsMobile() {
  const [isMobile, setIsMobile] = useState(() => {
    if (typeof window === 'undefined') return false;
    const uaMatch = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
    const coarsePointer = window.matchMedia('(pointer: coarse)').matches;
    return uaMatch || coarsePointer || window.innerWidth < 768;
  });

  useEffect(() => {
    const check = () => {
      const uaMatch = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
      const coarsePointer = window.matchMedia('(pointer: coarse)').matches;
      setIsMobile(uaMatch || coarsePointer || window.innerWidth < 768);
    };
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);

  return isMobile;
}

function copyToClipboard(text: string) {
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(text).catch(() => {
      fallbackCopy(text);
    });
  } else {
    fallbackCopy(text);
  }
}

function fallbackCopy(text: string) {
  const textArea = document.createElement("textarea");
  textArea.value = text;
  textArea.style.top = "0";
  textArea.style.left = "0";
  textArea.style.position = "fixed";
  textArea.style.opacity = "0";
  document.body.appendChild(textArea);
  textArea.focus();
  textArea.select();
  try {
    document.execCommand('copy');
  } catch (err) {
    console.error('Fallback copy failed', err);
  }
  document.body.removeChild(textArea);
}

export default function App() {
  const gameState = useGameStore(state => state.gameState);
  const gameMode = useGameStore(state => state.gameMode);
  const roomCode = useGameStore(state => state.roomCode);
  const score = useGameStore(state => state.score);
  const lives = useGameStore(state => state.lives);
  const otherPlayers = useGameStore(state => state.otherPlayers);
  const error = useGameStore(state => state.error);
  const isConnecting = useGameStore(state => state.isConnecting);
  const startGame = useGameStore(state => state.startGame);
  const isCursorLocked = useGameStore(state => state.isCursorLocked);
  const currentLevel = useGameStore(state => state.currentLevel);
  
  const currentPlayerCount = Object.keys(otherPlayers).length + 1;

  const isMobile = useIsMobile();
  const lastUnlockTime = useRef(0);
  const [lockCooldown, setLockCooldown] = useState(false);
  const [menuView, setMenuView] = useState<'main' | 'join'>('main');
  const [joinInput, setJoinInput] = useState('');

  useEffect(() => {
    const handlePointerLockChange = () => {
      if (!document.pointerLockElement) {
        lastUnlockTime.current = Date.now();
        setLockCooldown(true);
        // Browser cooldown is typically 1.25s to 1.5s
        setTimeout(() => setLockCooldown(false), 1300);
      } else {
        setLockCooldown(false);
      }
    };
    document.addEventListener('pointerlockchange', handlePointerLockChange);
    return () => document.removeEventListener('pointerlockchange', handlePointerLockChange);
  }, []);

  const safeRequestPointerLock = (element: Element | null) => {
    if (!element || lockCooldown) return;
    
    const now = Date.now();
    if (now - lastUnlockTime.current < 1300) {
      return;
    }

    try {
      // Use a small timeout to ensure the event loop has finished processing the current click
      // before attempting the lock, which can sometimes help with browser timing issues.
      setTimeout(() => {
        if (!document.pointerLockElement) {
          element.requestPointerLock();
        }
      }, 10);
    } catch (e) {
      console.error('Pointer lock request failed:', e);
    }
  };

  return (
    <div 
      className="w-screen h-screen bg-black relative overflow-hidden font-mono select-none"
      onMouseDown={() => {
        sounds.resume();
      }}
    >
      {/* 3D Canvas */}
      <div className="absolute inset-0">
        <Game />
      </div>

      {/* UI Overlay */}
      <div className="absolute inset-0 pointer-events-none z-[100]">
        {gameState === 'playing' && <HUD />}
      </div>

      {/* Room Code Display in HUD */}
      {gameState === 'playing' && roomCode && (
        <div className="absolute bottom-4 right-4 flex flex-col items-end gap-1 pointer-events-auto">
          <div className="text-[10px] text-lime-400/50 uppercase font-black tracking-widest">Room Code</div>
          <div 
            onClick={() => {
              copyToClipboard(roomCode);
              alert(`Room Code ${roomCode} copied to clipboard!`);
            }}
            className="px-3 py-1 bg-lime-400/10 border border-lime-400/30 text-lime-400 font-black text-sm rounded cursor-pointer hover:bg-lime-400/20 transition-all active:scale-95"
          >
            {roomCode}
          </div>
        </div>
      )}

      {/* Click to Resume Overlay */}
      {gameState === 'playing' && !isCursorLocked && !isMobile && (
        <div 
          className={`absolute inset-0 bg-black/60 backdrop-blur-sm flex flex-col items-center justify-center z-[50] cursor-pointer pointer-events-auto transition-all ${lockCooldown ? 'opacity-50 grayscale' : 'active:bg-black/40'}`}
          onMouseDown={() => {
            if (!lockCooldown) {
              safeRequestPointerLock(document.querySelector('canvas'));
            }
          }}
        >
          <div className="bg-lime-500/10 border-2 border-lime-400 p-10 rounded-xl flex flex-col items-center gap-6 shadow-[0_0_50px_rgba(163,230,53,0.4)] animate-in fade-in zoom-in duration-300">
            <h2 className="text-5xl font-black text-lime-400 drop-shadow-[0_0_15px_rgba(163,230,53,0.9)] tracking-tighter">
              {lockCooldown ? 'RE-SYNC COOLDOWN' : 'LINK SUSPENDED'}
            </h2>
            <p className="text-lime-400/90 font-bold tracking-[0.2em] text-xl animate-pulse">
              {lockCooldown ? 'PLEASE WAIT...' : 'CLICK TO RE-SYNC HUD'}
            </p>
            
            <div className="flex gap-8 mt-4">
              <div className="flex flex-col items-center gap-2">
                <div className="w-14 h-14 border-2 border-lime-400/40 rounded-lg flex items-center justify-center text-lime-400/70 font-black text-xl">W</div>
                <span className="text-xs text-lime-400/50 uppercase font-bold">Thrust</span>
              </div>
              <div className="flex flex-col items-center gap-2">
                <div className="w-14 h-14 border-2 border-lime-400/40 rounded-lg flex items-center justify-center text-lime-400/70 font-black text-xl">M1</div>
                <span className="text-xs text-lime-400/50 uppercase font-bold">Fire</span>
              </div>
              <div className="flex flex-col items-center gap-2">
                <div className="w-14 h-14 border-2 border-lime-400/40 rounded-lg flex items-center justify-center text-lime-400/70 font-black text-xl">SPACE</div>
                <span className="text-xs text-lime-400/50 uppercase font-bold">Jump</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Waiting / Lobby UI */}
      {gameState === 'waiting' && (
        <div className="absolute inset-0 bg-black/95 overflow-y-auto z-[140] pointer-events-auto backdrop-blur-xl transition-all duration-500 custom-scrollbar">
          <div className="relative min-h-full w-full flex flex-col items-center justify-center py-12 px-6 gap-8">
            {/* Global Back Arrow */}
            <button 
              onClick={() => useGameStore.getState().leaveGame()}
              className="absolute top-8 left-8 flex items-center gap-2 text-lime-400/60 hover:text-lime-400 transition-colors group z-[150]"
            >
              <div className="p-2 border border-lime-400/20 rounded-lg group-hover:bg-lime-400/10 transition-all">
                <ArrowLeft size={24} />
              </div>
              <span className="font-black uppercase text-xs tracking-widest hidden md:block">Return to Base</span>
            </button>

            <div className="flex flex-col items-center gap-8 max-w-xl w-full">
            <div className="relative text-center">
              <h2 className="text-5xl md:text-7xl font-black text-lime-400 tracking-tighter uppercase italic animate-pulse">
                Establishing Link
              </h2>
              <div className="bg-red-500 text-white text-[10px] font-black px-3 py-1 uppercase tracking-widest mt-2 inline-block">
                Awaiting Pilots
              </div>
            </div>

            <div className="w-full bg-[#050a05] border-2 border-lime-400/20 p-8 rounded-2xl flex flex-col gap-8 shadow-[0_0_50px_rgba(163,230,53,0.15)] relative overflow-hidden">
              {/* Scanline Effect */}
              <div className="absolute inset-0 pointer-events-none bg-[linear-gradient(rgba(163,230,53,0.03)_50%,transparent_50%)] bg-[length:100%_4px] opacity-50" />
              
              <div className="flex justify-between items-end border-b border-lime-400/10 pb-6 relative z-10">
                <div className="flex flex-col gap-1">
                  <span className="text-lime-400/40 font-black uppercase text-[10px] tracking-widest">Active Sector</span>
                  <span className="text-lime-400 font-black text-2xl tracking-[0.1em]">{roomCode}</span>
                </div>
                <div className="flex flex-col items-end gap-1">
                  <span className="text-lime-400/40 font-black uppercase text-[10px] tracking-widest">Protocol</span>
                  <span className="text-lime-400 font-black uppercase text-sm bg-lime-400/10 px-3 py-1 border border-lime-400/20 rounded">
                    {gameMode === 'online' ? 'Global Ops' : 'Private Squad'}
                  </span>
                </div>
              </div>

              {/* Status Header */}
              <div className="flex items-center justify-between relative z-10">
                <div className="flex items-center gap-4">
                  <div className="flex gap-1.5">
                    {Array.from({ length: 3 }).map((_, i) => (
                      <div 
                        key={i} 
                        className={`w-4 h-4 rounded-full border-2 border-lime-400/30 ${i < currentPlayerCount ? 'bg-lime-400 shadow-[0_0_15px_rgba(163,230,53,0.8)]' : 'bg-transparent animate-pulse'}`}
                      />
                    ))}
                  </div>
                  <span className="text-lime-400/60 font-black uppercase text-xs tracking-[0.2em]">Synchronization Status</span>
                </div>
                <div className="text-lime-400 font-black text-3xl tabular-nums tracking-tighter">
                  {currentPlayerCount}<span className="text-lime-400/30 text-xl mx-1">/</span>3
                </div>
              </div>

              {/* Player List */}
              <div className="bg-black/50 border border-lime-400/10 rounded-xl p-4 flex flex-col gap-3 relative z-10 max-h-[200px] overflow-y-auto custom-scrollbar">
                <div className="text-[10px] text-lime-400/40 font-black uppercase tracking-widest mb-1 border-b border-lime-400/5 pb-2 flex justify-between">
                  <span>Pillots In Area</span>
                  <span>System Status</span>
                </div>
                
                <div className="flex items-center justify-between group">
                  <div className="flex items-center gap-3">
                    <div className="w-2 h-2 rounded-full bg-lime-400 shadow-[0_0_8px_rgba(163,230,53,0.8)]" />
                    <span className="text-white font-black text-sm uppercase">You (Pilot 0)</span>
                  </div>
                  <span className="text-lime-400/80 text-[10px] font-black uppercase px-2 py-0.5 bg-lime-400/10 border border-lime-400/20 rounded">Ready</span>
                </div>

                {Object.values(otherPlayers).map((player, idx) => (
                  <div key={player.id} className="flex items-center justify-between animate-in fade-in slide-in-from-left-4 duration-300">
                    <div className="flex items-center gap-3">
                      <div className="w-2 h-2 rounded-full bg-[#39ff14]" />
                      <span className="text-white/80 font-black text-sm uppercase">{player.name || `Pilot ${idx + 1}`}</span>
                    </div>
                    <span className="text-lime-400/80 text-[10px] font-black uppercase px-2 py-0.5 bg-lime-400/10 border border-lime-400/20 rounded">Synced</span>
                  </div>
                ))}

                {currentPlayerCount < 3 && (
                  <div className="flex items-center gap-3 opacity-30 animate-pulse">
                    <div className="w-2 h-2 rounded-full bg-gray-600" />
                    <span className="text-gray-400 font-black text-sm uppercase italic">Searching for reinforcements...</span>
                  </div>
                )}
              </div>

              {/* Room Code Share Section */}
              <div className="flex flex-col gap-3 relative z-10">
                <span className="text-[10px] text-lime-400/40 font-black uppercase tracking-[0.3em] text-center">Broadcast Lobby Frequency</span>
                <div className="flex gap-2">
                  <div className="flex-1 bg-black border-2 border-lime-400/30 px-6 py-3 text-3xl font-black text-lime-400 text-center tracking-[0.3em] rounded-xl flex items-center justify-center">
                    {roomCode}
                  </div>
                  <button 
                    onClick={() => {
                      if (roomCode) {
                        copyToClipboard(roomCode);
                        sounds.playCollect();
                      }
                    }}
                    className="aspect-square bg-lime-400 text-black flex items-center justify-center px-5 rounded-xl hover:bg-white hover:scale-105 transition-all active:scale-95 shadow-[0_0_20px_rgba(163,230,53,0.3)]"
                    title="Copy Frequency"
                  >
                    <Copy size={24} strokeWidth={3} />
                  </button>
                </div>
              </div>

              {/* Progress Bar */}
              <div className="relative h-1.5 w-full bg-lime-900/20 rounded-full overflow-hidden mt-2">
                <div 
                  className="absolute inset-y-0 left-0 bg-lime-400 transition-all duration-1000 ease-out shadow-[0_0_15px_rgba(163,230,53,0.8)]" 
                  style={{ width: `${Math.min(100, (currentPlayerCount / 3) * 100)}%` }}
                />
              </div>
            </div>

            <p className="text-lime-400/40 text-[10px] text-center font-bold uppercase tracking-[0.2em] animate-pulse">
              [ WARNING ]: Combat engagement authorized upon full sync
            </p>
          </div>
        </div>
      </div>
    )}

      {/* Connecting / Loading Overlay */}
      {isConnecting && (
        <div className="absolute inset-0 bg-black/90 z-[160] flex flex-col items-center justify-center backdrop-blur-2xl animate-in fade-in duration-300">
          <div className="relative mb-8">
            <div className="w-24 h-24 border-4 border-lime-400/20 border-t-lime-400 rounded-full animate-spin shadow-[0_0_30px_rgba(163,230,53,0.2)]" />
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="w-12 h-12 border-4 border-lime-500/20 border-b-lime-400 rounded-full animate-spin-slow" />
            </div>
          </div>
          <h3 className="text-lime-400 font-black text-2xl tracking-[0.3em] uppercase italic animate-pulse">Connecting to Server</h3>
          <p className="text-lime-400/40 text-xs font-bold uppercase tracking-widest mt-4">Establishing encrypted link . . .</p>
        </div>
      )}

      {/* Menus */}
      {gameState === 'menu' && (
        <div className="absolute inset-0 bg-black/90 overflow-y-auto z-[150] pointer-events-auto backdrop-blur-md text-center custom-scrollbar">
          <div className="min-h-full w-full flex flex-col items-center justify-center py-12 px-6">
            <div className="relative mb-12">
            <h1 className="text-6xl md:text-8xl font-black text-lime-400 drop-shadow-[0_0_30px_rgba(163,230,53,0.6)] tracking-tighter uppercase italic">
              imposterfrnd
            </h1>
            <div className="absolute -bottom-2 right-0 bg-lime-400 text-black px-2 py-0.5 text-[10px] font-black tracking-widest uppercase">
              Production V1.0
            </div>
          </div>

          {error && (
            <div className="mb-8 px-6 py-3 bg-red-500/10 border-l-4 border-red-500 text-red-500 font-bold text-sm animate-in fade-in slide-in-from-top-4 duration-300">
              [ ERROR ]: {error}
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 w-full max-w-xl px-6">
            {menuView === 'main' ? (
              <>
                <button
                  onMouseDown={() => {
                    startGame('online');
                    safeRequestPointerLock(document.querySelector('canvas'));
                  }}
                  className="flex flex-col items-center justify-center p-6 bg-lime-500/10 border-2 border-lime-400 text-lime-400 rounded hover:bg-lime-400 hover:text-black transition-all group shadow-[0_0_20px_rgba(163,230,53,0.2)]"
                >
                  <span className="text-2xl font-black uppercase tracking-tighter">Play Online</span>
                  <span className="text-[10px] opacity-60 uppercase font-black mt-1 group-hover:text-black/60">Matchmaking (8P)</span>
                </button>

                <button
                  onMouseDown={() => {
                    startGame('cpu');
                    safeRequestPointerLock(document.querySelector('canvas'));
                  }}
                  className="flex flex-col items-center justify-center p-6 bg-blue-500/10 border-2 border-blue-400 text-blue-400 rounded hover:bg-blue-400 hover:text-black transition-all group"
                >
                  <span className="text-2xl font-black uppercase tracking-tighter">Play with CPU</span>
                  <span className="text-[10px] opacity-60 uppercase font-black mt-1 group-hover:text-black/60">Solo Practice</span>
                </button>

                <button
                  onMouseDown={() => {
                    startGame('room');
                    safeRequestPointerLock(document.querySelector('canvas'));
                  }}
                  className="flex flex-col items-center justify-center p-6 bg-fuchsia-500/10 border-2 border-fuchsia-400 text-fuchsia-400 rounded hover:bg-fuchsia-400 hover:text-black transition-all group"
                >
                  <span className="text-2xl font-black uppercase tracking-tighter">Create Room</span>
                  <span className="text-[10px] opacity-60 uppercase font-black mt-1 group-hover:text-black/60">Private Lobby</span>
                </button>

                <button
                  onMouseDown={() => setMenuView('join')}
                  className="flex flex-col items-center justify-center p-6 bg-yellow-500/10 border-2 border-yellow-400 text-yellow-400 rounded hover:bg-yellow-400 hover:text-black transition-all group"
                >
                  <span className="text-2xl font-black uppercase tracking-tighter">Join Code</span>
                  <span className="text-[10px] opacity-60 uppercase font-black mt-1 group-hover:text-black/60">Enter room ID</span>
                </button>
              </>
            ) : (
              <div className="col-span-full bg-black/60 border-2 border-yellow-400/30 p-8 rounded-xl flex flex-col items-center gap-6 animate-in fade-in slide-in-from-bottom-4 duration-300 relative">
                {/* Back Arrow for Join Scene */}
                <button 
                  onClick={() => setMenuView('main')}
                  className="absolute top-4 left-4 p-2 text-yellow-400/50 hover:text-yellow-400 hover:bg-yellow-400/10 rounded-lg transition-all"
                >
                  <ArrowLeft size={20} />
                </button>

                <h3 className="text-2xl font-black text-yellow-400 uppercase tracking-widest italic">Join Private Room</h3>
                <input 
                  autoFocus
                  type="text" 
                  value={joinInput}
                  onChange={(e) => setJoinInput(e.target.value.toUpperCase())}
                  placeholder="ENTER 6-CHAR CODE"
                  className="bg-black border-2 border-yellow-400/50 px-6 py-4 text-3xl font-black text-yellow-400 text-center tracking-[0.5em] focus:border-yellow-400 outline-none w-full"
                  maxLength={6}
                />
                <div className="flex gap-4 w-full">
                  <button
                    onClick={() => {
                      if (joinInput.length === 6) {
                        setMenuView('main');
                        startGame('room', joinInput);
                        safeRequestPointerLock(document.querySelector('canvas'));
                      }
                    }}
                    disabled={joinInput.length !== 6}
                    className="w-full px-8 py-3 bg-yellow-400 text-black font-black uppercase tracking-widest hover:scale-105 active:scale-95 transition-all disabled:opacity-30 disabled:grayscale"
                  >
                    ENGAGE LINK
                  </button>
                </div>
              </div>
            )}
          </div>

          <div className="mt-16 text-lime-400/40 text-[10px] font-black uppercase tracking-[0.4em] animate-pulse">
            Terminal Ready . . . Waiting for pilot input
          </div>
        </div>
      </div>
    )}

      {gameState === 'gameover' && (
        <div className="absolute inset-0 bg-black/90 flex flex-col items-center justify-center z-[200] pointer-events-auto backdrop-blur-xl text-center">
          <h1 className="text-8xl font-black text-red-500 mb-4 drop-shadow-[0_0_30px_rgba(239,68,68,0.8)] tracking-tighter italic uppercase underline decoration-4 underline-offset-8">
            {lives <= 0 ? 'TERMINATED' : 'LINK SEVERED'}
          </h1>
          <div className="text-4xl text-lime-400 mb-12 font-black tracking-tighter">
            COMBAT SCORE: {score}
          </div>
          <button
            onMouseDown={() => {
              useGameStore.getState().leaveGame();
              setMenuView('main');
            }}
            className="px-12 py-5 bg-lime-500/10 border-2 border-lime-400 text-lime-400 text-2xl font-black rounded hover:bg-lime-400 hover:text-black transition-all duration-300 shadow-[0_0_30px_rgba(163,230,53,0.3)] uppercase tracking-widest"
          >
            System Reboot
          </button>
        </div>
      )}

      {gameState === 'victory' && (
        <div className="absolute inset-0 bg-black/90 flex flex-col items-center justify-center z-[200] pointer-events-auto backdrop-blur-xl text-center animate-in fade-in duration-500">
          <div className="absolute w-[450px] h-[450px] bg-lime-500/15 rounded-full blur-[100px] pointer-events-none z-0 animate-pulse" />
          
          <h1 className="text-6xl md:text-8xl font-black text-lime-400 mb-4 drop-shadow-[0_0_40px_rgba(163,230,53,0.9)] tracking-tighter italic uppercase underline decoration-4 underline-offset-8 z-10 animate-bounce">
            {currentLevel < LEVELS.length ? `LEVEL ${currentLevel} COMPLETED` : 'CAMPAIGN COMPLETED'}
          </h1>
          <div className="text-lg md:text-2xl text-white/80 uppercase font-black tracking-[0.2em] mb-8 z-10">
            {currentLevel < LEVELS.length 
              ? `ALL BOTS IN "${LEVELS[currentLevel - 1].title}" ELIMINATED!` 
              : 'YOU DEFEATED ALL CYBER-IMPOSTERS IN ALL LEVELS!'}
          </div>
          <div className="text-3xl md:text-5xl text-lime-400 mb-12 font-black tracking-tighter z-10 bg-lime-400/10 border-2 border-lime-400/30 px-8 py-5 rounded-2xl shadow-[0_0_35px_rgba(163,230,53,0.2)]">
            CURRENT SCORE: {score}
          </div>
          {currentLevel < LEVELS.length ? (
            <button
              onMouseDown={() => {
                useGameStore.getState().nextLevel();
              }}
              className="px-12 py-5 bg-lime-500/10 border-2 border-lime-400 text-lime-400 text-2xl font-black rounded hover:bg-lime-400 hover:text-black hover:scale-105 active:scale-95 transition-all duration-300 shadow-[0_0_30px_rgba(163,230,53,0.4)] uppercase tracking-widest z-10"
            >
              Proceed to Level {currentLevel + 1}
            </button>
          ) : (
            <button
              onMouseDown={() => {
                useGameStore.getState().leaveGame();
                setMenuView('main');
              }}
              className="px-12 py-5 bg-lime-500/10 border-2 border-lime-400 text-lime-400 text-2xl font-black rounded hover:bg-lime-400 hover:text-black hover:scale-105 active:scale-95 transition-all duration-300 shadow-[0_0_30px_rgba(163,230,53,0.4)] uppercase tracking-widest z-10"
            >
              System Reboot
            </button>
          )}
        </div>
      )}
    </div>
  );
}
