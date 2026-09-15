/** A runtime step that may suspend without widening public call signatures. */
export type ExecutionStep<Value> = Value | PromiseLike<Value>

export function isPromiseLike<Value>(value: ExecutionStep<Value>): value is PromiseLike<Value> {
  return (
    (typeof value === 'object' || typeof value === 'function') &&
    value !== null &&
    typeof (value as PromiseLike<Value>).then === 'function'
  )
}

export function mapExecutionStep<Value, Result>(
  value: ExecutionStep<Value>,
  transform: (value: Value) => ExecutionStep<Result>
): ExecutionStep<Result> {
  return isPromiseLike(value) ? Promise.resolve(value).then(transform) : transform(value)
}

/** Starts independent steps together, observing earlier promises if later startup throws. */
export function mapExecutionSteps<Input, Output>(
  inputs: readonly Input[],
  transform: (input: Input, index: number) => ExecutionStep<Output>
): ExecutionStep<Output[]> {
  const started: ExecutionStep<Output>[] = []
  let asynchronous = false
  try {
    for (let index = 0; index < inputs.length; index++) {
      const step = transform(inputs[index]!, index)
      started.push(step)
      asynchronous ||= isPromiseLike(step)
    }
  } catch (error) {
    // The startup failure is primary. Already-started work must not escape its owner.
    for (const step of started) {
      if (isPromiseLike(step)) void Promise.resolve(step).catch(() => {})
    }
    throw error
  }
  return asynchronous ? Promise.all(started) : (started as Output[])
}

export type ExecutionField<Arguments extends readonly unknown[]> = readonly [
  name: 'params' | 'query' | 'configured' | 'headers' | 'body',
  read: (...args: Arguments) => ExecutionStep<unknown>,
]

/** Prepares declared fields once; preserves field order and only suspends for an async field. */
export function compileExecutionFields<Arguments extends readonly unknown[]>(
  fields: readonly ExecutionField<Arguments>[]
): (...args: Arguments) => ExecutionStep<Record<string, unknown>> {
  return (...args) => {
    const values: Record<string, unknown> = {}
    const read = (start: number): ExecutionStep<Record<string, unknown>> => {
      for (let index = start; index < fields.length; index++) {
        const [name, field] = fields[index]!
        const value = field(...args)
        if (isPromiseLike(value))
          return Promise.resolve(value).then((resolved) => {
            values[name] = resolved
            return read(index + 1)
          })
        values[name] = value
      }
      return values
    }
    return read(0)
  }
}
