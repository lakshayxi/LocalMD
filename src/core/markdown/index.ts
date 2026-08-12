export { renderMarkdown } from './pipeline';
export { hashSlice, sliceTree, sliceTreeWithHashes, SLICE_NODES } from './slice';
export type { DocumentSlice } from './slice';
export { detectLanguage, highlightCode, languageOfClassNames, resolveLanguage } from './highlight';
export type { HighlightLanguage, Language } from './highlight';
export { sanitizeSchema } from './sanitize-schema';
export type {
  BlockedResource,
  Heading,
  RenderOptions,
  RenderResult,
} from './types';
export {
  ALLOWED_DATA_IMAGE_TYPES,
  ALLOWED_LINK_PROTOCOLS,
  ALLOWED_SOURCE_PROTOCOLS,
  INTERNAL_CLASS_PREFIX,
} from './types';
