/**
 * Runtime metadata shared by GenUI normalization and diagnostics.
 *
 * Since the prototype-channel work this module is a **thin re-export**: the
 * component definitions live in `src/shared/catalog/definitions.ts` (the single
 * definition source) and the model types in `src/shared/catalog/model.ts`.
 * Keeping this path stable means every existing importer (guard, spec,
 * portability, tools) keeps working unchanged.
 */
export * from '../../shared/catalog/model.ts'
export * from '../../shared/catalog/definitions.ts'
