import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { VehicleSearchScreen } from './src/live/VehicleSearchScreen';
import { theme } from './src/live/theme';

export default function App() {
  return (
    <SafeAreaProvider>
      <SafeAreaView style={{ flex: 1, backgroundColor: theme.background }}>
        <StatusBar style="dark" />
        <VehicleSearchScreen />
      </SafeAreaView>
    </SafeAreaProvider>
  );
}
