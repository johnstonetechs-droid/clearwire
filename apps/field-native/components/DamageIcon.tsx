import * as Icons from 'lucide-react-native';

type IconName = keyof typeof Icons;

type Props = {
  name: string;
  size?: number;
  color: string;
};

// Tiny wrapper: lucide-react-native exports each icon as a named component.
// We store just the name string in DAMAGE_TYPE_ICONS so the shared package
// (supabase types) stays runtime-agnostic. This component resolves it.
export function DamageIcon({ name, size = 18, color }: Props) {
  const Cmp = (Icons as unknown as Record<string, React.ComponentType<any>>)[name as IconName];
  if (!Cmp) return null;
  return <Cmp size={size} color={color} />;
}
