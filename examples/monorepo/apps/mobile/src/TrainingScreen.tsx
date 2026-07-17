import { useLiveQuery } from '@tanstack/react-db'
import { useEffect, useMemo, useRef, useState } from 'react'
import {
  ActivityIndicator,
  Animated,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { apiBaseUrl } from './api'
import { createWorkout, workoutsCollection } from './data'

const colors = {
  ink: '#171814',
  paper: '#E9E7DF',
  signal: '#EDFF3C',
  orange: '#F26835',
  green: '#32A85E',
  muted: '#66675F',
  error: '#9D2F1C',
}

const focusOptions = ['Strength', 'Conditioning', 'Mobility', 'Recovery'] as const

export function TrainingScreen() {
  const workouts = useLiveQuery((query) => query.from({ workouts: workoutsCollection }))
  const [name, setName] = useState('')
  const [focus, setFocus] = useState<(typeof focusOptions)[number]>('Strength')
  const [pendingMutations, setPendingMutations] = useState(0)
  const [mutationError, setMutationError] = useState<Error | null>(null)
  const [refreshing, setRefreshing] = useState(false)
  const entrance = useRef(new Animated.Value(0)).current
  const queryError = workoutsCollection.utils.lastError
  const isMutating = pendingMutations > 0

  useEffect(() => {
    Animated.timing(entrance, {
      toValue: 1,
      duration: 450,
      useNativeDriver: Platform.OS !== 'web',
    }).start()
  }, [entrance])

  function persist(promise: Promise<unknown>, onSuccess?: () => void) {
    setPendingMutations((count) => count + 1)
    setMutationError(null)
    void promise
      .then(onSuccess)
      .catch((error: unknown) => setMutationError(toError(error)))
      .finally(() => setPendingMutations((count) => count - 1))
  }

  async function refresh() {
    setRefreshing(true)
    try {
      await workoutsCollection.utils.refetch({ throwOnError: true })
    } catch (error: unknown) {
      setMutationError(toError(error))
    } finally {
      setRefreshing(false)
    }
  }

  const summary = useMemo(() => {
    const data = workouts.data ?? []
    const completed = data.filter((workout) => workout.completed).length

    return {
      completed,
      remaining: data.length - completed,
      total: data.length,
      completion: data.length === 0 ? 0 : Math.round((completed / data.length) * 100),
    }
  }, [workouts.data])

  function submit() {
    if (name.trim().length < 2 || isMutating) return
    persist(createWorkout({ name: name.trim(), focus }), () => setName(''))
  }

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>
      <KeyboardAvoidingView style={styles.safeArea} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <Animated.View
          style={[
            styles.safeArea,
            {
              opacity: entrance,
              transform: [
                {
                  translateY: entrance.interpolate({ inputRange: [0, 1], outputRange: [10, 0] }),
                },
              ],
            },
          ]}
        >
          <ScrollView
            contentContainerStyle={styles.content}
            keyboardShouldPersistTaps="handled"
            refreshControl={
              <RefreshControl refreshing={refreshing} onRefresh={() => void refresh()} tintColor={colors.ink} />
            }
          >
            <View style={styles.topbar}>
              <View style={styles.wordmarkRow}>
                <Text style={styles.wordmark}>FORM</Text>
                <Text style={styles.slash}>/</Text>
                <Text style={styles.wordmark}>FUNCTION</Text>
              </View>
              <View style={styles.connection}>
                <View style={styles.liveDot} />
                <Text style={styles.connectionText}>LIVE</Text>
              </View>
            </View>

            <View style={styles.hero}>
              <Text style={styles.eyebrow}>TRAINING LOG · WEEK 28</Text>
              <Text style={styles.heroTitle}>SHOW UP.</Text>
              <View style={styles.heroSecondLine}>
                <Text style={styles.heroTitle}>LOG IT.</Text>
                <View style={styles.weekBadge}>
                  <Text style={styles.weekNumber}>28</Text>
                  <Text style={styles.weekMonth}>JUL</Text>
                </View>
              </View>
              <Text style={styles.heroCopy}>One generated contract, from SQLite to the pocket.</Text>
            </View>

            <View style={styles.metrics}>
              <Metric value={`${summary.completed}/${summary.total}`} label="CLOSED" />
              <Metric value={`${summary.remaining}`} label="OPEN" bordered />
              <Metric value={`${summary.completion}%`} label="RATE" bordered />
            </View>

            <View style={styles.composer}>
              <Text style={styles.inverseEyebrow}>01 / PLAN</Text>
              <Text style={styles.composerTitle}>ADD THE NEXT SESSION</Text>
              <TextInput
                accessibilityLabel="Session name"
                style={styles.input}
                value={name}
                onChangeText={setName}
                onSubmitEditing={submit}
                placeholder="Session name"
                placeholderTextColor="#8D8E85"
                returnKeyType="done"
                maxLength={80}
              />
              <Text style={styles.focusLabel}>FOCUS</Text>
              <View style={styles.focusGrid}>
                {focusOptions.map((option) => {
                  const selected = option === focus
                  return (
                    <Pressable
                      key={option}
                      accessibilityRole="button"
                      accessibilityState={{ selected }}
                      onPress={() => setFocus(option)}
                      style={({ pressed }) => [
                        styles.focusChip,
                        selected && styles.focusChipSelected,
                        pressed && styles.pressed,
                      ]}
                    >
                      <Text style={[styles.focusChipText, selected && styles.focusChipTextSelected]}>{option}</Text>
                    </Pressable>
                  )
                })}
              </View>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Add session"
                disabled={name.trim().length < 2 || isMutating}
                onPress={submit}
                style={({ pressed }) => [
                  styles.addButton,
                  (name.trim().length < 2 || isMutating) && styles.addButtonDisabled,
                  pressed && styles.addButtonPressed,
                ]}
              >
                {isMutating ? (
                  <ActivityIndicator color={colors.ink} />
                ) : (
                  <>
                    <Text style={styles.addButtonText}>ADD SESSION</Text>
                    <Text style={styles.addButtonArrow}>↗</Text>
                  </>
                )}
              </Pressable>
              {mutationError ? <Text style={styles.mutationError}>{mutationError.message}</Text> : null}
            </View>

            <View style={styles.logHeader}>
              <View>
                <Text style={styles.eyebrow}>02 / LOG</Text>
                <Text style={styles.logTitle}>THIS WEEK</Text>
              </View>
              <Text style={styles.totalCount}>{String(summary.total).padStart(2, '0')}</Text>
            </View>

            {workouts.isLoading ? (
              <View style={styles.stateCard}>
                <ActivityIndicator color={colors.ink} />
                <Text style={styles.stateText}>LOADING THE CONTRACT…</Text>
              </View>
            ) : null}

            {workouts.isError && queryError ? (
              <View style={styles.errorCard}>
                <Text style={styles.errorTitle}>API OUT OF REACH</Text>
                <Text style={styles.errorBody}>{toError(queryError).message}</Text>
                <Text style={styles.errorHost}>{apiBaseUrl}</Text>
                <Pressable onPress={() => void refresh()} style={styles.retryButton}>
                  <Text style={styles.retryText}>TRY AGAIN</Text>
                </Pressable>
              </View>
            ) : null}

            <View style={styles.workoutList}>
              {(workouts.data ?? []).map((workout, index) => (
                <View key={workout.id} style={[styles.workout, workout.completed && styles.workoutCompleted]}>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={workout.completed ? `Reopen ${workout.name}` : `Complete ${workout.name}`}
                    disabled={isMutating}
                    onPress={() =>
                      persist(
                        workoutsCollection.update(workout.id, (draft) => {
                          draft.completed = !workout.completed
                        }).isPersisted.promise
                      )
                    }
                    style={({ pressed }) => [
                      styles.check,
                      workout.completed && styles.checkCompleted,
                      pressed && styles.pressed,
                    ]}
                  >
                    <Text style={styles.checkText}>{workout.completed ? '✓' : String(index + 1).padStart(2, '0')}</Text>
                  </Pressable>
                  <View style={styles.workoutCopy}>
                    <Text
                      style={[styles.workoutName, workout.completed && styles.workoutNameCompleted]}
                      numberOfLines={2}
                    >
                      {workout.name}
                    </Text>
                    <Text style={styles.workoutMeta}>{workout.focus.toUpperCase()} · PROGRAMMED</Text>
                  </View>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`Delete ${workout.name}`}
                    disabled={isMutating}
                    onPress={() => persist(workoutsCollection.delete(workout.id).isPersisted.promise)}
                    hitSlop={12}
                    style={({ pressed }) => [styles.deleteButton, pressed && styles.pressed]}
                  >
                    <Text style={styles.deleteText}>×</Text>
                  </Pressable>
                </View>
              ))}
            </View>

            <View style={styles.footer}>
              <Text style={styles.footerText}>LOCAL CONTRACT TEST</Text>
              <Text style={styles.footerText}>EXPO · SDK 57</Text>
            </View>
          </ScrollView>
        </Animated.View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  )
}

function toError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error))
}

function Metric({ value, label, bordered = false }: { value: string; label: string; bordered?: boolean }) {
  return (
    <View style={[styles.metric, bordered && styles.metricBordered]}>
      <Text style={styles.metricValue}>{value}</Text>
      <Text style={styles.metricLabel}>{label}</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: colors.paper },
  content: { paddingHorizontal: 20, paddingBottom: 36 },
  topbar: {
    minHeight: 60,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderBottomWidth: 1,
    borderColor: colors.ink,
  },
  wordmarkRow: { flexDirection: 'row', alignItems: 'center' },
  wordmark: { fontFamily: 'ArchivoBlack_400Regular', fontSize: 17, letterSpacing: -1 },
  slash: {
    fontFamily: 'ArchivoBlack_400Regular',
    fontSize: 18,
    color: colors.orange,
    marginHorizontal: 4,
  },
  connection: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  liveDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: colors.green },
  connectionText: { fontFamily: 'DMMono_500Medium', fontSize: 9, letterSpacing: 1.6 },
  hero: { paddingTop: 38, paddingBottom: 28, borderBottomWidth: 1, borderColor: colors.ink },
  eyebrow: { fontFamily: 'DMMono_500Medium', fontSize: 10, letterSpacing: 1.6, marginBottom: 14 },
  heroTitle: {
    fontFamily: 'ArchivoBlack_400Regular',
    fontSize: 52,
    lineHeight: 50,
    letterSpacing: -3.4,
  },
  heroSecondLine: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  weekBadge: {
    width: 78,
    height: 78,
    borderRadius: 39,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.signal,
    borderWidth: 1,
    borderColor: colors.ink,
    transform: [{ rotate: '6deg' }],
  },
  weekNumber: {
    fontFamily: 'ArchivoBlack_400Regular',
    fontSize: 30,
    lineHeight: 32,
    letterSpacing: -2,
  },
  weekMonth: { fontFamily: 'DMMono_500Medium', fontSize: 8, letterSpacing: 3 },
  heroCopy: {
    fontFamily: 'DMMono_400Regular',
    fontSize: 12,
    lineHeight: 19,
    maxWidth: 290,
    marginTop: 22,
  },
  metrics: { minHeight: 92, flexDirection: 'row', borderBottomWidth: 1, borderColor: colors.ink },
  metric: { flex: 1, justifyContent: 'space-between', paddingVertical: 15 },
  metricBordered: { borderLeftWidth: 1, borderColor: colors.ink, paddingLeft: 14 },
  metricValue: { fontFamily: 'ArchivoBlack_400Regular', fontSize: 27, letterSpacing: -1.8 },
  metricLabel: { fontFamily: 'DMMono_500Medium', fontSize: 8, letterSpacing: 1.2 },
  composer: {
    marginHorizontal: -20,
    paddingHorizontal: 20,
    paddingVertical: 28,
    backgroundColor: colors.ink,
  },
  inverseEyebrow: {
    fontFamily: 'DMMono_500Medium',
    color: colors.paper,
    fontSize: 9,
    letterSpacing: 1.5,
    marginBottom: 12,
  },
  composerTitle: {
    fontFamily: 'ArchivoBlack_400Regular',
    color: colors.paper,
    fontSize: 27,
    lineHeight: 29,
    letterSpacing: -1.5,
  },
  input: {
    height: 54,
    borderBottomWidth: 1,
    borderColor: colors.paper,
    color: colors.paper,
    fontFamily: 'DMMono_400Regular',
    fontSize: 15,
    marginTop: 24,
  },
  focusLabel: {
    fontFamily: 'DMMono_500Medium',
    color: '#A7A79F',
    fontSize: 8,
    letterSpacing: 1.4,
    marginTop: 22,
    marginBottom: 10,
  },
  focusGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  focusChip: {
    borderWidth: 1,
    borderColor: '#64655E',
    borderRadius: 18,
    paddingHorizontal: 13,
    paddingVertical: 9,
  },
  focusChipSelected: { backgroundColor: colors.paper, borderColor: colors.paper },
  focusChipText: {
    fontFamily: 'DMMono_500Medium',
    color: colors.paper,
    fontSize: 9,
    letterSpacing: 0.5,
  },
  focusChipTextSelected: { color: colors.ink },
  addButton: {
    height: 56,
    marginTop: 24,
    paddingHorizontal: 18,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.signal,
  },
  addButtonDisabled: { opacity: 0.36 },
  addButtonPressed: { transform: [{ translateY: 2 }] },
  addButtonText: {
    fontFamily: 'DMMono_500Medium',
    color: colors.ink,
    fontSize: 10,
    letterSpacing: 1.4,
  },
  addButtonArrow: { fontFamily: 'DMMono_500Medium', color: colors.ink, fontSize: 18 },
  mutationError: {
    fontFamily: 'DMMono_400Regular',
    color: '#FF9B80',
    fontSize: 10,
    lineHeight: 15,
    marginTop: 12,
  },
  logHeader: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    paddingTop: 34,
    paddingBottom: 20,
  },
  logTitle: { fontFamily: 'ArchivoBlack_400Regular', fontSize: 31, letterSpacing: -1.8 },
  totalCount: {
    fontFamily: 'ArchivoBlack_400Regular',
    fontSize: 35,
    color: colors.orange,
    letterSpacing: -2,
  },
  stateCard: {
    alignItems: 'center',
    gap: 12,
    paddingVertical: 32,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: colors.ink,
  },
  stateText: { fontFamily: 'DMMono_500Medium', fontSize: 9, letterSpacing: 1 },
  errorCard: { padding: 18, borderWidth: 1, borderColor: colors.error, marginBottom: 18 },
  errorTitle: { fontFamily: 'ArchivoBlack_400Regular', fontSize: 20, color: colors.error },
  errorBody: {
    fontFamily: 'DMMono_400Regular',
    fontSize: 10,
    lineHeight: 16,
    color: colors.error,
    marginTop: 8,
  },
  errorHost: { fontFamily: 'DMMono_400Regular', fontSize: 9, color: colors.muted, marginTop: 8 },
  retryButton: {
    alignSelf: 'flex-start',
    backgroundColor: colors.error,
    paddingHorizontal: 14,
    paddingVertical: 10,
    marginTop: 14,
  },
  retryText: {
    fontFamily: 'DMMono_500Medium',
    color: colors.paper,
    fontSize: 9,
    letterSpacing: 1.2,
  },
  workoutList: { borderTopWidth: 1, borderColor: colors.ink },
  workout: {
    minHeight: 94,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    borderBottomWidth: 1,
    borderColor: colors.ink,
    paddingVertical: 14,
  },
  workoutCompleted: { opacity: 0.58 },
  check: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: colors.ink,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkCompleted: { backgroundColor: colors.signal },
  checkText: { fontFamily: 'DMMono_500Medium', fontSize: 11 },
  workoutCopy: { flex: 1, gap: 6 },
  workoutName: {
    fontFamily: 'ArchivoBlack_400Regular',
    fontSize: 17,
    lineHeight: 19,
    letterSpacing: -0.8,
  },
  workoutNameCompleted: { textDecorationLine: 'line-through', textDecorationColor: colors.orange },
  workoutMeta: {
    fontFamily: 'DMMono_400Regular',
    color: colors.muted,
    fontSize: 8,
    letterSpacing: 0.7,
  },
  deleteButton: { width: 34, height: 44, alignItems: 'flex-end', justifyContent: 'center' },
  deleteText: { fontFamily: 'DMMono_400Regular', color: colors.muted, fontSize: 24 },
  pressed: { opacity: 0.55 },
  footer: {
    minHeight: 92,
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
  },
  footerText: {
    fontFamily: 'DMMono_500Medium',
    color: colors.muted,
    fontSize: 8,
    letterSpacing: 1,
  },
})
