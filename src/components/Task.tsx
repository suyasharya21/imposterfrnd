import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { useGameStore } from '../store';

function TaskItem({ task }: { task: { id: string, x: number, z: number } }) {
  const ringRef = useRef<THREE.Mesh>(null);
  const lightRef = useRef<THREE.PointLight>(null);

  useFrame((state) => {
    const time = state.clock.getElapsedTime();
    // Pulse scale area between 0.7 and 1.3
    const scale = 1.0 + Math.sin(time * 3) * 0.3;
    if (ringRef.current) {
      ringRef.current.scale.set(scale, scale, 1);
    }
    if (lightRef.current) {
      lightRef.current.intensity = 1.5 + Math.sin(time * 3) * 0.5;
    }
  });

  return (
    <group position={[task.x, 0.05, task.z]}>
      {/* Neon Ring flat on floor - red neon pulsing */}
      <mesh ref={ringRef} rotation={[-Math.PI / 2, 0, 0]} receiveShadow={false}>
        <ringGeometry args={[1.5, 1.8, 32]} />
        <meshBasicMaterial color="#ff0055" toneMapped={false} transparent opacity={0.8} />
      </mesh>

      {/* Center Mechanical Stand */}
      <mesh position={[0, 0.15, 0]}>
        <cylinderGeometry args={[0.2, 0.3, 0.3, 16]} />
        <meshStandardMaterial color="#1a1a2e" roughness={0.5} metalness={0.8} />
      </mesh>

      {/* Hovering Neon Core - red neon */}
      <mesh position={[0, 0.5, 0]}>
        <sphereGeometry args={[0.12, 16, 16]} />
        <meshBasicMaterial color="#ff0055" toneMapped={false} />
      </mesh>

      {/* Hovering Point Light - red neon */}
      <pointLight ref={lightRef} position={[0, 0.8, 0]} color="#ff0055" intensity={2.0} distance={5} />
    </group>
  );
}

export function Tasks() {
  const tasks = useGameStore(state => state.tasks) || [];

  return (
    <group>
      {tasks.map(task => (
        <TaskItem key={task.id} task={task} />
      ))}
    </group>
  );
}
