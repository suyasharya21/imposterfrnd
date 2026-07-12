/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/

import { useEffect, useState, useMemo, useRef } from 'react';
import { Game } from './components/Game';
import { MobileControls } from './components/MobileControls';
import { Minimap } from './components/Minimap';
import { useGameStore } from './store';
import { TaskOverlay } from './components/TaskOverlay';
import { VotingAndChatOverlay } from './components/VotingAndChatOverlay';
import { sounds } from './lib/sounds';
import { Heart, ArrowLeft, Copy } from 'lucide-react';

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
  const playerName = useGameStore(state => state.playerName);

  const enemies = useGameStore(state => state.enemies);
  const gameMode = useGameStore(state => state.gameMode);
  const cpuLevel = useGameStore(state => state.cpuLevel);

  const leaderboard = useMemo(() => {
    const players = [
      { id: playerName, score: score, isMe: true },
      ...Object.values(otherPlayers).map(p => ({
        id: p.name,
        score: p.score,
        isMe: false
      })),
      ...enemies.map(e => ({
        id: e.id,
        score: e.score,
        isMe: false
      }))
    ];
    // Sort by score descending and take top 4
    return players.sort((a, b) => b.score - a.score).slice(0, 4);
  }, [score, otherPlayers, enemies, playerName]);

  return (
    <>
      {/* Crosshair */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 pointer-events-none flex flex-col items-center">
        <div className="relative">
          <div className={`w-4 h-4 border-2 rounded-full ${playerState === 'disabled' ? 'border-red-500' : 'border-lime-400'}`} />
          <div className={`absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-1 h-1 rounded-full ${playerState === 'disabled' ? 'bg-red-500' : 'bg-lime-400'}`} />
        </div>

      </div>

      {/* HUD Left - Score & Leaderboard */}
      <div className="absolute top-2 left-2 md:top-4 md:left-4 flex flex-col gap-2 md:gap-4 pointer-events-none">
        <div className="flex flex-col gap-0.5">
          <div className="text-lime-400 text-lg md:text-2xl font-bold drop-shadow-[0_0_8px_rgba(163,230,53,0.8)]">
            SCORE: {score.toString().padStart(4, '0')}
          </div>
          {gameMode === 'cpu' && (
            <div className="flex flex-col mt-0.5">
              <div className="text-yellow-400 text-sm md:text-lg font-black drop-shadow-[0_0_8px_rgba(250,204,21,0.8)] uppercase">
                LEVEL: {cpuLevel}/10
              </div>
              <div className="text-lime-400/80 text-[10px] md:text-xs font-black uppercase">
                BOTS LEFT: {enemies.filter(e => e.state === 'active').length}
              </div>
            </div>
          )}
        </div>

        <div className="bg-black/40 border border-lime-400/30 p-2 md:p-3 rounded-lg flex flex-col gap-1 md:gap-2">
          <div className="text-lime-400/60 text-[10px] md:text-xs font-black uppercase tracking-[0.2em]">Weapon Systems</div>
          <div className="flex items-end justify-between gap-4">
            <div className="text-lime-400 text-base md:text-xl font-black uppercase tracking-tighter">
              {currentWeapon}
            </div>
            <div className={`text-xl md:text-3xl font-black ${ammo[currentWeapon] < 5 ? 'text-red-500 animate-pulse' : 'text-lime-400'}`}>
              {ammo[currentWeapon] === Infinity ? '∞' : ammo[currentWeapon].toString().padStart(2, '0')}
            </div>
          </div>
          {ammo[currentWeapon] !== Infinity && (
            <div className="w-full bg-lime-900/30 h-1 rounded-full overflow-hidden">
              <div 
                className={`h-full transition-all duration-300 ${ammo[currentWeapon] < 5 ? 'bg-red-500' : 'bg-lime-400'}`}
                style={{ width: `${(ammo[currentWeapon] / (currentWeapon === 'gun' ? 30 : 20)) * 100}%` }}
              />
            </div>
          )}
        </div>

        <div className="flex gap-1 md:gap-2 mt-1">
          {Array.from({ length: 3 }).map((_, i) => (
            <Heart
              key={i}
              size={isMobile ? 16 : 24}
              fill={i < lives ? "#a3e635" : "transparent"}
              color={i < lives ? "#a3e635" : "#333"}
              className={`${i < lives ? 'drop-shadow-[0_0_8px_rgba(163,230,53,0.8)]' : ''} transition-all duration-300`}
            />
          ))}
        </div>
        
        {/* Leaderboard - Hide on mobile if screen is small, or make smaller */}
        {!isMobile && gameMode !== 'cpu' && (
          <div className="bg-black/50 border border-lime-900/50 p-3 rounded w-48 flex flex-col gap-1">
            <div className="text-lime-400/70 text-xs font-bold mb-1 border-b border-lime-900/50 pb-1">LEADERBOARD</div>
            {leaderboard.map((p, i) => (
              <div key={p.id} className={`flex justify-between text-sm ${p.isMe ? 'text-lime-400 font-bold' : 'text-lime-400/70'}`}>
                <span>{i + 1}. {p.id}</span>
                <span>{p.score}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Minimap - Bottom Left */}
      <div className="absolute bottom-4 left-4 md:bottom-8 md:left-8 pointer-events-none z-40">
        <Minimap />
      </div>
      
      {/* HUD Right - Time, Leave, Events */}
      <div className="absolute top-2 right-2 md:top-4 md:right-4 flex flex-col items-end gap-1 md:gap-2 pointer-events-none z-40">
        {gameState === 'playing' && (
          <div className="text-lime-400 text-lg md:text-2xl font-bold drop-shadow-[0_0_8px_rgba(163,230,53,0.8)]">
            TIME: {Math.floor(timeLeft / 60)}:{(Math.floor(timeLeft) % 60).toString().padStart(2, '0')}
          </div>
        )}
        <button
          onClick={() => { sounds.playLeave(); leaveGame(); }}
          onMouseEnter={() => sounds.playHover()}
          className="px-2 py-1 md:px-4 md:py-2 bg-red-500/20 border border-red-500 text-red-500 text-xs md:text-sm font-bold rounded hover:bg-red-500 hover:text-black transition-all duration-200 pointer-events-auto cursor-pointer"
        >
          LEAVE
        </button>
        {!isMobile && <div className="text-lime-400/50 text-xs mt-1 uppercase tracking-widest font-bold">ESC to unlock cursor</div>}

        {/* Event Log */}
        <div className="mt-2 md:mt-4 flex flex-col items-end gap-1 pointer-events-none">
          {events.slice(-3).map(event => (
            <div key={event.id} className="text-[10px] md:text-xs font-bold text-fuchsia-400 bg-black/50 px-2 py-1 rounded border border-fuchsia-900/50 animate-pulse">
              {event.message}
            </div>
          ))}
        </div>
      </div>

      {/* Multiplayer Info */}
      <div className="absolute top-12 left-1/2 -translate-x-1/2 flex flex-col items-center pointer-events-none">
        <div className="text-lime-400 text-[10px] md:text-sm font-bold drop-shadow-[0_0_8px_rgba(163,230,53,0.8)] opacity-70">
          PLAYERS ONLINE: {playerCount}
        </div>
      </div>

      {/* Damage Overlay */}
      {playerState === 'disabled' && (
        <div className="absolute inset-0 bg-red-500/20 pointer-events-none flex items-center justify-center">
          <div className="text-red-500 text-4xl md:text-6xl font-black tracking-widest drop-shadow-[0_0_20px_rgba(239,68,68,1)] animate-pulse text-center">
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
  const cpuLevel = useGameStore(state => state.cpuLevel);
  const enemies = useGameStore(state => state.enemies);
  const cpuLevelCleared = useGameStore(state => state.cpuLevelCleared);
  const hostId = useGameStore(state => state.hostId);
  const lobbyCountdown = useGameStore(state => state.lobbyCountdown);
  const hostStartGame = useGameStore(state => state.hostStartGame);
  const socket = useGameStore(state => state.socket);
  const playerName = useGameStore(state => state.playerName);
  const setPlayerName = useGameStore(state => state.setPlayerName);
  
  const currentPlayerCount = Object.keys(otherPlayers).length + 1;
  const isHost = socket && hostId === socket.id;

  const isMobile = useIsMobile();
  const lastUnlockTime = useRef(0);
  const [lockCooldown, setLockCooldown] = useState(false);
  const [menuView, setMenuView] = useState<'main' | 'join'>('main');
  const [joinInput, setJoinInput] = useState('');
  const [introStep, setIntroStep] = useState<'studio' | 'title' | 'done'>('studio');
  const [loadingProgress, setLoadingProgress] = useState(0);
  const [hasSeenTutorial, setHasSeenTutorial] = useState(false);
  const tutorialActive = useGameStore(state => state.tutorialActive);
  const [tutorialTime, setTutorialTime] = useState(0);

  useEffect(() => {
    if (gameState === 'playing' && !hasSeenTutorial) {
      useGameStore.setState({ tutorialActive: true });
      setTutorialTime(0);
      
      const interval = setInterval(() => {
        setTutorialTime(prev => {
          if (prev >= 11) {
            clearInterval(interval);
            useGameStore.setState({ tutorialActive: false });
            setHasSeenTutorial(true);
            setTimeout(() => {
              safeRequestPointerLock(document.querySelector('canvas'));
            }, 100);
            return 11;
          }
          return Number((prev + 0.1).toFixed(1));
        });
      }, 100);
      
      return () => clearInterval(interval);
    }
  }, [gameState, hasSeenTutorial]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && tutorialActive) {
        sounds.playClick();
        useGameStore.setState({ tutorialActive: false });
        setHasSeenTutorial(true);
        setTimeout(() => {
          safeRequestPointerLock(document.querySelector('canvas'));
        }, 100);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [tutorialActive]);

  useEffect(() => {
    let hasPlayedBoom = false;
    const handleFirstInteraction = () => {
      sounds.resume();
      if (!hasPlayedBoom && introStep !== 'done') {
        sounds.playIntroBoom();
        hasPlayedBoom = true;
      }
      if (gameState === 'menu' || gameState === 'waiting') {
        sounds.startMenuBGM();
      }
      window.removeEventListener('mousedown', handleFirstInteraction);
      window.removeEventListener('keydown', handleFirstInteraction);
      window.removeEventListener('touchstart', handleFirstInteraction);
    };
    window.addEventListener('mousedown', handleFirstInteraction);
    window.addEventListener('keydown', handleFirstInteraction);
    window.addEventListener('touchstart', handleFirstInteraction);
    return () => {
      window.removeEventListener('mousedown', handleFirstInteraction);
      window.removeEventListener('keydown', handleFirstInteraction);
      window.removeEventListener('touchstart', handleFirstInteraction);
    };
  }, [introStep, gameState]);

  useEffect(() => {
    if (introStep === 'studio') {
      const t = setTimeout(() => {
        setIntroStep('title');
      }, 2500);
      return () => clearTimeout(t);
    }
    if (introStep === 'title') {
      setLoadingProgress(0);
      const interval = setInterval(() => {
        setLoadingProgress(prev => {
          if (prev >= 100) {
            clearInterval(interval);
            setIntroStep('done');
            return 100;
          }
          return prev + 1;
        });
      }, 30); // 30ms * 100 = 3000ms (3 seconds)
      return () => clearInterval(interval);
    }
  }, [introStep]);

  useEffect(() => {
    if (gameState === 'menu' && introStep === 'done') {
      sounds.startMenuBGM();
    } else {
      sounds.stopMenuBGM();
    }
    return () => sounds.stopMenuBGM();
  }, [gameState, introStep]);

  useEffect(() => {
    if (cpuLevelCleared && document.pointerLockElement) {
      document.exitPointerLock();
    }
  }, [cpuLevelCleared]);

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
      </div>      {/* Cinematic Intro Overlays */}
      {introStep !== 'done' && (
        <div className="absolute inset-0 bg-black/45 backdrop-blur-[8px] z-[300] flex flex-col items-center justify-center p-6 select-none font-mono">
          {/* Futuristic Scanline Effect */}
          <div className="absolute inset-0 pointer-events-none bg-[linear-gradient(rgba(163,230,53,0.02)_50%,transparent_50%)] bg-[length:100%_4px] z-50 animate-cyber-pulse" />

          {introStep === 'studio' && (
            <div className="backdrop-blur-xl bg-black/60 border border-lime-400/10 px-10 py-8 rounded-2xl shadow-[0_0_40px_rgba(163,230,53,0.1)] flex flex-col items-center gap-4 animate-in fade-in zoom-in-95 duration-700">
              <img 
                src="/logo.png" 
                className="w-20 h-20 md:w-24 md:h-24 rounded-2xl border-2 border-lime-400/20 shadow-[0_0_25px_rgba(163,230,53,0.25)] animate-pulse" 
                alt="Arya Game Co. Logo" 
              />
              <div className="flex flex-col items-center gap-1">
                <span className="text-[10px] text-lime-400/40 font-black tracking-[0.3em] uppercase">Developed By</span>
                <h2 className="text-lime-400 text-3xl md:text-5xl font-black tracking-[0.25em] uppercase animate-glitch animate-neon-glow">
                  ARYA GAME CO.
                </h2>
                <span className="text-[9px] text-lime-400/30 uppercase mt-2 tracking-[0.15em]">© 2026 COMBAT CORE MODULE</span>
              </div>
            </div>
          )}

          {introStep === 'title' && (
            <div className="backdrop-blur-xl bg-black/65 border-2 border-lime-400/20 p-12 md:p-16 rounded-3xl shadow-[0_0_60px_rgba(163,230,53,0.18)] flex flex-col items-center gap-6 animate-in fade-in duration-500 relative">
              <div className="absolute -top-3.5 left-10 bg-lime-400 text-black px-2.5 py-0.5 text-[9px] font-black tracking-widest uppercase">
                System Sync
              </div>
              
              <span className="text-[9px] text-lime-400/50 font-black tracking-[0.4em] uppercase animate-pulse">Initializing Interface...</span>
              <h1 className="text-6xl md:text-8xl font-black text-lime-400 tracking-tighter uppercase italic drop-shadow-[0_0_30px_rgba(163,230,53,0.7)] animate-glitch">
                IMPOSTERFRND
              </h1>
              
              {/* Loading Bar */}
              <div className="flex flex-col items-center gap-2 mt-4">
                <div className="w-64 md:w-80 h-2 bg-lime-950/20 border border-lime-400/25 rounded-full overflow-hidden relative">
                  <div 
                    className="h-full bg-lime-400 shadow-[0_0_12px_rgba(163,230,53,0.8)] transition-all duration-75"
                    style={{ width: `${loadingProgress}%` }}
                  />
                </div>
                <div className="flex justify-between w-64 md:w-80 text-[10px] text-lime-400/60 font-black uppercase tracking-widest">
                  <span>Syncing...</span>
                  <span className="tabular-nums">{loadingProgress}%</span>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Tutorial / Sync Overlay (Only plays once) */}
      {gameState === 'playing' && tutorialActive && (
        <div className="absolute inset-0 bg-black/45 backdrop-blur-[8px] z-[190] flex flex-col items-center justify-center p-6 select-none font-mono pointer-events-auto">
          {/* Futuristic Scanline Effect */}
          <div className="absolute inset-0 pointer-events-none bg-[linear-gradient(rgba(163,230,53,0.02)_50%,transparent_50%)] bg-[length:100%_4px] z-50 animate-cyber-pulse" />

          {/* Tutorial Card */}
          <div className="backdrop-blur-xl bg-[#030903]/80 border-2 border-lime-400 p-8 md:p-12 rounded-3xl shadow-[0_0_50px_rgba(163,230,53,0.25)] flex flex-col items-center gap-6 max-w-xl w-full relative overflow-hidden text-center animate-in fade-in zoom-in-95 duration-300">
            {/* Warning header */}
            <div className="absolute -top-3.5 left-10 bg-lime-400 text-black px-2.5 py-0.5 text-[9px] font-black tracking-widest uppercase">
              Pilot Sync Protocol
            </div>

            {/* Skip Button (only during controls phase: first 8s) */}
            {tutorialTime < 8.0 && (
              <button 
                onClick={() => {
                  sounds.playClick();
                  useGameStore.setState({ tutorialActive: false });
                  setHasSeenTutorial(true);
                  setTimeout(() => {
                    safeRequestPointerLock(document.querySelector('canvas'));
                  }, 100);
                }}
                className="absolute top-6 right-6 text-lime-400/40 hover:text-lime-400 border border-lime-400/25 hover:border-lime-400 px-3 py-1 rounded text-[9px] font-black uppercase tracking-widest transition-all cursor-pointer z-50 animate-pulse"
              >
                Skip [ESC]
              </button>
            )}

            {/* Top title */}
            <div className="flex flex-col gap-1">
              <span className="text-lime-400 text-xs font-black tracking-[0.2em] uppercase animate-pulse">Neural Interface Sync</span>
              <h2 className="text-lime-400 text-xl font-black tracking-[0.1em] uppercase">SYSTEM TRAINING SEQUENCER</h2>
            </div>

            {/* Middle Stage: Motion Graphics Controls explanations */}
            <div className="h-44 flex items-center justify-center w-full bg-black/40 border border-lime-400/10 rounded-2xl p-4 relative overflow-hidden">
              {/* Scanline background for explanation box */}
              <div className="absolute inset-0 pointer-events-none bg-[linear-gradient(rgba(163,230,53,0.01)_50%,transparent_50%)] bg-[length:100%_2px]" />

              {/* Step 1: 0.0s to 2.0s - W/A/S/D */}
              {tutorialTime >= 0.0 && tutorialTime < 2.0 && (
                <div className="flex flex-col items-center gap-3 w-full animate-in fade-in slide-in-from-bottom-4 duration-300">
                  <div className="flex gap-2.5">
                    {['W', 'A', 'S', 'D'].map(key => (
                      <div key={key} className="w-12 h-12 border-2 border-lime-400 rounded-lg flex items-center justify-center text-lime-400 font-black text-xl shadow-[0_0_12px_rgba(163,230,53,0.3)] animate-pulse">
                        {key}
                      </div>
                    ))}
                  </div>
                  <h3 className="text-lime-400 text-base font-black tracking-widest uppercase">Movement & Thrusters</h3>
                  <p className="text-[11px] text-lime-400/60 max-w-sm leading-relaxed">Use WASD or navigation arrows to move the pilot's ship across the sector coordinates.</p>
                </div>
              )}

              {/* Step 2: 2.0s to 4.0s - M1 */}
              {tutorialTime >= 2.0 && tutorialTime < 4.0 && (
                <div className="flex flex-col items-center gap-3 w-full animate-in fade-in slide-in-from-bottom-4 duration-300">
                  <div className="w-14 h-14 border-2 border-lime-400 rounded-lg flex items-center justify-center text-lime-400 font-black text-xl shadow-[0_0_12px_rgba(163,230,53,0.3)] animate-pulse">
                    M1
                  </div>
                  <h3 className="text-lime-400 text-base font-black tracking-widest uppercase">Weapons & Firepower</h3>
                  <p className="text-[11px] text-lime-400/60 max-w-sm leading-relaxed">Left-click or tap shooting triggers to discharge. Hold rifle down for a 7-bullet automatic burst. Pistol is semi-auto.</p>
                </div>
              )}

              {/* Step 3: 4.0s to 6.0s - SPACE */}
              {tutorialTime >= 4.0 && tutorialTime < 6.0 && (
                <div className="flex flex-col items-center gap-3 w-full animate-in fade-in slide-in-from-bottom-4 duration-300">
                  <div className="px-5 h-12 border-2 border-lime-400 rounded-lg flex items-center justify-center text-lime-400 font-black text-base shadow-[0_0_12px_rgba(163,230,53,0.3)] animate-pulse">
                    SPACEBAR
                  </div>
                  <h3 className="text-lime-400 text-base font-black tracking-widest uppercase">Thruster Boost / Jump</h3>
                  <p className="text-[11px] text-lime-400/60 max-w-sm leading-relaxed">Press SPACE to jump. Steer and boost upward to navigate vertical obstacles and reach elevated platforms.</p>
                </div>
              )}

              {/* Step 4: 6.0s to 8.0s - Weapon Swap */}
              {tutorialTime >= 6.0 && tutorialTime < 8.0 && (
                <div className="flex flex-col items-center gap-3 w-full animate-in fade-in slide-in-from-bottom-4 duration-300">
                  <div className="w-12 h-12 border-2 border-lime-400 rounded-lg flex items-center justify-center text-lime-400 font-black text-xl shadow-[0_0_12px_rgba(163,230,53,0.3)] animate-pulse">
                    Q
                  </div>
                  <h3 className="text-lime-400 text-base font-black tracking-widest uppercase">Cycle Weapons</h3>
                  <p className="text-[11px] text-lime-400/60 max-w-sm leading-relaxed">Press Q or Scroll the Mouse Wheel to rotate active equipment between Rifle, Pistol, and Combat Knife.</p>
                </div>
              )}

              {/* Step 5: 8.0s to 11.0s - Game Rules & Levels */}
              {tutorialTime >= 8.0 && tutorialTime <= 11.0 && (
                <div className="flex flex-col items-left gap-2 w-full animate-in fade-in duration-500 text-left px-4">
                  <h3 className="text-lime-400 text-sm font-black tracking-widest uppercase border-b border-lime-400/20 pb-1 w-full text-center">DIRECTIVE DEPLOYMENT PARAMETERS</h3>
                  <div className="flex flex-col gap-1.5 text-[10px] text-lime-400/70">
                    <div><span className="text-lime-400 font-black">&gt; COMBAT RUN:</span> Cleanse the arena of all hostiles to warp and unlock the next level.</div>
                    <div><span className="text-lime-400 font-black">&gt; LEVEL DIFFICULTY:</span> Levels scale in bot spawning count, bot reaction speed, and tactical hazards.</div>
                    <div><span className="text-lime-400 font-black">&gt; INTEGRITY SYSTEM:</span> Clearing a sector restores +1 Life. Losing all lives severs link.</div>
                  </div>
                </div>
              )}
            </div>

            {/* Bottom Loading Progress Bar */}
            <div className="w-full flex flex-col gap-1.5 mt-2">
              <div className="w-full h-2 bg-lime-950/20 border border-lime-400/25 rounded-full overflow-hidden relative">
                <div 
                  className="h-full bg-lime-400 shadow-[0_0_10px_rgba(163,230,53,0.8)] transition-all duration-100 ease-linear"
                  style={{ width: `${(tutorialTime / 11) * 100}%` }}
                />
              </div>
              <div className="flex justify-between text-[9px] text-lime-400/50 font-black uppercase tracking-widest">
                <span>{tutorialTime < 8.0 ? 'Loading Neural HUD & Controls...' : 'Syncing Rules & Level Params...'}</span>
                <span className="tabular-nums">{Math.min(100, Math.floor((tutorialTime / 11) * 100))}%</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Task & Voting Overlays */}
      <TaskOverlay />
      <VotingAndChatOverlay />

      {/* Level Completed Overlay */}
      {gameState === 'playing' && cpuLevelCleared && (
        <div className="absolute inset-0 bg-black/85 backdrop-blur-md flex flex-col items-center justify-center z-[180] pointer-events-auto text-center animate-in fade-in duration-300">
          <div className="bg-[#050f05] border-2 border-yellow-400 p-8 rounded-xl shadow-[0_0_35px_rgba(234,179,8,0.3)] max-w-md w-full font-mono relative overflow-hidden flex flex-col gap-6">
            <div className="absolute inset-0 pointer-events-none bg-[linear-gradient(rgba(234,179,8,0.03)_50%,transparent_50%)] bg-[length:100%_4px] opacity-40" />
            
            <div className="flex flex-col items-center gap-2 border-b border-yellow-500/20 pb-4">
              <span className="text-yellow-400 text-sm font-black tracking-widest uppercase animate-pulse">Level Complete</span>
              <h2 className="text-emerald-400 text-3xl font-black uppercase tracking-tight">CONGRATULATIONS!</h2>
            </div>
            
            <div className="text-lime-400 text-sm leading-relaxed text-left bg-black/60 p-4 rounded border border-yellow-500/20">
              <p className="font-bold text-yellow-400 mb-2">&gt; SYSTEM REPORT:</p>
              <p>&gt; Level {cpuLevel} cleared successfully.</p>
              <p>&gt; Target bots eliminated: {cpuLevel + 2}</p>
              <p>&gt; Ammunition reserves replenished.</p>
              <p>&gt; Combat bonus: +1 structural integrity (Life).</p>
            </div>

            <div className="flex flex-col gap-3">
              <button
                onMouseDown={() => {
                  useGameStore.getState().advanceCpuLevel();
                }}
                className="w-full py-4 bg-yellow-400 text-black font-black text-lg uppercase tracking-widest hover:scale-105 active:scale-95 transition-all shadow-[0_0_15px_rgba(234,179,8,0.4)]"
              >
                Continue to Level {cpuLevel + 1}
              </button>
              <button
                onMouseDown={() => {
                  useGameStore.getState().leaveGame();
                  setMenuView('main');
                }}
                className="w-full py-3 bg-red-950/20 border border-red-500 text-red-500 font-bold uppercase tracking-wider hover:bg-red-500 hover:text-black transition-all"
              >
                Back to Main Menu
              </button>
            </div>
          </div>
        </div>
      )}

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
              navigator.clipboard.writeText(roomCode);
              alert(`Room Code ${roomCode} copied to clipboard!`);
            }}
            className="px-3 py-1 bg-lime-400/10 border border-lime-400/30 text-lime-400 font-black text-sm rounded cursor-pointer hover:bg-lime-400/20 transition-all active:scale-95"
          >
            {roomCode}
          </div>
        </div>
      )}

      {/* Click to Resume Overlay */}
      {gameState === 'playing' && !isCursorLocked && !isMobile && !tutorialActive && (
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
        <div className="absolute inset-0 bg-black/95 flex flex-col items-center justify-center p-6 md:p-12 z-[140] pointer-events-auto backdrop-blur-xl transition-all duration-500">
          {/* Global Back Arrow */}
          <button 
            onClick={() => { sounds.playLeave(); useGameStore.getState().leaveGame(); }}
            onMouseEnter={() => sounds.playHover()}
            className="absolute top-6 left-6 flex items-center gap-2 text-lime-400/60 hover:text-lime-400 transition-colors group z-[150] cursor-pointer"
          >
            <div className="p-1.5 border border-lime-400/20 rounded-lg group-hover:bg-lime-400/10 transition-all">
              <ArrowLeft size={18} />
            </div>
            <span className="font-black uppercase text-[10px] tracking-widest hidden md:block">Return to Base</span>
          </button>

          <div className="flex flex-col items-center gap-4 max-w-md w-full px-4 my-auto">
            <div className="relative text-center">
              <h2 className="text-3xl md:text-4xl font-black text-lime-400 tracking-tighter uppercase italic animate-pulse">
                Establishing Link
              </h2>
              <div className="bg-red-500 text-white text-[9px] font-black px-2.5 py-0.5 uppercase tracking-widest mt-1 inline-block">
                Awaiting Pilots
              </div>
            </div>

            <div className="w-full bg-[#050a05]/95 border border-lime-400/20 p-5 md:p-6 rounded-xl flex flex-col gap-4 shadow-[0_0_40px_rgba(163,230,53,0.1)] relative overflow-hidden">
              {/* Scanline Effect */}
              <div className="absolute inset-0 pointer-events-none bg-[linear-gradient(rgba(163,230,53,0.03)_50%,transparent_50%)] bg-[length:100%_4px] opacity-50" />
              
              <div className="flex justify-between items-end border-b border-lime-400/10 pb-3 relative z-10">
                <div className="flex flex-col gap-0.5">
                  <span className="text-lime-400/40 font-black uppercase text-[9px] tracking-widest">Active Sector</span>
                  <span className="text-lime-400 font-black text-lg tracking-[0.1em]">{roomCode}</span>
                </div>
                <div className="flex flex-col items-end gap-0.5">
                  <span className="text-lime-400/40 font-black uppercase text-[9px] tracking-widest">Protocol</span>
                  <span className="text-lime-400 font-black uppercase text-[10px] bg-lime-400/10 px-2 py-0.5 border border-lime-400/20 rounded">
                    {gameMode === 'online' ? 'Global Ops' : 'Private Squad'}
                  </span>
                </div>
              </div>

              {/* Status Header */}
              <div className="flex items-center justify-between relative z-10">
                <div className="flex items-center gap-3">
                  <div className="flex gap-1">
                    {Array.from({ length: 8 }).map((_, i) => (
                      <div 
                        key={i} 
                        className={`w-2.5 h-2.5 rounded-full border border-lime-400/30 ${i < currentPlayerCount ? 'bg-lime-400 shadow-[0_0_8px_rgba(163,230,53,0.8)]' : 'bg-transparent animate-pulse'}`}
                      />
                    ))}
                  </div>
                  <span className="text-lime-400/60 font-black uppercase text-[10px] tracking-[0.15em]">Sync Status</span>
                </div>
                <div className="text-lime-400 font-black text-xl tabular-nums tracking-tighter">
                  {currentPlayerCount}<span className="text-lime-400/30 text-sm mx-1">/</span>8
                </div>
              </div>

              {/* Lobby Countdown display */}
              {lobbyCountdown !== null && (
                <div className="bg-amber-500/10 border border-amber-500/30 p-2 rounded-lg flex items-center justify-between z-10 animate-pulse">
                  <span className="text-amber-400 text-[10px] font-black uppercase tracking-wider">Starting in:</span>
                  <span className="text-amber-400 text-lg font-black">{lobbyCountdown}s</span>
                </div>
              )}

              {/* Player List */}
              <div className="bg-black/50 border border-lime-400/10 rounded-lg p-3 flex flex-col gap-2 relative z-10 max-h-[130px] overflow-y-auto custom-scrollbar">
                <div className="text-[9px] text-lime-400/40 font-black uppercase tracking-widest mb-0.5 border-b border-lime-400/5 pb-1.5 flex justify-between">
                  <span>Pilots In Area</span>
                  <span>System Status</span>
                </div>
                
                <div className="flex items-center justify-between group">
                  <div className="flex items-center gap-2">
                    <div className="w-1.5 h-1.5 rounded-full bg-lime-400 shadow-[0_0_6px_rgba(163,230,53,0.8)]" />
                    <span className="text-white font-black text-xs uppercase">You (Pilot 0) {isHost && <span className="text-amber-400 font-black text-[9px] ml-1">[HOST]</span>}</span>
                  </div>
                  <span className="text-lime-400/80 text-[9px] font-black uppercase px-1.5 py-0.5 bg-lime-400/10 border border-lime-400/20 rounded">Ready</span>
                </div>

                {Object.values(otherPlayers).map((player, idx) => (
                  <div key={player.id} className="flex items-center justify-between animate-in fade-in slide-in-from-left-4 duration-300">
                    <div className="flex items-center gap-2">
                      <div className="w-1.5 h-1.5 rounded-full bg-[#39ff14]" />
                      <span className="text-white/80 font-black text-xs uppercase">{player.name || `Pilot ${idx + 1}`} {hostId === player.id && <span className="text-amber-500 font-black text-[9px] ml-1">[HOST]</span>}</span>
                    </div>
                    <span className="text-lime-400/80 text-[9px] font-black uppercase px-1.5 py-0.5 bg-lime-400/10 border border-lime-400/20 rounded">Synced</span>
                  </div>
                ))}

                {currentPlayerCount < 5 && (
                  <div className="flex items-center gap-2 opacity-30 animate-pulse">
                    <div className="w-1.5 h-1.5 rounded-full bg-gray-600" />
                    <span className="text-gray-400 font-black text-xs uppercase italic">Need at least 5 players to start...</span>
                  </div>
                )}
              </div>

              {/* Room Code Share Section */}
              <div className="flex flex-col gap-2 relative z-10">
                <span className="text-[9px] text-lime-400/40 font-black uppercase tracking-[0.25em] text-center">Broadcast Lobby Frequency</span>
                <div className="flex gap-2">
                  <div className="flex-1 bg-black border border-lime-400/30 px-4 py-2 text-xl font-black text-lime-400 text-center tracking-[0.25em] rounded-lg flex items-center justify-center">
                    {roomCode}
                  </div>
                  <button 
                    onClick={() => {
                      if (roomCode) {
                        navigator.clipboard.writeText(roomCode);
                        sounds.playCollect();
                      }
                    }}
                    onMouseEnter={() => sounds.playHover()}
                    className="aspect-square bg-lime-400 text-black flex items-center justify-center px-4 rounded-lg hover:bg-white hover:scale-105 transition-all active:scale-95 shadow-[0_0_15px_rgba(163,230,53,0.2)] cursor-pointer"
                    title="Copy Frequency"
                  >
                    <Copy size={18} strokeWidth={3} />
                  </button>
                </div>
              </div>

              {/* Progress Bar */}
              <div className="relative h-1 w-full bg-lime-900/20 rounded-full overflow-hidden">
                <div 
                  className="absolute inset-y-0 left-0 bg-lime-400 transition-all duration-1000 ease-out shadow-[0_0_8px_rgba(163,230,53,0.8)]" 
                  style={{ width: `${Math.min(100, (currentPlayerCount / 8) * 100)}%` }}
                />
              </div>

              {/* Launch Engagement Controls */}
              {currentPlayerCount >= 5 && (
                <div className="flex flex-col gap-2 z-10">
                  {isHost ? (
                    <button
                      onClick={() => { sounds.playClick(); hostStartGame(); }}
                      onMouseEnter={() => sounds.playHover()}
                      className="w-full py-2.5 bg-[#39ff14] text-black font-black text-sm uppercase tracking-widest hover:scale-[1.02] active:scale-95 transition-all shadow-[0_0_20px_rgba(57,255,20,0.4)] rounded-lg cursor-pointer"
                    >
                      Start Game
                    </button>
                  ) : (
                    <div className="w-full py-2 bg-lime-950/20 border border-lime-400/30 text-lime-400/70 font-bold uppercase text-center tracking-widest text-[10px] rounded-lg animate-pulse">
                      Awaiting launch permission from host...
                    </div>
                  )}
                </div>
              )}
            </div>

            <p className="text-lime-400/40 text-[9px] text-center font-bold uppercase tracking-[0.15em] animate-pulse">
              [ WARNING ]: Combat engagement authorized upon full sync
            </p>
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
        <div className="absolute inset-0 bg-black/90 flex flex-col items-center justify-center z-[150] pointer-events-auto backdrop-blur-md text-center">
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

          {/* Pilot CALLSIGN Input */}
          <div className="w-full max-w-xl px-6 mb-6">
            <div className="bg-[#050a05]/80 border-2 border-lime-400/20 p-4 rounded-xl flex items-center justify-between shadow-[0_0_20px_rgba(163,230,53,0.05)]">
              <span className="text-[10px] text-lime-400/50 font-black uppercase tracking-widest whitespace-nowrap mr-4">PILOT CALLSIGN:</span>
              <input
                type="text"
                value={playerName}
                onChange={(e) => setPlayerName(e.target.value.toUpperCase().slice(0, 15))}
                placeholder="ENTER CALLSIGN"
                className="bg-black border-2 border-lime-400/30 px-3 py-1.5 text-lime-400 font-black uppercase text-sm tracking-widest focus:border-lime-400 outline-none w-full max-w-[240px] rounded text-center"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 w-full max-w-xl px-6">
            {menuView === 'main' ? (
              <>
                <button
                  onMouseEnter={() => sounds.playHover()}
                  onMouseDown={() => {
                    sounds.playClick();
                    startGame('online');
                    safeRequestPointerLock(document.querySelector('canvas'));
                  }}
                  className="flex flex-col items-center justify-center p-6 bg-lime-500/10 border-2 border-lime-400 text-lime-400 rounded hover:bg-lime-400 hover:text-black transition-all group shadow-[0_0_20px_rgba(163,230,53,0.2)] cursor-pointer"
                >
                  <span className="text-2xl font-black uppercase tracking-tighter">Play Online</span>
                  <span className="text-[10px] opacity-60 uppercase font-black mt-1 group-hover:text-black/60">Matchmaking (8P)</span>
                </button>

                <button
                  onMouseEnter={() => sounds.playHover()}
                  onMouseDown={() => {
                    sounds.playClick();
                    startGame('cpu');
                    safeRequestPointerLock(document.querySelector('canvas'));
                  }}
                  className="flex flex-col items-center justify-center p-6 bg-blue-500/10 border-2 border-blue-400 text-blue-400 rounded hover:bg-blue-400 hover:text-black transition-all group cursor-pointer"
                >
                  <span className="text-2xl font-black uppercase tracking-tighter">Play with CPU</span>
                  <span className="text-[10px] opacity-60 uppercase font-black mt-1 group-hover:text-black/60">Solo Practice</span>
                </button>

                <button
                  onMouseEnter={() => sounds.playHover()}
                  onMouseDown={() => {
                    sounds.playClick();
                    startGame('room');
                    safeRequestPointerLock(document.querySelector('canvas'));
                  }}
                  className="flex flex-col items-center justify-center p-6 bg-fuchsia-500/10 border-2 border-fuchsia-400 text-fuchsia-400 rounded hover:bg-fuchsia-400 hover:text-black transition-all group cursor-pointer"
                >
                  <span className="text-2xl font-black uppercase tracking-tighter">Create Room</span>
                  <span className="text-[10px] opacity-60 uppercase font-black mt-1 group-hover:text-black/60">Private Lobby</span>
                </button>

                <button
                  onMouseEnter={() => sounds.playHover()}
                  onMouseDown={() => {
                    sounds.playClick();
                    setMenuView('join');
                  }}
                  className="flex flex-col items-center justify-center p-6 bg-yellow-500/10 border-2 border-yellow-400 text-yellow-400 rounded hover:bg-yellow-400 hover:text-black transition-all group cursor-pointer"
                >
                  <span className="text-2xl font-black uppercase tracking-tighter">Join Code</span>
                  <span className="text-[10px] opacity-60 uppercase font-black mt-1 group-hover:text-black/60">Enter room ID</span>
                </button>
              </>
            ) : (
              <div className="col-span-full bg-black/60 border-2 border-yellow-400/30 p-8 rounded-xl flex flex-col items-center gap-6 animate-in fade-in slide-in-from-bottom-4 duration-300 relative">
                {/* Back Arrow for Join Scene */}
                <button 
                  onClick={() => { sounds.playClick(); setMenuView('main'); }}
                  className="absolute top-4 left-4 p-2 text-yellow-400/50 hover:text-yellow-400 hover:bg-yellow-400/10 rounded-lg transition-all cursor-pointer"
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
                        sounds.playClick();
                        setMenuView('main');
                        startGame('room', joinInput);
                        safeRequestPointerLock(document.querySelector('canvas'));
                      }
                    }}
                    onMouseEnter={() => sounds.playHover()}
                    disabled={joinInput.length !== 6}
                    className="w-full px-8 py-3 bg-yellow-400 text-black font-black uppercase tracking-widest hover:scale-105 active:scale-95 transition-all disabled:opacity-30 disabled:grayscale cursor-pointer"
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
      )}

      {gameState === 'gameover' && (
        <div className="absolute inset-0 bg-black/90 flex flex-col items-center justify-center z-[200] pointer-events-auto backdrop-blur-xl text-center">
          <h1 className={`text-5xl md:text-8xl font-black mb-4 tracking-tighter italic uppercase underline decoration-4 underline-offset-8 ${
            gameMode === 'cpu' && cpuLevel >= 10 && enemies.every(e => e.state === 'disabled')
              ? 'text-yellow-400 drop-shadow-[0_0_30px_rgba(250,204,21,0.8)]'
              : 'text-red-500 drop-shadow-[0_0_30px_rgba(239,68,68,0.8)]'
          }`}>
            {gameMode === 'cpu' && cpuLevel >= 10 && enemies.every(e => e.state === 'disabled')
              ? 'MISSION ACCOMPLISHED'
              : (lives <= 0 ? 'TERMINATED' : 'LINK SEVERED')}
          </h1>
          <div className="text-4xl text-lime-400 mb-12 font-black tracking-tighter">
            COMBAT SCORE: {score}
          </div>
          <button
            onMouseDown={() => {
              sounds.playClick();
              useGameStore.getState().leaveGame();
              setMenuView('main');
            }}
            onMouseEnter={() => sounds.playHover()}
            className="px-12 py-5 bg-lime-500/10 border-2 border-lime-400 text-lime-400 text-2xl font-black rounded hover:bg-lime-400 hover:text-black transition-all duration-300 shadow-[0_0_30px_rgba(163,230,53,0.3)] uppercase tracking-widest cursor-pointer"
          >
            System Reboot
          </button>
        </div>
      )}
    </div>
  );
}
