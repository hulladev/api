/** A runtime step that may suspend without widening public call signatures. */
export type ExecutionStep<Value> = Value | PromiseLike<Value>

export type ValueIsAsync<Value> = Extract<Value, PromiseLike<unknown>> extends never ? false : true

export type EitherIsAsync<Left extends boolean, Right extends boolean> = Left extends true
  ? true
  : Right extends true
    ? true
    : false

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
