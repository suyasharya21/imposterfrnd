/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { RigidBody, CuboidCollider, CylinderCollider, InstancedRigidBodies } from '@react-three/rapier';
import { Grid } from '@react-three/drei';
import { useMemo, useRef, useState, useEffect } from 'react';
import * as THREE from 'three';
import { getObstacles, LevelConfig } from '../constants';
import { useGameStore } from '../store';

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

// ---------------------------------------------------------
// Procedural SVG to WebGL Texture Cache
// ---------------------------------------------------------
const textureCache: Record<string, THREE.Texture> = {};

function getGraffitiSvgContent(type: string): string {
  switch (type) {
    case 'bow':
      return `<path d="M5,15 Q15,0 25,15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
              <line x1="15" y1="2" x2="15" y2="25" stroke="currentColor" stroke-width="1" />
              <path d="M12,25 L15,28 L18,25" fill="none" stroke="currentColor" stroke-width="1.5" />`;
    case 'chakra':
      return `<circle cx="15" cy="15" r="12" fill="none" stroke="currentColor" stroke-width="1.5" stroke-dasharray="2,2" />
              <circle cx="15" cy="15" r="9" fill="none" stroke="currentColor" stroke-width="1" />
              <circle cx="15" cy="15" r="2" fill="currentColor" />
              ${[0, 30, 60, 90, 120, 150, 180, 210, 240, 270, 300, 330].map(deg => 
                `<line x1="15" y1="15" x2="${15 + 9 * Math.cos(deg * Math.PI / 180)}" y2="${15 + 9 * Math.sin(deg * Math.PI / 180)}" stroke="currentColor" stroke-width="0.8" />`
              ).join('')}`;
    case 'hanuman':
      return `<path d="M15,2 L15,18 M8,22 C8,18 22,18 22,22 L22,28 C22,32 8,32 8,28 Z M15,18 L10,22 M15,18 L20,22" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round" />`;
    case 'om':
      return `<text x="15" y="22" text-anchor="middle" font-size="22" fill="currentColor" font-family="serif" font-weight="bold">ॐ</text>`;
    case 'lotus':
      return `<path d="M15,25 Q10,15 15,5 Q20,15 15,25 M15,25 Q5,15 10,20 Q15,25 15,25 M15,25 Q25,15 20,20 Q15,25 15,25" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round" />`;
    case 'shiva_eye':
      return `<path d="M5,15 Q15,5 25,15 Q15,25 5,15" fill="none" stroke="currentColor" stroke-width="1.5" />
              <circle cx="15" cy="15" r="4" fill="none" stroke="currentColor" stroke-width="1" />
              <circle cx="15" cy="15" r="1.5" fill="currentColor" />
              <path d="M15,8 L15,12 M15,18 L15,22" stroke="currentColor" stroke-width="1" />`;
    case 'trishula':
      return `<path d="M15,25 L15,5 M5,10 Q15,15 25,10 M15,5 L12,8 M15,5 L18,8" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" />`;
    case 'tag1':
      return `<text x="15" y="20" text-anchor="middle" font-size="18" fill="currentColor" font-family="cursive" transform="rotate(-15, 15, 20)">NEO-T</text>`;
    case 'tag2':
      return `<text x="15" y="22" text-anchor="middle" font-size="24" fill="currentColor" font-family="Impact" letter-spacing="-2px">CRASH</text>`;
    case 'cyber':
      return `<text x="15" y="20" text-anchor="middle" font-size="12" fill="currentColor" font-family="monospace">0101_VOID</text>`;
    case 'skull':
      return `<path d="M10,10 Q15,0 20,10 L22,25 Q15,30 8,25 Z" fill="currentColor" />
              <circle cx="12" cy="15" r="2.5" fill="#000" />
              <circle cx="18" cy="15" r="2.5" fill="#000" />
              <rect x="13" y="22" width="4" height="3" fill="#000" />`;
    case 'neon_bolt':
      return `<path d="M18,2 L8,16 L14,16 L12,28 L22,14 L16,14 Z" fill="currentColor" />`;
    case 'neon_eye':
      return `<path d="M2,15 Q15,2 28,15 Q15,28 2,15" fill="none" stroke="currentColor" stroke-width="2" />
              <circle cx="15" cy="15" r="6" fill="none" stroke="currentColor" stroke-width="1.5" />
              <circle cx="15" cy="15" r="2" fill="currentColor" />
              <path d="M15,5 L15,8 M15,22 L15,25 M5,15 L8,15 M22,15 L25,15" stroke="currentColor" stroke-width="1" />`;
    case 'neon_grid':
      return `<path d="M0,15 L30,15 M0,20 L30,20 M0,25 L30,25" stroke="currentColor" stroke-width="0.5" />
              <path d="M15,10 L0,30 M15,10 L30,30 M15,10 L15,30" stroke="currentColor" stroke-width="0.5" />`;
    case 'neon_skull':
      return `<path d="M8,10 A7,7 0 1,1 22,10 A7,7 0 0,1 22,16 L20,24 L10,24 L8,16 A7,7 0 0,1 8,10 Z M12,13 A1,1 0 1,0 12,14 Z M18,13 A1,1 0 1,0 18,14 Z" fill="none" stroke="currentColor" stroke-width="2" />`;
    case 'neon_gun':
      return `<path d="M5,10 L25,10 L25,15 L15,15 L15,25 L10,25 L10,15 L5,15 Z" fill="currentColor" />`;
    default:
      return '';
  }
}

function getGraffitiTexture(type: string, color: string): THREE.Texture {
  const cacheKey = `${type}-${color}`;
  if (textureCache[cacheKey]) {
    return textureCache[cacheKey];
  }

  const svgContent = getGraffitiSvgContent(type);
  const svgString = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 30 30" width="256" height="256" style="color: ${color}">${svgContent}</svg>`;
  const blob = new Blob([svgString], { type: 'image/svg+xml;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  
  const img = new Image();
  const texture = new THREE.Texture(img);
  img.src = url;
  img.onload = () => {
    texture.needsUpdate = true;
    URL.revokeObjectURL(url);
  };
  
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.magFilter = THREE.LinearFilter;
  
  textureCache[cacheKey] = texture;
  return texture;
}

// ---------------------------------------------------------
// Double-Sided WebGL Plane-based Graffiti Component
// ---------------------------------------------------------
function Graffiti({ type, size, opacity = 1 }: { type: 'bow' | 'chakra' | 'hanuman' | 'om' | 'lotus' | 'shiva_eye' | 'trishula' | 'tag1' | 'tag2' | 'cyber' | 'skull' | 'neon_bolt' | 'neon_eye' | 'neon_grid' | 'neon_skull' | 'neon_gun', size: [number, number, number], opacity?: number }) {
  const isWide = size[0] > size[2];
  const graffitiScale = Math.min(size[0], size[1], size[2], 8);

  const colors: Record<string, string> = {
    bow: '#39ff14', om: '#39ff14', lotus: '#39ff14', shiva_eye: '#39ff14',
    chakra: '#ff0055', trishula: '#ff0055', hanuman: '#ff0055',
    tag1: '#00ffff', tag2: '#ffcc33', cyber: '#9013fe', skull: '#ffffff',
    neon_bolt: '#ffff00', neon_eye: '#00ffff', neon_grid: '#ff00ff', neon_skull: '#ff5500', neon_gun: '#39ff14'
  };
  const color = colors[type] || '#ffffff';

  const texture = useMemo(() => getGraffitiTexture(type, color), [type, color]);

  // Define the two opposite sides for double-sided rendering
  const sides = isWide 
    ? [
        { pos: [0, 0, size[2] / 2 + 0.015] as [number, number, number], rot: [0, 0, 0] as [number, number, number] },
        { pos: [0, 0, -size[2] / 2 - 0.015] as [number, number, number], rot: [0, Math.PI, 0] as [number, number, number] }
      ]
    : [
        { pos: [size[0] / 2 + 0.015, 0, 0] as [number, number, number], rot: [0, Math.PI / 2, 0] as [number, number, number] },
        { pos: [-size[0] / 2 - 0.015, 0, 0] as [number, number, number], rot: [0, -Math.PI / 2, 0] as [number, number, number] }
      ];

  return (
    <>
      {sides.map((side, index) => (
        <mesh 
          key={index} 
          position={side.pos} 
          rotation={side.rot}
        >
          <planeGeometry args={[graffitiScale, graffitiScale]} />
          <meshBasicMaterial 
            map={texture} 
            transparent={true} 
            opacity={opacity}
            toneMapped={false}
            depthWrite={false}
            polygonOffset={true}
            polygonOffsetFactor={-4}
          />
        </mesh>
      ))}
    </>
  );
}

// ---------------------------------------------------------
// Boundary Wall Component
// ---------------------------------------------------------
function Wall({ name, position, rotation, isMobile, arenaSize, graffiti = [] }: { name: string, position: [number, number, number], rotation: [number, number, number], isMobile: boolean, arenaSize: number, graffiti?: ('bow' | 'chakra' | 'hanuman' | 'om' | 'lotus' | 'shiva_eye' | 'trishula' | 'tag1' | 'tag2' | 'cyber' | 'skull' | 'neon_bolt' | 'neon_eye' | 'neon_grid' | 'neon_skull' | 'neon_gun')[] }) {
  const adjustedPosition: [number, number, number] = [position[0], 0, position[2]];
  const halfSize = arenaSize / 2;
  
  // Calculate dynamic offsets for conduits and graffiti
  const step = halfSize * 0.4;
  const conduitOffsets = [-step * 2, -step, 0, step, step * 2];

  return (
    <RigidBody type="fixed" name={name} position={adjustedPosition} rotation={rotation} colliders={false} ccd={true}>
      <CuboidCollider args={[halfSize, 6, 1.5]} position={[0, 6, -1.0]} />
      {/* Solid Wall - Dark Metallic Carbon Fiber look */}
      <mesh position={[0, 6, 0]}>
        <boxGeometry args={[arenaSize, 12, 1]} />
        <meshStandardMaterial color="#030306" roughness={0.25} metalness={0.9} />
      </mesh>
      
      {/* Decorative Panels */}
      <mesh position={[0, 6, 0.51]}>
        <planeGeometry args={[arenaSize, 12]} />
        <meshStandardMaterial 
          color="#0c0c12" 
          transparent 
          opacity={0.3} 
          roughness={0.2}
          metalness={0.8}
        />
      </mesh>

      {/* Vertical Glowing Conduits (Alternating with Graffiti positions) */}
      {conduitOffsets.map((xOffset) => (
        <mesh key={xOffset} position={[xOffset, 6, 0.515]}>
          <cylinderGeometry args={[0.06, 0.06, 12, 8]} />
          <meshBasicMaterial color="#00f0ff" toneMapped={false} />
        </mesh>
      ))}

      {/* Graffiti on walls */}
      {graffiti.map((type, i) => {
        const graffitiOffset = halfSize * 0.4;
        const xPos = (i - (graffiti.length - 1) / 2) * graffitiOffset - (graffitiOffset / 2);
        return (
          <group key={`${type}-${i}`} position={[xPos, 6, 0.52]}>
            <Graffiti type={type} size={[12, 12, 1]} opacity={0.7} />
          </group>
        );
      })}

      {/* Glowing Base Line */}
      <mesh position={[0, 0.25, 0.6]}>
        <planeGeometry args={[arenaSize, 0.5]} />
        <meshBasicMaterial color="#ff0055" toneMapped={false} />
      </mesh>
      {/* Glowing Top Line */}
      <mesh position={[0, 11.75, 0.6]}>
        <planeGeometry args={[arenaSize, 0.5]} />
        <meshBasicMaterial color="#39ff14" toneMapped={false} />
      </mesh>
    </RigidBody>
  );
}

// ---------------------------------------------------------
// Main Arena Component
// ---------------------------------------------------------
export function Arena() {
  const isMobile = useIsMobile();
  const arenaSeed = useGameStore(state => state.arenaSeed);
  const levelConfig = useGameStore(state => state.levelConfig);
  
  const obstacles = useMemo(() => getObstacles(isMobile, arenaSeed, levelConfig), [isMobile, arenaSeed, levelConfig]);

  const boxObstacles = useMemo(() => obstacles.filter(obs => obs && obs.type === 'box'), [obstacles]);
  const cylinderObstacles = useMemo(() => obstacles.filter(obs => obs && obs.type === 'cylinder'), [obstacles]);

  const boxInstances = useMemo(() => {
    return boxObstacles.map((obs, i) => ({
      key: `box-${i}-${obs.position[0]}-${obs.position[2]}`,
      position: [obs.position[0], obs.size[1] / 2, obs.position[2]] as [number, number, number],
      rotation: [obs.rotation[0], obs.rotation[1], obs.rotation[2]] as [number, number, number],
      scale: [obs.size[0], obs.size[1], obs.size[2]] as [number, number, number]
    }));
  }, [boxObstacles]);

  const cylInstances = useMemo(() => {
    return cylinderObstacles.map((obs, i) => ({
      key: `cyl-${i}-${obs.position[0]}-${obs.position[2]}`,
      position: [obs.position[0], obs.size[1] / 2, obs.position[2]] as [number, number, number],
      rotation: [obs.rotation[0], obs.rotation[1], obs.rotation[2]] as [number, number, number],
      scale: [obs.size[0], obs.size[1], obs.size[0]] as [number, number, number]
    }));
  }, [cylinderObstacles]);

  const boxMeshRef = useRef<THREE.InstancedMesh>(null);
  const boxCapRef = useRef<THREE.InstancedMesh>(null);
  const boxBaseRef = useRef<THREE.InstancedMesh>(null);
  const boxConduitRef = useRef<THREE.InstancedMesh>(null);

  const cylMeshRef = useRef<THREE.InstancedMesh>(null);
  const cylCapRef = useRef<THREE.InstancedMesh>(null);
  const cylBaseRef = useRef<THREE.InstancedMesh>(null);
  const cylConduitRef = useRef<THREE.InstancedMesh>(null);

  useEffect(() => {
    const tempObj = new THREE.Object3D();

    // 1. Setup Box Trim Instances
    if (boxCapRef.current && boxBaseRef.current) {
      let boxIdx = 0;
      let conduitIdx = 0;
      const conduitTransforms: { pos: THREE.Vector3; scale: THREE.Vector3; color: string }[] = [];

      boxObstacles.forEach((obs) => {
        // Set rotation for trims
        tempObj.rotation.set(obs.rotation[0], obs.rotation[1], obs.rotation[2]);

        // Cap Trim
        tempObj.position.set(obs.position[0], obs.size[1] - 0.1, obs.position[2]);
        tempObj.scale.set(obs.size[0] + 0.05, 0.2, obs.size[2] + 0.05);
        tempObj.updateMatrix();
        boxCapRef.current!.setMatrixAt(boxIdx, tempObj.matrix);
        boxCapRef.current!.setColorAt(boxIdx, new THREE.Color(obs.color));

        // Base Trim
        tempObj.position.set(obs.position[0], 0.1, obs.position[2]);
        tempObj.scale.set(obs.size[0] + 0.05, 0.2, obs.size[2] + 0.05);
        tempObj.updateMatrix();
        boxBaseRef.current!.setMatrixAt(boxIdx, tempObj.matrix);
        boxBaseRef.current!.setColorAt(boxIdx, new THREE.Color(obs.color));

        boxIdx++;

        // Box corner conduits for tall boxes
        if (obs.size[1] > 6) {
          const wHalf = obs.size[0] / 2;
          const dHalf = obs.size[2] / 2;
          const h = obs.size[1];
          const corners = [
            [wHalf + 0.02, dHalf + 0.02],
            [-wHalf - 0.02, dHalf + 0.02],
            [wHalf + 0.02, -dHalf - 0.02],
            [-wHalf - 0.02, -dHalf - 0.02],
          ];

          corners.forEach(([lx, lz]) => {
            const theta = obs.rotation[1];
            const gx = lx * Math.cos(theta) - lz * Math.sin(theta);
            const gz = lx * Math.sin(theta) + lz * Math.cos(theta);

            conduitTransforms.push({
              pos: new THREE.Vector3(obs.position[0] + gx, h / 2, obs.position[2] + gz),
              scale: new THREE.Vector3(0.04, h, 0.04),
              color: obs.color
            });
          });
        }
      });

      boxCapRef.current.count = boxObstacles.length;
      boxCapRef.current.instanceMatrix.needsUpdate = true;
      if (boxCapRef.current.instanceColor) boxCapRef.current.instanceColor.needsUpdate = true;

      boxBaseRef.current.count = boxObstacles.length;
      boxBaseRef.current.instanceMatrix.needsUpdate = true;
      if (boxBaseRef.current.instanceColor) boxBaseRef.current.instanceColor.needsUpdate = true;

      if (boxConduitRef.current) {
        conduitTransforms.forEach((cond) => {
          tempObj.position.copy(cond.pos);
          tempObj.rotation.set(0, 0, 0);
          tempObj.scale.set(0.08, cond.scale.y, 0.08);
          tempObj.updateMatrix();
          boxConduitRef.current!.setMatrixAt(conduitIdx, tempObj.matrix);
          boxConduitRef.current!.setColorAt(conduitIdx, new THREE.Color(cond.color));
          conduitIdx++;
        });

        boxConduitRef.current.count = conduitTransforms.length;
        boxConduitRef.current.instanceMatrix.needsUpdate = true;
        if (boxConduitRef.current.instanceColor) boxConduitRef.current.instanceColor.needsUpdate = true;
      }
    }

    // 2. Setup Cylinder Trim Instances
    if (cylCapRef.current && cylBaseRef.current) {
      let cylIdx = 0;
      let cylConduitIdx = 0;
      const cylConduitTransforms: { pos: THREE.Vector3; scale: THREE.Vector3; color: string }[] = [];

      cylinderObstacles.forEach((obs) => {
        // Set rotation for trims
        tempObj.rotation.set(obs.rotation[0], obs.rotation[1], obs.rotation[2]);

        // Cap Trim
        tempObj.position.set(obs.position[0], obs.size[1] - 0.1, obs.position[2]);
        tempObj.scale.set(obs.size[0] + 0.05, 0.2, obs.size[0] + 0.05);
        tempObj.updateMatrix();
        cylCapRef.current!.setMatrixAt(cylIdx, tempObj.matrix);
        cylCapRef.current!.setColorAt(cylIdx, new THREE.Color(obs.color));

        // Base Trim
        tempObj.position.set(obs.position[0], 0.1, obs.position[2]);
        tempObj.scale.set(obs.size[0] + 0.05, 0.2, obs.size[0] + 0.05);
        tempObj.updateMatrix();
        cylBaseRef.current!.setMatrixAt(cylIdx, tempObj.matrix);
        cylBaseRef.current!.setColorAt(cylIdx, new THREE.Color(obs.color));

        cylIdx++;

        // Circumference conduits
        if (obs.size[1] > 6) {
          const r = obs.size[0] / 2 + 0.02;
          const h = obs.size[1];
          const angles = [0, Math.PI / 2, Math.PI, -Math.PI / 2];

          angles.forEach((angle) => {
            cylConduitTransforms.push({
              pos: new THREE.Vector3(
                obs.position[0] + r * Math.cos(angle),
                h / 2,
                obs.position[2] + r * Math.sin(angle)
              ),
              scale: new THREE.Vector3(0.04, h, 0.04),
              color: obs.color
            });
          });
        }
      });

      cylCapRef.current.count = cylinderObstacles.length;
      cylCapRef.current.instanceMatrix.needsUpdate = true;
      if (cylCapRef.current.instanceColor) cylCapRef.current.instanceColor.needsUpdate = true;

      cylBaseRef.current.count = cylinderObstacles.length;
      cylBaseRef.current.instanceMatrix.needsUpdate = true;
      if (cylBaseRef.current.instanceColor) cylBaseRef.current.instanceColor.needsUpdate = true;

      if (cylConduitRef.current) {
        cylConduitTransforms.forEach((cond) => {
          tempObj.position.copy(cond.pos);
          tempObj.rotation.set(0, 0, 0);
          tempObj.scale.set(0.08, cond.scale.y, 0.08);
          tempObj.updateMatrix();
          cylConduitRef.current!.setMatrixAt(cylConduitIdx, tempObj.matrix);
          cylConduitRef.current!.setColorAt(cylConduitIdx, new THREE.Color(cond.color));
          cylConduitIdx++;
        });

        cylConduitRef.current.count = cylConduitTransforms.length;
        cylConduitRef.current.instanceMatrix.needsUpdate = true;
        if (cylConduitRef.current.instanceColor) cylConduitRef.current.instanceColor.needsUpdate = true;
      }
    }
  }, [boxObstacles, cylinderObstacles]);

  const halfSize = levelConfig.arenaSize / 2;
  const size = levelConfig.arenaSize;

  return (
    <group>
      {/* Floor */}
      <RigidBody type="fixed" name="floor" friction={1} colliders={false} ccd={true}>
        <mesh receiveShadow={!isMobile} position={[0, -0.05, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <planeGeometry args={[size, size]} />
          <meshStandardMaterial color="#020208" roughness={0.1} metalness={0.9} />
        </mesh>
        <CuboidCollider args={[halfSize, 5, halfSize]} position={[0, -5, 0]} />
      </RigidBody>
      <Grid position={[0, 0.05, 0]} args={[size, size]} cellColor="#ff0055" sectionColor="#39ff14" fadeDistance={120} cellThickness={0.5} sectionThickness={2} />

      {/* Ceiling / Roof Grid */}
      <RigidBody type="fixed" name="ceiling" colliders={false}>
        <group position={[0, 20, 0]}>
          <Grid args={[size, size]} cellColor="#39ff14" sectionColor="#ff0055" fadeDistance={150} cellThickness={0.5} sectionThickness={1.5} rotation={[Math.PI, 0, 0]} />
          <mesh rotation={[Math.PI / 2, 0, 0]}>
            <planeGeometry args={[size, size]} />
            <meshStandardMaterial color="#000000" transparent opacity={0.4} roughness={1} />
          </mesh>
        </group>
      </RigidBody>

      {/* Boundary Walls */}
      <Wall name="wall-n" position={[0, 0, -halfSize]} rotation={[0, 0, 0]} isMobile={isMobile} arenaSize={size} graffiti={['neon_bolt', 'om', 'neon_gun', 'tag1', 'neon_eye']} />
      <Wall name="wall-s" position={[0, 0, halfSize]} rotation={[0, Math.PI, 0]} isMobile={isMobile} arenaSize={size} graffiti={['neon_grid', 'chakra', 'neon_skull', 'tag2', 'cyber']} />
      <Wall name="wall-e" position={[halfSize, 0, 0]} rotation={[0, -Math.PI / 2, 0]} isMobile={isMobile} arenaSize={size} graffiti={['neon_eye', 'lotus', 'neon_bolt', 'hanuman', 'skull']} />
      <Wall name="wall-w" position={[-halfSize, 0, 0]} rotation={[0, Math.PI / 2, 0]} isMobile={isMobile} arenaSize={size} graffiti={['neon_gun', 'shiva_eye', 'neon_grid', 'om', 'neon_skull']} />

      {/* Instanced Box Obstacles wrapped in InstancedRigidBodies */}
      {boxObstacles.length > 0 && (
        <>
          <InstancedRigidBodies instances={boxInstances} type="fixed" colliders="cuboid" ccd={true}>
            <instancedMesh ref={boxMeshRef} args={[null, null, boxObstacles.length]} castShadow receiveShadow={!isMobile} frustumCulled={false}>
              <boxGeometry args={[1, 1, 1]} />
              <meshStandardMaterial color="#05050a" roughness={0.25} metalness={0.9} />
            </instancedMesh>
          </InstancedRigidBodies>
          <instancedMesh ref={boxCapRef} args={[null, null, boxObstacles.length]} frustumCulled={false}>
            <boxGeometry args={[1, 1, 1]} />
            <meshBasicMaterial toneMapped={false} />
          </instancedMesh>
          <instancedMesh ref={boxBaseRef} args={[null, null, boxObstacles.length]} frustumCulled={false}>
            <boxGeometry args={[1, 1, 1]} />
            <meshBasicMaterial toneMapped={false} />
          </instancedMesh>
          <instancedMesh ref={boxConduitRef} args={[null, null, boxObstacles.length * 4]} frustumCulled={false}>
            <cylinderGeometry args={[1, 1, 1, 8]} />
            <meshBasicMaterial toneMapped={false} />
          </instancedMesh>
        </>
      )}

      {/* Instanced Cylinder Obstacles wrapped in InstancedRigidBodies */}
      {cylinderObstacles.length > 0 && (
        <>
          <InstancedRigidBodies instances={cylInstances} type="fixed" colliders="hull" ccd={true}>
            <instancedMesh ref={cylMeshRef} args={[null, null, cylinderObstacles.length]} castShadow receiveShadow={!isMobile} frustumCulled={false}>
              <cylinderGeometry args={[0.5, 0.5, 1, 16]} />
              <meshStandardMaterial color="#05050a" roughness={0.25} metalness={0.9} />
            </instancedMesh>
          </InstancedRigidBodies>
          <instancedMesh ref={cylCapRef} args={[null, null, cylinderObstacles.length]} frustumCulled={false}>
            <cylinderGeometry args={[0.5, 0.5, 1, 16]} />
            <meshBasicMaterial toneMapped={false} />
          </instancedMesh>
          <instancedMesh ref={cylBaseRef} args={[null, null, cylinderObstacles.length]} frustumCulled={false}>
            <cylinderGeometry args={[0.5, 0.5, 1, 16]} />
            <meshBasicMaterial toneMapped={false} />
          </instancedMesh>
          <instancedMesh ref={cylConduitRef} args={[null, null, cylinderObstacles.length * 4]} frustumCulled={false}>
            <cylinderGeometry args={[1, 1, 1, 8]} />
            <meshBasicMaterial toneMapped={false} />
          </instancedMesh>
        </>
      )}

      {/* Render local graffiti decals directly on the walls */}
      {obstacles.map((obs, i) => {
        if (!obs || !obs.graffitiType || obs.type !== 'box') return null;
        return (
          <group 
            key={i} 
            position={[obs.position[0], 0, obs.position[2]]}
            rotation={obs.rotation as [number, number, number]}
          >
            <Graffiti type={obs.graffitiType} size={obs.size} />
          </group>
        );
      })}
    </group>
  );
}
