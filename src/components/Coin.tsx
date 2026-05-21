import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { Sphere, Cylinder } from '@react-three/drei';
import * as THREE from 'three';
import { RigidBody, CuboidCollider } from '@react-three/rapier';
import { useGameStore, CoinData } from '../store';

export function Coin({ data }: { data: CoinData }) {
  const meshRef = useRef<THREE.Mesh>(null);
  const collectCoin = useGameStore(state => state.collectCoin);

  useFrame((state) => {
    if (meshRef.current) {
      meshRef.current.rotation.y += 0.05;
      meshRef.current.position.y = data.position[1] + Math.sin(state.clock.elapsedTime * 3) * 0.2;
    }
  });

  const onCollision = (e: any) => {
    const other = e.other.rigidBodyObject;
    if (other && other.userData && other.userData.name) {
      if (other.userData.name === 'player') {
        collectCoin(data.id);
      } else if (other.userData.name.startsWith('bot-')) {
        collectCoin(data.id, other.userData.name);
      }
    }
  };

  const isLoot = data.id.includes('loot');

  return (
    <RigidBody
      type="fixed"
      colliders={false}
      sensor
      onIntersectionEnter={onCollision}
      position={[data.position[0], data.position[1], data.position[2]]}
    >
      <CuboidCollider args={[0.5, 0.8, 0.5]} />
      <group ref={meshRef as any}>
        {/* The Coin Body */}
        <Cylinder args={[isLoot ? 0.6 : 0.4, isLoot ? 0.6 : 0.4, 0.1, 16]} rotation={[Math.PI / 2, 0, 0]}>
          <meshStandardMaterial 
            color={isLoot ? "#FF4500" : "#FFD700"} 
            emissive={isLoot ? "#FF4500" : "#FFD700"} 
            emissiveIntensity={isLoot ? 1.0 : 0.5} 
            metalness={0.9} 
            roughness={0.1} 
          />
        </Cylinder>
        
        {/* Glow */}
        <Sphere args={[isLoot ? 0.8 : 0.5]}>
          <meshBasicMaterial 
            color={isLoot ? "#FF4500" : "#FFD700"} 
            transparent 
            opacity={isLoot ? 0.25 : 0.15} 
            toneMapped={false} 
          />
        </Sphere>
      </group>
    </RigidBody>
  );
}
