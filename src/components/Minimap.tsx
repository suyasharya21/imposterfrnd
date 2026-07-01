/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/

import { useMemo, useState, useEffect } from 'react';
import { useGameStore } from '../store';
import { motion } from 'motion/react';
import { getObstacles } from '../constants';

const MAP_SIZE = 150;

export function Minimap() {
  const playerPosition = useGameStore(state => state.playerPosition);
  const playerRotation = useGameStore(state => state.playerRotation);
  const otherPlayers = useGameStore(state => state.otherPlayers);
  const enemies = useGameStore(state => state.enemies);
  const coins = useGameStore(state => state.coins);
  const arenaSeed = useGameStore(state => state.arenaSeed);
  const levelConfig = useGameStore(state => state.levelConfig);
  
  const [isMobile] = useState(() => {
    if (typeof window === 'undefined') return false;
    return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) || window.innerWidth < 768;
  });

  const obstacles = useMemo(() => getObstacles(isMobile, arenaSeed, levelConfig), [isMobile, arenaSeed, levelConfig]);
  const activeEnemies = useMemo(() => enemies.filter(e => e.state === 'active'), [enemies]);

  const arenaSize = levelConfig.arenaSize;
  const arenaHalfSize = arenaSize / 2;

  const ZOOM = 1.2; 
  const pixelsPerUnit = (MAP_SIZE / arenaSize) * ZOOM;

  const boundaryWalls = useMemo(() => [
    { name: 'wall-n', position: [0, 0, -arenaHalfSize] as [number, number, number], size: [arenaSize, 12, 1] as [number, number, number], rotation: [0, 0, 0] as [number, number, number], color: '#39ff14' },
    { name: 'wall-s', position: [0, 0, arenaHalfSize] as [number, number, number], size: [arenaSize, 12, 1] as [number, number, number], rotation: [0, Math.PI, 0] as [number, number, number], color: '#ff0055' },
    { name: 'wall-e', position: [arenaHalfSize, 0, 0] as [number, number, number], size: [arenaSize, 12, 1] as [number, number, number], rotation: [0, -Math.PI / 2, 0] as [number, number, number], color: '#00f0ff' },
    { name: 'wall-w', position: [-arenaHalfSize, 0, 0] as [number, number, number], size: [arenaSize, 12, 1] as [number, number, number], rotation: [0, Math.PI / 2, 0] as [number, number, number], color: '#ffff00' }
  ], [arenaSize, arenaHalfSize]);

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
          {/* Arena Outer Boundary & Cyber-Grid Background */}
          <div 
            className="absolute border-2 border-lime-400/30 pointer-events-none z-0"
            style={{
              left: ( -arenaHalfSize ) * pixelsPerUnit + (MAP_SIZE / 2),
              top: ( -arenaHalfSize ) * pixelsPerUnit + (MAP_SIZE / 2),
              width: arenaSize * pixelsPerUnit,
              height: arenaSize * pixelsPerUnit,
              backgroundImage: `
                radial-gradient(circle, transparent 60%, rgba(163,230,53,0.05) 100%),
                linear-gradient(to right, rgba(163, 230, 53, 0.08) 1px, transparent 1px),
                linear-gradient(to bottom, rgba(163, 230, 53, 0.08) 1px, transparent 1px)
              `,
              backgroundSize: `auto, ${10 * pixelsPerUnit}px ${10 * pixelsPerUnit}px`,
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
                  width: `${Math.max(3, w)}px`,
                  height: `${Math.max(3, isCylinder ? w : d)}px`,
                  transform: `translate(-50%, -50%) rotate(${-(obs.rotation[1] * 180) / Math.PI}deg)`,
                }}
              />
            );
          })}

          {/* Boundary Walls */}
          {boundaryWalls.map((wall) => {
            const { x, z } = getMapCoords(wall.position);
            const w = wall.size[0] * pixelsPerUnit;
            const d = wall.size[2] * pixelsPerUnit;
            
            return (
              <div 
                key={wall.name}
                className="absolute z-[2]"
                style={{ 
                  left: `${x + MAP_SIZE / 2}px`, 
                  top: `${z + MAP_SIZE / 2}px`,
                  width: `${Math.max(3, w)}px`,
                  height: `${Math.max(3, d)}px`,
                  backgroundColor: wall.color + 'cc',
                  border: `1px solid ${wall.color}`,
                  boxShadow: `0 0 10px ${wall.color}`,
                  transform: `translate(-50%, -50%) rotate(${-(wall.rotation[1] * 180) / Math.PI}deg)`,
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
              className="absolute w-2.5 h-2.5 rounded-full z-[10] bg-[#ff0000] shadow-[0_0_10px_#ff0000] animate-pulse"
              style={{ 
                left: `${x + MAP_SIZE / 2}px`, 
                top: `${z + MAP_SIZE / 2}px`,
                transform: 'translate(-50%, -50%)'
              }}
            />
          );
        })}

        {/* Other Players (Humans - Neon Green Dots) */}
        {Object.values(otherPlayers).map(player => {
          if (player.state === 'disabled') return null;
          const { x, z } = getMapCoords(player.position);
          return (
            <div 
              key={player.id}
              className="absolute w-2.5 h-2.5 bg-[#39ff14] rounded-full shadow-[0_0_10px_#39ff14] z-[15]"
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
