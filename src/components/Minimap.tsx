/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/

import { useMemo, useState, useEffect } from 'react';
import { useGameStore } from '../store';
import { motion } from 'motion/react';
import { getObstacles, ARENA_HALF_SIZE, ARENA_SIZE } from '../constants';

const MAP_SIZE = 150;

export function Minimap() {
  const playerPosition = useGameStore(state => state.playerPosition);
  const playerRotation = useGameStore(state => state.playerRotation);
  const otherPlayers = useGameStore(state => state.otherPlayers);
  const enemies = useGameStore(state => state.enemies);
  const coins = useGameStore(state => state.coins);
  const arenaSeed = useGameStore(state => state.arenaSeed);
  
  const [isMobile] = useState(() => {
    if (typeof window === 'undefined') return false;
    return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) || window.innerWidth < 768;
  });

  const obstacles = useMemo(() => getObstacles(false, arenaSeed), [arenaSeed]);
  const activeEnemies = useMemo(() => enemies.filter(e => e.state === 'active'), [enemies]);

  const ZOOM = 2.5; 
  const pixelsPerUnit = (MAP_SIZE / ARENA_SIZE) * ZOOM;

  // Rotation for the Map (Player's forward is always UP)
  const mapRotationDeg = (playerRotation * 180) / Math.PI;

  const getMapCoords = (worldPos: [number, number, number]) => {
    // Current world position on map (relative to center)
    const x = worldPos[0] * pixelsPerUnit;
    const z = worldPos[2] * pixelsPerUnit;
    return { x, z };
  };

  const { x: pX, z: pZ } = { 
    x: playerPosition[0] * pixelsPerUnit, 
    z: playerPosition[2] * pixelsPerUnit 
  };

  return (
    <div className="relative w-[150px] h-[150px] rounded-full border-2 border-lime-500/50 bg-[#050510]/95 backdrop-blur-md overflow-hidden shadow-[0_0_25px_rgba(163,230,53,0.4)] ring-1 ring-lime-400/30">
      {/* Scanline Effect */}
      <div className="absolute inset-0 pointer-events-none bg-[linear-gradient(rgba(163,230,53,0.1)_50%,transparent_50%)] bg-[length:100%_4px] z-50 opacity-10" />
      
      {/* Radar Sweep Animation (Fixed relative to map ring) */}
      <motion.div 
        className="absolute inset-0 z-40 pointer-events-none"
        animate={{ rotate: 360 }}
        transition={{ repeat: Infinity, duration: 4, ease: "linear" }}
        style={{ 
          background: 'conic-gradient(from 0deg, rgba(163,230,53,0.1) 0deg, transparent 90deg)',
          transformOrigin: '50% 50%'
        }}
      />

      {/* Rotating World Container */}
      <div 
        className="absolute inset-0 z-10"
        style={{ 
          transform: `rotate(${mapRotationDeg}deg)`,
          transformOrigin: 'center center'
        }}
      >
        <div 
          className="absolute inset-0 transition-transform duration-75 ease-out"
          style={{ 
            transform: `translate(${-pX}px, ${-pZ}px)`,
          }}
        >
          {/* Arena Outer Boundary */}
          <div 
            className="absolute border-2 border-lime-400/30 pointer-events-none z-0"
            style={{
              left: ( -ARENA_HALF_SIZE ) * pixelsPerUnit + (MAP_SIZE / 2),
              top: ( -ARENA_HALF_SIZE ) * pixelsPerUnit + (MAP_SIZE / 2),
              width: ARENA_SIZE * pixelsPerUnit,
              height: ARENA_SIZE * pixelsPerUnit,
              background: 'radial-gradient(circle, transparent 60%, rgba(163,230,53,0.05) 100%)',
            }}
          />

          {/* Obstacles (Walls) */}
          {obstacles.map((obs, i) => {
            const { x, z } = getMapCoords(obs.position);
            const w = obs.size[0] * pixelsPerUnit;
            const d = obs.size[2] * pixelsPerUnit;
            const isCylinder = obs.type === 'cylinder';
            
            return (
              <div 
                key={`obs-${i}`}
                className={`absolute bg-lime-400/40 border border-lime-400/20 z-[1] ${isCylinder ? 'rounded-full' : ''}`}
                style={{ 
                  left: `${x + MAP_SIZE / 2}px`, 
                  top: `${z + MAP_SIZE / 2}px`,
                  width: `${w}px`,
                  height: `${isCylinder ? w : d}px`,
                  transform: `rotate(${-(obs.rotation[1] * 180) / Math.PI}deg) translate(-50%, -50%)`,
                }}
              />
            );
          })}

        {/* Coins (Gold Dots) */}
        {coins.map(coin => {
          const { x, z } = getMapCoords(coin.position);
          return (
            <div 
              key={coin.id}
              className="absolute w-1.5 h-1.5 bg-yellow-400 rounded-full z-[8]"
              style={{ 
                left: `${x + MAP_SIZE / 2}px`, 
                top: `${z + MAP_SIZE / 2}px`,
                transform: 'translate(-50%, -50%)'
              }}
            />
          );
        })}

        {/* Enemies (Bots - Red Dots) */}
        {activeEnemies.map(enemy => {
          const { x, z } = getMapCoords(enemy.position);
          return (
            <div 
              key={enemy.id}
              className="absolute w-2.5 h-2.5 rounded-full z-[10] bg-rose-500 shadow-[0_0_8px_rgba(244,63,94,0.6)] animate-pulse"
              style={{ 
                left: `${x + MAP_SIZE / 2}px`, 
                top: `${z + MAP_SIZE / 2}px`,
                transform: 'translate(-50%, -50%)'
              }}
            />
          );
        })}

        {/* Other Players (Humans - Green Dots as requested) */}
        {Object.values(otherPlayers).map(player => {
          if (player.state === 'disabled') return null;
          const { x, z } = getMapCoords(player.position);
          return (
            <div 
              key={player.id}
              className="absolute w-2.5 h-2.5 bg-lime-400 rounded-full shadow-[0_0_8px_rgba(163,230,53,0.8)] z-[15]"
              style={{ 
                left: `${x + MAP_SIZE / 2}px`, 
                top: `${z + MAP_SIZE / 2}px`,
                transform: 'translate(-50%, -50%)'
              }}
            />
          );
        })}
      </div>
    </div>

    {/* Local Player Icon (Static at center, Always pointing UP) */}
      <div className="absolute inset-0 pointer-events-none flex items-center justify-center z-50">
        {/* Vision Cone (Static pointing up) */}
        <div 
          className="absolute w-32 h-32 bg-gradient-to-t from-transparent to-lime-400/20"
          style={{ 
            clipPath: 'polygon(50% 50%, 30% 0%, 70% 0%)',
            transform: `translateY(-50%)`,
            transformOrigin: '50% 100%'
          }}
        />

        <div className="relative z-10 flex items-center justify-center">
          {/* Professional Player Arrow Icon */}
          <svg 
            width="24" 
            height="24" 
            viewBox="0 0 24 24" 
            fill="none" 
          >
            <path 
              d="M12 4L4 20L12 17L20 20L12 4Z" 
              fill="#39ff14"
              stroke="#000" 
              strokeWidth="2" 
              className="drop-shadow-[0_0_8px_rgba(163,230,53,1)]"
            />
          </svg>
        </div>
      </div>

      {/* North Indicator (Rotating around the ring) */}
      <div 
        className="absolute inset-0 pointer-events-none transition-transform duration-75 ease-out"
        style={{ transform: `rotate(${mapRotationDeg}deg)` }}
      >
        <div className="absolute top-1 left-1/2 -translate-x-1/2 text-[8px] font-black text-white px-1 py-0.5 bg-red-600 border border-white/30 rounded-sm leading-none z-[60]">N</div>
        <div className="absolute bottom-1 left-1/2 -translate-x-1/2 text-[8px] font-black text-white/50 leading-none z-[60]">S</div>
        <div className="absolute right-1 top-1/2 -translate-y-1/2 text-[8px] font-black text-white/50 leading-none z-[60]">E</div>
        <div className="absolute left-1 top-1/2 -translate-y-1/2 text-[8px] font-black text-white/50 leading-none z-[60]">W</div>
      </div>
    </div>
  );
}
