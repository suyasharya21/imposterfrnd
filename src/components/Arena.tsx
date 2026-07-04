/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/

import { RigidBody, CuboidCollider, CylinderCollider } from '@react-three/rapier';
import { Grid, Html } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import { useMemo, useRef, useState, useEffect } from 'react';
import * as THREE from 'three';
import { getObstacles } from '../constants';
import { useGameStore } from '../store';
import { Tasks } from './Task';

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

export function Arena() {
  const isMobile = useIsMobile();
  const arenaSeed = useGameStore(state => state.arenaSeed);
  
  const obstacles = useMemo(() => getObstacles(false, arenaSeed), [arenaSeed]);

  return (
    <group>
      <Tasks />
      {/* Floor */}
      <RigidBody type="fixed" name="floor" friction={1} colliders={false} ccd={true}>
        <mesh receiveShadow={!isMobile} position={[0, -0.05, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <planeGeometry args={[200, 200]} />
          <meshStandardMaterial color="#020208" roughness={0.1} metalness={0.9} />
        </mesh>
        <CuboidCollider args={[100, 5, 100]} position={[0, -5, 0]} />
      </RigidBody>
      <Grid position={[0, 0.05, 0]} args={[200, 200]} cellColor="#ff0055" sectionColor="#39ff14" fadeDistance={120} cellThickness={0.5} sectionThickness={2} />

      {/* Ceiling / Roof Grid */}
      <group position={[0, 20, 0]}>
        <Grid args={[200, 200]} cellColor="#39ff14" sectionColor="#ff0055" fadeDistance={150} cellThickness={0.5} sectionThickness={1.5} rotation={[Math.PI, 0, 0]} />
        <mesh rotation={[Math.PI / 2, 0, 0]}>
          <planeGeometry args={[200, 200]} />
          <meshStandardMaterial color="#000000" transparent opacity={0.4} roughness={1} />
        </mesh>
      </group>

      {/* Walls */}
      <Wall name="wall-n" position={[0, 0, -100]} rotation={[0, 0, 0]} isMobile={isMobile} graffiti={['neon_bolt', 'om', 'neon_gun', 'tag1', 'neon_eye']} />
      <Wall name="wall-s" position={[0, 0, 100]} rotation={[0, Math.PI, 0]} isMobile={isMobile} graffiti={['neon_grid', 'chakra', 'neon_skull', 'tag2', 'cyber']} />
      <Wall name="wall-e" position={[100, 0, 0]} rotation={[0, -Math.PI / 2, 0]} isMobile={isMobile} graffiti={['neon_eye', 'lotus', 'neon_bolt', 'hanuman', 'skull']} />
      <Wall name="wall-w" position={[-100, 0, 0]} rotation={[0, Math.PI / 2, 0]} isMobile={isMobile} graffiti={['neon_gun', 'shiva_eye', 'neon_grid', 'om', 'neon_skull']} />
 
      {/* Obstacles */}
      {obstacles.map((obs, i) => {
        if (!obs) return null;
        return (
          <RigidBody 
            key={i} 
            type="fixed" 
            colliders={false}
            name={`obstacle-${i}`}
            position={[obs.position[0], 0, obs.position[2]]}
            rotation={obs.rotation as [number, number, number]}
          >
            {obs.type === 'box' ? (
              <CuboidCollider args={[obs.size[0] / 2, obs.size[1] / 2, obs.size[2] / 2]} position={[0, obs.size[1] / 2, 0]} />
            ) : (
              <CylinderCollider args={[obs.size[1] / 2, obs.size[0] / 2]} position={[0, obs.size[1] / 2, 0]} />
            )}
            <group position={[0, obs.size[1] / 2, 0]}>
              <mesh receiveShadow={!isMobile} castShadow={!isMobile}>
                {obs.type === 'box' ? (
                  <boxGeometry args={obs.size as [number, number, number]} />
                ) : (
                  <cylinderGeometry args={[obs.size[0]/2, obs.size[0]/2, obs.size[1], 16]} />
                )}
                <meshStandardMaterial color="#1a1a2e" roughness={0.6} metalness={0.5} />
                
                {/* Neon accent on obstacles */}
                <mesh position={[0, obs.size[1]/2 - 0.5, 0]}>
                  {obs.type === 'box' ? (
                    <boxGeometry args={[obs.size[0] + 0.1, 0.2, obs.size[2] + 0.1]} />
                  ) : (
                    <cylinderGeometry args={[obs.size[0]/2 + 0.1, obs.size[0]/2 + 0.1, 0.2, 16]} />
                  )}
                  <meshBasicMaterial color={obs.color} toneMapped={false} />
                </mesh>
  
                {/* Graffiti on large walls */}
                {obs.graffitiType && obs.type === 'box' && (
                  <Graffiti type={obs.graffitiType} size={obs.size} />
                )}
              </mesh>
            </group>
          </RigidBody>
        );
      })}
    </group>
  );
}

function Graffiti({ type, size, opacity = 1 }: { type: 'bow' | 'chakra' | 'hanuman' | 'om' | 'lotus' | 'shiva_eye' | 'trishula' | 'tag1' | 'tag2' | 'cyber' | 'skull' | 'neon_bolt' | 'neon_eye' | 'neon_grid' | 'neon_skull' | 'neon_gun', size: [number, number, number], opacity?: number }) {
  // Determine which side to put graffiti on
  const isWide = size[0] > size[2];
  const sidePos = isWide ? [0, 0, size[2] / 2 + 0.05] : [size[0] / 2 + 0.05, 0, 0];
  const sideRot = isWide ? [0, 0, 0] : [0, Math.PI / 2, 0];
  const graffitiScale = Math.min(size[0], size[1], size[2], 8);

  const getGraffitiContent = () => {
    switch (type) {
      case 'bow':
        return (
          <>
            <path d="M5,15 Q15,0 25,15" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            <line x1="15" y1="2" x2="15" y2="25" stroke="currentColor" strokeWidth="1" />
            <path d="M12,25 L15,28 L18,25" fill="none" stroke="currentColor" strokeWidth="1.5" />
          </>
        );
      case 'chakra':
        return (
          <>
            <circle cx="15" cy="15" r="12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeDasharray="2,2" />
            <circle cx="15" cy="15" r="9" fill="none" stroke="currentColor" strokeWidth="1" />
            <circle cx="15" cy="15" r="2" fill="currentColor" />
            {[0, 30, 60, 90, 120, 150, 180, 210, 240, 270, 300, 330].map(deg => (
              <line key={deg} x1="15" y1="15" x2={15 + 9 * Math.cos(deg * Math.PI / 180)} y2={15 + 9 * Math.sin(deg * Math.PI / 180)} stroke="currentColor" strokeWidth="0.8" />
            ))}
          </>
        );
      case 'hanuman':
        return (
          <path d="M15,2 L15,18 M8,22 C8,18 22,18 22,22 L22,28 C22,32 8,32 8,28 Z M15,18 L10,22 M15,18 L20,22" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
        );
      case 'om':
        return (
          <text x="15" y="22" textAnchor="middle" fontSize="22" fill="currentColor" fontFamily="serif" style={{fontWeight: 'bold'}}>ॐ</text>
        );
      case 'lotus':
        return (
          <path d="M15,25 Q10,15 15,5 Q20,15 15,25 M15,25 Q5,15 10,20 Q15,25 15,25 M15,25 Q25,15 20,20 Q15,25 15,25" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
        );
      case 'shiva_eye':
        return (
          <>
            <path d="M5,15 Q15,5 25,15 Q15,25 5,15" fill="none" stroke="currentColor" strokeWidth="1.5" />
            <circle cx="15" cy="15" r="4" fill="none" stroke="currentColor" strokeWidth="1" />
            <circle cx="15" cy="15" r="1.5" fill="currentColor" />
            <path d="M15,8 L15,12 M15,18 L15,22" stroke="currentColor" strokeWidth="1" />
          </>
        );
      case 'trishula':
        return (
          <path d="M15,25 L15,5 M5,10 Q15,15 25,10 M15,5 L12,8 M15,5 L18,8" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        );
      case 'tag1':
        return (
          <text x="15" y="20" textAnchor="middle" fontSize="18" fill="currentColor" fontFamily="cursive" transform="rotate(-15, 15, 20)">NEO-T</text>
        );
      case 'tag2':
        return (
          <text x="15" y="22" textAnchor="middle" fontSize="24" fill="currentColor" fontFamily="Impact" style={{letterSpacing: '-2px'}}>CRASH</text>
        );
      case 'cyber':
        return (
          <text x="15" y="20" textAnchor="middle" fontSize="12" fill="currentColor" fontFamily="monospace">0101_VOID</text>
        );
      case 'skull':
        return (
          <>
            <path d="M10,10 Q15,0 20,10 L22,25 Q15,30 8,25 Z" fill="currentColor" />
            <circle cx="12" cy="15" r="2.5" fill="#000" />
            <circle cx="18" cy="15" r="2.5" fill="#000" />
            <rect x="13" y="22" width="4" height="3" fill="#000" />
          </>
        );
      case 'neon_bolt':
        return (
          <path d="M18,2 L8,16 L14,16 L12,28 L22,14 L16,14 Z" fill="currentColor" />
        );
      case 'neon_eye':
        return (
          <>
            <path d="M2,15 Q15,2 28,15 Q15,28 2,15" fill="none" stroke="currentColor" strokeWidth="2" />
            <circle cx="15" cy="15" r="6" fill="none" stroke="currentColor" strokeWidth="1.5" />
            <circle cx="15" cy="15" r="2" fill="currentColor" />
            <path d="M15,5 L15,8 M15,22 L15,25 M5,15 L8,15 M22,15 L25,15" stroke="currentColor" strokeWidth="1" />
          </>
        );
      case 'neon_grid':
        return (
          <>
            <path d="M0,15 L30,15 M0,20 L30,20 M0,25 L30,25" stroke="currentColor" strokeWidth="0.5" />
            <path d="M15,10 L0,30 M15,10 L30,30 M15,10 L15,30" stroke="currentColor" strokeWidth="0.5" />
          </>
        );
      case 'neon_skull':
        return (
          <path d="M8,10 A7,7 0 1,1 22,10 A7,7 0 0,1 22,16 L20,24 L10,24 L8,16 A7,7 0 0,1 8,10 Z M12,13 A1,1 0 1,0 12,14 Z M18,13 A1,1 0 1,0 18,14 Z" fill="none" stroke="currentColor" strokeWidth="2" />
        );
      case 'neon_gun':
        return (
          <path d="M5,10 L25,10 L25,15 L15,15 L15,25 L10,25 L10,15 L5,15 Z" fill="currentColor" />
        );
    }
  };

  const colors: Record<string, string> = {
    bow: '#39ff14', om: '#39ff14', lotus: '#39ff14', shiva_eye: '#39ff14',
    chakra: '#ff0055', trishula: '#ff0055', hanuman: '#ff0055',
    tag1: '#00ffff', tag2: '#ffcc33', cyber: '#9013fe', skull: '#ffffff',
    neon_bolt: '#ffff00', neon_eye: '#00ffff', neon_grid: '#ff00ff', neon_skull: '#ff5500', neon_gun: '#39ff14'
  };
  const color = colors[type] || '#ffffff';

  return (
    <group position={sidePos as [number, number, number]} rotation={sideRot as [number, number, number]}>
      <mesh>
        <planeGeometry args={[graffitiScale, graffitiScale]} />
        <meshBasicMaterial transparent opacity={0} />
      </mesh>
      <group scale={[graffitiScale/30, -graffitiScale/30, 1]} position={[-graffitiScale/2, graffitiScale/2, 0.01]}>
         <Html transform distanceFactor={graffitiScale * 1.5} pointerEvents="none" portal={{ current: undefined }}>
            <div style={{ 
              color, 
              opacity,
              filter: `drop-shadow(0 0 8px ${color})`, 
              width: '120px', 
              height: '120px', 
              display: 'flex', 
              alignItems: 'center', 
              justifyContent: 'center',
              animation: 'flicker 3s infinite'
            }}>
              <style>{`
                @keyframes flicker {
                  0%, 100% { opacity: 0.8; }
                  50% { opacity: 1; }
                  45%, 55% { opacity: 0.7; }
                }
              `}</style>
              <svg viewBox="0 0 30 30" width="100%" height="100%">
                {getGraffitiContent()}
              </svg>
            </div>
         </Html>
      </group>
    </group>
  );
}

function Wall({ name, position, rotation, isMobile, graffiti = [] }: { name: string, position: [number, number, number], rotation: [number, number, number], isMobile: boolean, graffiti?: ('bow' | 'chakra' | 'hanuman' | 'om' | 'lotus' | 'shiva_eye' | 'trishula' | 'tag1' | 'tag2' | 'cyber' | 'skull' | 'neon_bolt' | 'neon_eye' | 'neon_grid' | 'neon_skull' | 'neon_gun')[] }) {
  return (
    <RigidBody type="fixed" name={name} position={[position[0], 0, position[2]]} rotation={rotation} colliders={false} ccd={true}>
      <CuboidCollider args={[100, 6, 0.5]} position={[0, 6, 0]} />
      {/* Solid Wall */}
      <mesh position={[0, 6, 0]}>
        <boxGeometry args={[200, 12, 1]} />
        <meshStandardMaterial color="#0a0a25" roughness={0.4} metalness={0.6} />
      </mesh>
      
      {/* Decorative Panels */}
      <mesh position={[0, 6, 0.51]}>
        <planeGeometry args={[200, 12]} />
        <meshStandardMaterial 
          color="#1a1a3a" 
          transparent 
          opacity={0.3} 
          roughness={0.2}
        />
      </mesh>

      {/* Graffiti on walls */}
      {graffiti.map((type, i) => (
        <group key={`${type}-${i}`} position={[(i - (graffiti.length - 1) / 2) * 40 - 20, 6, 0.52]}>
          <Graffiti type={type} size={[12, 12, 1]} opacity={0.7} />
        </group>
      ))}

      {/* Glowing Base Line */}
      <mesh position={[0, 0.25, 0.6]}>
        <planeGeometry args={[200, 0.5]} />
        <meshBasicMaterial color="#ff0055" toneMapped={false} />
      </mesh>
      {/* Glowing Top Line */}
      <mesh position={[0, 11.75, 0.6]}>
        <planeGeometry args={[200, 0.5]} />
        <meshBasicMaterial color="#39ff14" toneMapped={false} />
      </mesh>
    </RigidBody>
  );
}
