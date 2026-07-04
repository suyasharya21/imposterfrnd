import { useGameStore } from '../store';

export function Tasks() {
  const tasks = useGameStore(state => state.tasks) || [];

  return (
    <group>
      {tasks.map(task => (
        <group key={task.id} position={[task.x, 0.05, task.z]}>
          {/* Neon Ring flat on floor */}
          <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow={false}>
            <ringGeometry args={[1.5, 1.8, 32]} />
            <meshBasicMaterial color="#39ff14" toneMapped={false} transparent opacity={0.8} />
          </mesh>

          {/* Center Mechanical Stand */}
          <mesh position={[0, 0.15, 0]}>
            <cylinderGeometry args={[0.2, 0.3, 0.3, 16]} />
            <meshStandardMaterial color="#1a1a2e" roughness={0.5} metalness={0.8} />
          </mesh>

          {/* Hovering Neon Core */}
          <mesh position={[0, 0.5, 0]}>
            <sphereGeometry args={[0.12, 16, 16]} />
            <meshBasicMaterial color="#39ff14" toneMapped={false} />
          </mesh>

          {/* Hovering Point Light */}
          <pointLight position={[0, 0.8, 0]} color="#39ff14" intensity={2.0} distance={5} />
        </group>
      ))}
    </group>
  );
}
