/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { InstancedRigidBodies, RigidBody, CuboidCollider } from '@react-three/rapier';
import { Grid, Text } from '@react-three/drei';
import { useMemo, useRef, useState, useEffect, useLayoutEffect } from 'react';
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

const colors: Record<string, string> = {
  bow: '#39ff14', om: '#39ff14', lotus: '#39ff14', shiva_eye: '#39ff14',
  chakra: '#ff0055', trishula: '#ff0055', hanuman: '#ff0055',
  tag1: '#00ffff', tag2: '#ffcc33', cyber: '#9013fe', skull: '#ffffff',
  neon_bolt: '#ffff00', neon_eye: '#00ffff', neon_grid: '#ff00ff', neon_skull: '#ff5500', neon_gun: '#39ff14'
};

function getGraffitiText(type: string): string {
  switch (type) {
    case 'bow': return '🏹';
    case 'chakra': return '☸️';
    case 'hanuman': return '⚔️';
    case 'om': return 'ॐ';
    case 'lotus': return '🪷';
    case 'shiva_eye': return '👁️';
    case 'trishula': return '🔱';
    case 'tag1': return 'NEO-T';
    case 'tag2': return 'CRASH';
    case 'cyber': return 'VOID';
    case 'skull': return '💀';
    case 'neon_bolt': return '⚡';
    case 'neon_eye': return '👁️';
    case 'neon_grid': return '🌐';
    case 'neon_skull': return '💀';
    case 'neon_gun': return '🔫';
    default: return '';
  }
}

function Graffiti({ type, size, opacity = 1 }: { type: string, size: [number, number, number], opacity?: number }) {
  const isWide = size[0] > size[2];
  const sidePos = isWide ? [0, 0, size[2] / 2 + 0.1] : [size[0] / 2 + 0.1, 0, 0];
  const sideRot = isWide ? [0, 0, 0] : [0, Math.PI / 2, 0];
  const graffitiScale = Math.min(size[0], size[1], size[2], 8);

  const color = colors[type] || '#ffffff';
  const text = getGraffitiText(type);

  return (
    <group position={sidePos as [number, number, number]} rotation={sideRot as [number, number, number]}>
      <Text
        color={color}
        fontSize={graffitiScale * 0.4}
        maxWidth={graffitiScale}
        anchorX="center"
        anchorY="middle"
        position={[0, 0, 0]}
      >
        {text}
        <meshStandardMaterial 
          color={color} 
          emissive={color} 
          emissiveIntensity={2} 
          toneMapped={false}
          transparent
          opacity={opacity}
        />
      </Text>
    </group>
  );
}

export function Arena() {
  const isMobile = useIsMobile();
  const arenaSeed = useGameStore(state => state.arenaSeed);
  const otherPlayers = useGameStore(state => state.otherPlayers);
  
  const obstacles = useMemo(() => getObstacles(false, arenaSeed), [arenaSeed]);

  // Instancing Wall boundaries (North, South, East, West)
  const wallInstances = useMemo(() => {
    return [
      { key: 'wall-n', position: [0, 6, -100] as [number, number, number], rotation: [0, 0, 0] as [number, number, number], scale: [200, 12, 1] as [number, number, number] },
      { key: 'wall-s', position: [0, 6, 100] as [number, number, number], rotation: [0, Math.PI, 0] as [number, number, number], scale: [200, 12, 1] as [number, number, number] },
      { key: 'wall-e', position: [100, 6, 0] as [number, number, number], rotation: [0, -Math.PI / 2, 0] as [number, number, number], scale: [200, 12, 1] as [number, number, number] },
      { key: 'wall-w', position: [-100, 6, 0] as [number, number, number], rotation: [0, Math.PI / 2, 0] as [number, number, number], scale: [200, 12, 1] as [number, number, number] }
    ];
  }, []);

  // Instancing Obstacles
  const obstacleInstances = useMemo(() => {
    return obstacles.map((obs, idx) => ({
      key: `obstacle-${idx}`,
      position: [obs.position[0], obs.size[1] / 2, obs.position[2]] as [number, number, number],
      rotation: obs.rotation as [number, number, number],
      scale: obs.size as [number, number, number]
    }));
  }, [obstacles]);

  // Instancing Obstacle Accents
  const greenAccentInstances = useMemo(() => {
    return obstacles
      .map((obs, idx) => ({ obs, idx }))
      .filter(({ obs }) => obs.color === '#39ff14')
      .map(({ obs, idx }) => ({
        key: `green-accent-${idx}`,
        position: [obs.position[0], obs.size[1] - 0.1, obs.position[2]],
        rotation: obs.rotation,
        scale: [obs.size[0] + 0.1, 0.2, obs.size[2] + 0.1]
      }));
  }, [obstacles]);

  const pinkAccentInstances = useMemo(() => {
    return obstacles
      .map((obs, idx) => ({ obs, idx }))
      .filter(({ obs }) => obs.color !== '#39ff14')
      .map(({ obs, idx }) => ({
        key: `pink-accent-${idx}`,
        position: [obs.position[0], obs.size[1] - 0.1, obs.position[2]],
        rotation: obs.rotation,
        scale: [obs.size[0] + 0.1, 0.2, obs.size[2] + 0.1]
      }));
  }, [obstacles]);

  const wallsMeshRef = useRef<THREE.InstancedMesh>(null);
  const obstaclesMeshRef = useRef<THREE.InstancedMesh>(null);
  const greenAccentsMeshRef = useRef<THREE.InstancedMesh>(null);
  const pinkAccentsMeshRef = useRef<THREE.InstancedMesh>(null);

  const tempObject = useMemo(() => new THREE.Object3D(), []);

  useLayoutEffect(() => {
    if (wallsMeshRef.current) {
      wallInstances.forEach((w, idx) => {
        tempObject.position.set(w.position[0], w.position[1], w.position[2]);
        tempObject.rotation.set(w.rotation[0], w.rotation[1], w.rotation[2]);
        tempObject.scale.set(w.scale[0], w.scale[1], w.scale[2]);
        tempObject.updateMatrix();
        wallsMeshRef.current!.setMatrixAt(idx, tempObject.matrix);
      });
      wallsMeshRef.current.instanceMatrix.needsUpdate = true;
    }
  }, [wallInstances, tempObject]);

  useLayoutEffect(() => {
    if (obstaclesMeshRef.current) {
      obstacleInstances.forEach((obs, idx) => {
        tempObject.position.set(obs.position[0], obs.position[1], obs.position[2]);
        tempObject.rotation.set(obs.rotation[0], obs.rotation[1], obs.rotation[2]);
        tempObject.scale.set(obs.scale[0], obs.scale[1], obs.scale[2]);
        tempObject.updateMatrix();
        obstaclesMeshRef.current!.setMatrixAt(idx, tempObject.matrix);
      });
      obstaclesMeshRef.current.instanceMatrix.needsUpdate = true;
    }
  }, [obstacleInstances, tempObject]);

  useLayoutEffect(() => {
    if (greenAccentsMeshRef.current) {
      greenAccentInstances.forEach((accent, idx) => {
        tempObject.position.set(accent.position[0], accent.position[1], accent.position[2]);
        tempObject.rotation.set(accent.rotation[0], accent.rotation[1], accent.rotation[2]);
        tempObject.scale.set(accent.scale[0], accent.scale[1], accent.scale[2]);
        tempObject.updateMatrix();
        greenAccentsMeshRef.current!.setMatrixAt(idx, tempObject.matrix);
      });
      greenAccentsMeshRef.current.instanceMatrix.needsUpdate = true;
    }
  }, [greenAccentInstances, tempObject]);

  useLayoutEffect(() => {
    if (pinkAccentsMeshRef.current) {
      pinkAccentInstances.forEach((accent, idx) => {
        tempObject.position.set(accent.position[0], accent.position[1], accent.position[2]);
        tempObject.rotation.set(accent.rotation[0], accent.rotation[1], accent.rotation[2]);
        tempObject.scale.set(accent.scale[0], accent.scale[1], accent.scale[2]);
        tempObject.updateMatrix();
        pinkAccentsMeshRef.current!.setMatrixAt(idx, tempObject.matrix);
      });
      pinkAccentsMeshRef.current.instanceMatrix.needsUpdate = true;
    }
  }, [pinkAccentInstances, tempObject]);

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

      {/* Instanced Boundary Walls */}
      <InstancedRigidBodies instances={wallInstances} type="fixed" colliders="cuboid">
        <instancedMesh ref={wallsMeshRef} args={[null, null, 4]} castShadow={!isMobile} receiveShadow={!isMobile}>
          <boxGeometry />
          <meshStandardMaterial color="#0a0a25" roughness={0.4} metalness={0.6} />
        </instancedMesh>
      </InstancedRigidBodies>

      {/* Instanced Obstacles */}
      <InstancedRigidBodies instances={obstacleInstances} type="fixed" colliders="cuboid">
        <instancedMesh ref={obstaclesMeshRef} args={[null, null, obstacleInstances.length]} castShadow={!isMobile} receiveShadow={!isMobile}>
          <boxGeometry />
          <meshStandardMaterial color="#1a1a2e" roughness={0.6} metalness={0.5} />
        </instancedMesh>
      </InstancedRigidBodies>

      {/* Instanced Visual Accents */}
      <instancedMesh ref={greenAccentsMeshRef} args={[null, null, greenAccentInstances.length]} castShadow={false} receiveShadow={false}>
        <boxGeometry />
        <meshBasicMaterial color="#39ff14" toneMapped={false} />
      </instancedMesh>

      <instancedMesh ref={pinkAccentsMeshRef} args={[null, null, pinkAccentInstances.length]} castShadow={false} receiveShadow={false}>
        <boxGeometry />
        <meshBasicMaterial color="#ff0055" toneMapped={false} />
      </instancedMesh>

      {/* Decorative Wall Accents & Lines */}
      {wallInstances.map((w, idx) => (
        <group key={`wall-lines-${idx}`} position={[w.position[0], 0, w.position[2]]} rotation={w.rotation as [number, number, number]}>
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
        </group>
      ))}

      {/* Wall Graffiti */}
      {/* North Wall Graffiti */}
      {['neon_bolt', 'om', 'neon_gun', 'tag1', 'neon_eye'].map((type, i) => (
        <group key={`n-graffiti-${i}`} position={[(i - 2) * 40 - 20, 6, -99.4]} rotation={[0, 0, 0]}>
          <Graffiti type={type} size={[12, 12, 1]} opacity={0.7} />
        </group>
      ))}
      {/* South Wall Graffiti */}
      {['neon_grid', 'chakra', 'neon_skull', 'tag2', 'cyber'].map((type, i) => (
        <group key={`s-graffiti-${i}`} position={[(i - 2) * 40 - 20, 6, 99.4]} rotation={[0, Math.PI, 0]}>
          <Graffiti type={type} size={[12, 12, 1]} opacity={0.7} />
        </group>
      ))}
      {/* East Wall Graffiti */}
      {['neon_eye', 'lotus', 'neon_bolt', 'hanuman', 'skull'].map((type, i) => (
        <group key={`e-graffiti-${i}`} position={[99.4, 6, (i - 2) * 40 - 20]} rotation={[0, -Math.PI / 2, 0]}>
          <Graffiti type={type} size={[12, 12, 1]} opacity={0.7} />
        </group>
      ))}
      {/* West Wall Graffiti */}
      {['neon_gun', 'shiva_eye', 'neon_grid', 'om', 'neon_skull'].map((type, i) => (
        <group key={`w-graffiti-${i}`} position={[-99.4, 6, (i - 2) * 40 - 20]} rotation={[0, Math.PI / 2, 0]}>
          <Graffiti type={type} size={[12, 12, 1]} opacity={0.7} />
        </group>
      ))}

      {/* Obstacle Graffiti */}
      {obstacles.map((obs, i) => {
        if (!obs || !obs.graffitiType || obs.type !== 'box') return null;
        return (
          <group key={`obs-graffiti-${i}`} position={[obs.position[0], obs.size[1] / 2, obs.position[2]]} rotation={obs.rotation as [number, number, number]}>
            <Graffiti type={obs.graffitiType} size={obs.size} />
          </group>
        );
      })}
    </group>
  );
}
