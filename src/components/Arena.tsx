/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/

import { RigidBody, CuboidCollider, InstancedRigidBodies, InstancedRigidBodyProps } from '@react-three/rapier';
import { Grid } from '@react-three/drei';
import { useMemo, useState, useEffect, useRef } from 'react';
import * as THREE from 'three';
import { getObstacles, LEVELS } from '../constants';
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

// Procedural SVG to WebGL Texture Cache
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
  
  const base64Content = window.btoa(unescape(encodeURIComponent(svgString)));
  const dataUri = `data:image/svg+xml;base64,${base64Content}`;
  
  const img = new Image();
  const texture = new THREE.Texture(img);
  img.src = dataUri;
  img.onload = () => {
    texture.needsUpdate = true;
  };
  
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.magFilter = THREE.LinearFilter;
  
  textureCache[cacheKey] = texture;
  return texture;
}

export function Arena() {
  const isMobile = useIsMobile();
  const arenaSeed = useGameStore(state => state.arenaSeed);
  const levelConfig = useGameStore(state => state.levelConfig);
  const obstacles = useMemo(() => getObstacles(isMobile, arenaSeed, levelConfig), [isMobile, arenaSeed, levelConfig]);

  // Pre-calculate instances to reduce draw calls
  const { boxData, cylinderData, graffitis } = useMemo(() => {
    const boxes: any[] = [];
    const cylinders: any[] = [];
    const graffitisData: any[] = [];

    obstacles.forEach((obs, i) => {
      if (!obs) return;
      
      const euler = new THREE.Euler(obs.rotation[0], obs.rotation[1], obs.rotation[2]);
      const quaternion = new THREE.Quaternion().setFromEuler(euler);

      if (obs.type === 'box') {
        boxes.push({
          key: `box-${i}`,
          position: [obs.position[0], obs.size[1] / 2, obs.position[2]] as [number, number, number],
          rotation: [quaternion.x, quaternion.y, quaternion.z, quaternion.w],
          scale: obs.size as [number, number, number],
          userData: { color: obs.color, size: obs.size }
        });

        if (obs.graffitiType) {
          graffitisData.push({ type: obs.graffitiType, size: obs.size, position: obs.position, rotation: obs.rotation });
        }
      } else {
        cylinders.push({
          key: `cyl-${i}`,
          position: [obs.position[0], obs.size[1] / 2, obs.position[2]] as [number, number, number],
          rotation: [quaternion.x, quaternion.y, quaternion.z, quaternion.w],
          scale: [obs.size[0], obs.size[1], obs.size[0]], 
          userData: { color: obs.color, size: obs.size }
        });
      }
    });

    return { boxData: boxes, cylinderData: cylinders, graffitis: graffitisData };
  }, [obstacles]);

  const boxMeshRef = useRef<THREE.InstancedMesh>(null);
  const boxTrimRef = useRef<THREE.InstancedMesh>(null);
  const cylMeshRef = useRef<THREE.InstancedMesh>(null);
  const cylTrimRef = useRef<THREE.InstancedMesh>(null);

  useEffect(() => {
    const tempColor = new THREE.Color();
    const tempMatrix = new THREE.Matrix4();
    const tempPosition = new THREE.Vector3();
    const tempRotation = new THREE.Quaternion();
    const tempScale = new THREE.Vector3();

    if (boxMeshRef.current && boxTrimRef.current) {
      boxData.forEach((data, i) => {
        tempColor.set((data.userData as any).color);
        boxMeshRef.current!.setColorAt(i, tempColor);
        boxTrimRef.current!.setColorAt(i, tempColor);

        // Position trim near the top of the box
        tempPosition.fromArray(data.position as [number, number, number]);
        const size = (data.userData as any).size;
        tempPosition.y += (size[1] / 2) - 0.1; // Top offset
        tempRotation.fromArray(data.rotation as any);
        tempScale.set(size[0] + 0.05, 0.2, size[2] + 0.05);
        
        tempMatrix.compose(tempPosition, tempRotation, tempScale);
        boxTrimRef.current!.setMatrixAt(i, tempMatrix);

        // Manually set main box mesh matrices to resolve static instanced rigid body visibility desyncs
        const boxPos = new THREE.Vector3().fromArray(data.position);
        const boxRot = new THREE.Quaternion().fromArray(data.rotation);
        const boxScale = new THREE.Vector3().fromArray(data.scale);
        const boxMatrix = new THREE.Matrix4().compose(boxPos, boxRot, boxScale);
        boxMeshRef.current!.setMatrixAt(i, boxMatrix);
      });
      if (boxMeshRef.current.instanceColor) boxMeshRef.current.instanceColor.needsUpdate = true;
      boxMeshRef.current.instanceMatrix.needsUpdate = true;
      boxTrimRef.current.instanceColor!.needsUpdate = true;
      boxTrimRef.current.instanceMatrix.needsUpdate = true;
    }

    if (cylMeshRef.current && cylTrimRef.current) {
      cylinderData.forEach((data, i) => {
        tempColor.set((data.userData as any).color);
        cylMeshRef.current!.setColorAt(i, tempColor);
        cylTrimRef.current!.setColorAt(i, tempColor);

        tempPosition.fromArray(data.position as [number, number, number]);
        const size = (data.userData as any).size;
        tempPosition.y += (size[1] / 2) - 0.1; // Top offset
        tempRotation.fromArray(data.rotation as any);
        tempScale.set(size[0] + 0.05, 0.2, size[0] + 0.05);
        
        tempMatrix.compose(tempPosition, tempRotation, tempScale);
        cylTrimRef.current!.setMatrixAt(i, tempMatrix);

        // Manually set main cylinder mesh matrices to resolve static instanced rigid body visibility desyncs
        const cylPos = new THREE.Vector3().fromArray(data.position);
        const cylRot = new THREE.Quaternion().fromArray(data.rotation);
        const cylScale = new THREE.Vector3().fromArray(data.scale);
        const cylMatrix = new THREE.Matrix4().compose(cylPos, cylRot, cylScale);
        cylMeshRef.current!.setMatrixAt(i, cylMatrix);
      });
      if (cylMeshRef.current.instanceColor) cylMeshRef.current.instanceColor.needsUpdate = true;
      cylMeshRef.current.instanceMatrix.needsUpdate = true;
      cylTrimRef.current.instanceColor!.needsUpdate = true;
      cylTrimRef.current.instanceMatrix.needsUpdate = true;
    }
  }, [boxData, cylinderData]);

  const size = levelConfig.arenaSize;
  const halfSize = size / 2;

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

      {/* Main Walls with Thicker boundary wall colliders */}
      <Wall name="wall-n" position={[0, 0, -halfSize]} rotation={[0, 0, 0]} arenaSize={size} />
      <Wall name="wall-s" position={[0, 0, halfSize]} rotation={[0, Math.PI, 0]} arenaSize={size} />
      <Wall name="wall-e" position={[halfSize, 0, 0]} rotation={[0, -Math.PI / 2, 0]} arenaSize={size} />
      <Wall name="wall-w" position={[-halfSize, 0, 0]} rotation={[0, Math.PI / 2, 0]} arenaSize={size} />

      {/* Instanced Boxes */}
      {boxData.length > 0 && (
        <InstancedRigidBodies instances={boxData} colliders="cuboid" type="fixed" ccd={true}>
          <instancedMesh ref={boxMeshRef} args={[null, null, boxData.length]} receiveShadow={!isMobile} castShadow={!isMobile} frustumCulled={false}>
            <boxGeometry args={[1, 1, 1]} />
            <meshStandardMaterial color="#05050a" roughness={0.25} metalness={0.9} />
          </instancedMesh>
        </InstancedRigidBodies>
      )}

      {/* Instanced Box Trims (Visual Only, No Physics) */}
      {boxData.length > 0 && (
        <instancedMesh ref={boxTrimRef} args={[null, null, boxData.length]} frustumCulled={false}>
          <boxGeometry args={[1, 1, 1]} />
          <meshBasicMaterial toneMapped={false} />
        </instancedMesh>
      )}

      {/* Instanced Cylinders */}
      {cylinderData.length > 0 && (
        <InstancedRigidBodies instances={cylinderData} colliders="hull" type="fixed" ccd={true}>
          <instancedMesh ref={cylMeshRef} args={[null, null, cylinderData.length]} receiveShadow={!isMobile} castShadow={!isMobile} frustumCulled={false}>
            <cylinderGeometry args={[0.5, 0.5, 1, 16]} />
            <meshStandardMaterial color="#05050a" roughness={0.25} metalness={0.9} />
          </instancedMesh>
        </InstancedRigidBodies>
      )}

      {/* Instanced Cylinder Trims (Visual Only, No Physics) */}
      {cylinderData.length > 0 && (
        <instancedMesh ref={cylTrimRef} args={[null, null, cylinderData.length]} frustumCulled={false}>
          <cylinderGeometry args={[0.5, 0.5, 1, 16]} />
          <meshBasicMaterial toneMapped={false} />
        </instancedMesh>
      )}

      {/* WebGL Pure Texture Graffiti (No HTML DOM) */}
      {graffitis.map((graf, i) => (
        <WebGLGraffiti key={i} type={graf.type} size={graf.size} position={graf.position} rotation={graf.rotation} />
      ))}
    </group>
  );
}

// WebGL Graffiti Component using flat geometry and cached SVG base64 textures
function WebGLGraffiti({ type, size, position, rotation }: { type: string, size: [number, number, number], position: [number, number, number], rotation: [number, number, number] }) {
  const colors: Record<string, string> = {
    bow: '#39ff14', om: '#39ff14', lotus: '#39ff14', shiva_eye: '#39ff14',
    chakra: '#ff0055', trishula: '#ff0055', hanuman: '#ff0055',
    tag1: '#00ffff', tag2: '#ffcc33', cyber: '#9013fe', skull: '#ffffff',
    neon_bolt: '#ffff00', neon_eye: '#00ffff', neon_grid: '#ff00ff', neon_skull: '#ff5500', neon_gun: '#39ff14'
  };
  const color = colors[type] || '#ffffff';
  const texture = useMemo(() => getGraffitiTexture(type, color), [type, color]);

  const isWide = size[0] > size[2];
  const sidePos = isWide ? [0, 0, size[2] / 2 + 0.02] : [size[0] / 2 + 0.02, 0, 0];
  const sideRot = isWide ? [0, 0, 0] : [0, Math.PI / 2, 0];
  const graffitiScale = Math.min(size[0], size[1], size[2], 8);

  return (
    <group position={position} rotation={rotation as [number, number, number]}>
      {/* Front Face */}
      <mesh position={sidePos as [number, number, number]} rotation={sideRot as [number, number, number]}>
        <planeGeometry args={[graffitiScale, graffitiScale]} />
        <meshBasicMaterial map={texture} transparent={true} opacity={0.7} toneMapped={false} />
      </mesh>
      {/* Back Face */}
      <mesh 
        position={[-sidePos[0], sidePos[1], -sidePos[2]] as [number, number, number]} 
        rotation={[sideRot[0], sideRot[1] + Math.PI, sideRot[2]] as [number, number, number]}
      >
        <planeGeometry args={[graffitiScale, graffitiScale]} />
        <meshBasicMaterial map={texture} transparent={true} opacity={0.7} toneMapped={false} />
      </mesh>
    </group>
  );
}

function Wall({ name, position, rotation, arenaSize }: { name: string, position: [number, number, number], rotation: [number, number, number], arenaSize: number }) {
  const wallHeight = 12;
  const halfSize = arenaSize / 2;

  return (
    <RigidBody type="fixed" name={name} position={position} rotation={rotation} colliders={false} ccd={true}>
      {/* Thicker 3-unit boundary collider positioned slightly back to prevent tunneling */}
      <CuboidCollider args={[halfSize, wallHeight / 2, 1.5]} position={[0, wallHeight / 2, -1.0]} />
      
      <mesh position={[0, wallHeight / 2, 0]}>
        <boxGeometry args={[arenaSize, wallHeight, 1]} />
        <meshStandardMaterial color="#0a0a25" roughness={0.4} metalness={0.6} />
      </mesh>
      
      <mesh position={[0, wallHeight / 2, 0.51]}>
        <planeGeometry args={[arenaSize, wallHeight]} />
        <meshStandardMaterial color="#1a1a3a" transparent opacity={0.3} roughness={0.2} />
      </mesh>

      <mesh position={[0, 0.25, 0.6]}>
        <planeGeometry args={[arenaSize, 0.5]} />
        <meshBasicMaterial color="#ff0055" toneMapped={false} />
      </mesh>
      <mesh position={[0, wallHeight - 0.25, 0.6]}>
        <planeGeometry args={[arenaSize, 0.5]} />
        <meshBasicMaterial color="#39ff14" toneMapped={false} />
      </mesh>
    </RigidBody>
  );
}
