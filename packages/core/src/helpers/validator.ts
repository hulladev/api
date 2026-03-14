import type { DefaultValidator, SchemaOutput, Validator } from '../types'

export const defaultValidator: DefaultValidator = schema => input => schema.parse(input) as SchemaOutput<typeof schema>

export function createValidator(): DefaultValidator
export function createValidator(validator: undefined): DefaultValidator
export function createValidator<VI extends Validator>(validator: VI): VI
export function createValidator(validator: Validator | undefined): Validator | DefaultValidator
export function createValidator(validator?: Validator) {
  return validator ?? defaultValidator
}
