import { Button } from '@expo/ui';
import { ThemedHost } from './host';
import { rhythm } from '../../theme/tokens';

type ActionProps = {
  title: string;
  onPress: () => void;
  disabled?: boolean;
  secondary?: boolean;
};

export function Action({ title, onPress, disabled = false, secondary = false }: ActionProps) {
  return (
    <ThemedHost matchContents={{ vertical: true }} style={{ minHeight: rhythm.target }}>
      <Button
        onPress={onPress}
        disabled={disabled}
        variant={secondary ? 'outlined' : 'filled'}
        style={{
          height: rhythm.target,
          paddingHorizontal: rhythm.section,
          borderRadius: 12,
        }}
      >
        {title}
      </Button>
    </ThemedHost>
  );
}
