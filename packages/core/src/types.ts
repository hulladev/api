export type Context = Record<string, unknown>

export type SyncMiddleware<C extends Context = Context> = () => C

export type AsyncMiddleware<C extends Context = Context> = () => Promise<C>

export type Middleware<C extends Context = Context> = SyncMiddleware<C> | AsyncMiddleware<C>

export type ResolvedMiddleware<MI extends Middleware> = [MI] extends [never] ? undefined : MI

export type MergeContext<PC extends Context, RC extends Context> = Omit<PC, keyof RC> & RC

export type MergedMiddlewareFn<PMI extends Middleware, RMI extends Middleware> =
  [PMI] extends [never]
    ? [RMI] extends [never]
      ? undefined
      : RMI
    : [RMI] extends [never]
      ? PMI
      : PMI extends SyncMiddleware<infer PC>
        ? RMI extends SyncMiddleware<infer RC>
          ? SyncMiddleware<MergeContext<PC, RC>>
          : RMI extends AsyncMiddleware<infer RC>
            ? AsyncMiddleware<MergeContext<PC, RC>>
            : never
        : PMI extends AsyncMiddleware<infer PC>
          ? RMI extends SyncMiddleware<infer RC>
            ? AsyncMiddleware<MergeContext<PC, RC>>
            : RMI extends AsyncMiddleware<infer RC>
              ? AsyncMiddleware<MergeContext<PC, RC>>
              : never
          : never

export type MergedMiddleware<PMI extends Middleware, RMI extends Middleware> = MergedMiddlewareFn<PMI, RMI>

export type ZodLikeSchema<Input, Output> = {
  parse: (input: Input) => Output
  _input: Input
  _output: Output
}

export type SchemaInput<Schema> = Schema extends ZodLikeSchema<infer Input, any> ? Input : never

export type SchemaOutput<Schema> = Schema extends ZodLikeSchema<any, infer Output> ? Output : never

export type Validator = (schema: any) => any

export type ResolvedValidator<VI extends Validator> = [VI] extends [never] ? DefaultValidator : VI

export type DefaultValidator = <Schema extends ZodLikeSchema<any, any>>(schema: Schema) => (input: SchemaInput<Schema>) => SchemaOutput<Schema>

export type ApiConfig<MI extends Middleware = never, VI extends Validator = never> = {
  middleware?: MI
  validator?: VI
}

export type APIMeta<MI extends Middleware = never, VI extends Validator = never> = {
  middleware: ResolvedMiddleware<MI>
  validator: ResolvedValidator<VI>
}

export type RouterConfig<N extends string, MI extends Middleware = never> = {
  name: N
  middleware: ResolvedMiddleware<MI>
}

export type RouterMiddlewareMeta<AMI extends Middleware, MI extends Middleware> = {
  api: ResolvedMiddleware<AMI>
  router: ResolvedMiddleware<MI>
  merged: MergedMiddlewareFn<AMI, MI>
}

export type RouterMeta<
  N extends string,
  MI extends Middleware,
  AMI extends Middleware,
> = {
  name: N
  middleware: RouterMiddlewareMeta<AMI, MI>
}



export type Router<
  N extends string,
  MI extends Middleware,
  AMI extends Middleware,
> = {
  $meta: RouterMeta<N, MI, AMI>
}

export type RouterCreator<AMI extends Middleware = never> = <
  const N extends string,
  MI extends Middleware = never,
>(
  config: RouterConfig<N, MI>
) => Router<N, MI, AMI>

export type API<MI extends Middleware = never, VI extends Validator = never> = {
  router: RouterCreator<MI>
  $meta: APIMeta<MI, VI>
}
