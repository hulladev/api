import { ArchivoBlack_400Regular, useFonts } from '@expo-google-fonts/archivo-black'
import { DMMono_400Regular, DMMono_500Medium } from '@expo-google-fonts/dm-mono'
import { QueryClientProvider } from '@tanstack/react-query'
import { StatusBar } from 'expo-status-bar'
import { ActivityIndicator, StyleSheet, View } from 'react-native'
import { SafeAreaProvider, initialWindowMetrics } from 'react-native-safe-area-context'
import { queryClient } from './src/data'
import { TrainingScreen } from './src/TrainingScreen'

export default function App() {
  const [fontsLoaded, fontError] = useFonts({
    ArchivoBlack_400Regular,
    DMMono_400Regular,
    DMMono_500Medium,
  })

  if (!fontsLoaded && !fontError) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator color="#171814" />
      </View>
    )
  }

  return (
    <SafeAreaProvider initialMetrics={initialWindowMetrics}>
      <QueryClientProvider client={queryClient}>
        <StatusBar style="dark" />
        <TrainingScreen />
      </QueryClientProvider>
    </SafeAreaProvider>
  )
}

const styles = StyleSheet.create({
  loading: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#E9E7DF',
  },
})
