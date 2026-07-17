import { Platform } from 'react-native'

const localApiHost = Platform.OS === 'android' ? 'http://10.0.2.2:3001' : 'http://localhost:3001'

export const apiBaseUrl = process.env.EXPO_PUBLIC_API_URL ?? localApiHost
