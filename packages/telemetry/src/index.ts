export {
  ENVIRONMENTS,
  ERROR_SAMPLE_RATE,
  SERVICES,
  TAG_KEYS,
  isService,
  tracesSampleRateFor,
  type Environment,
  type Service,
} from "./constants.js";

export {
  buildSentryOptions,
  composeBeforeSend,
  type BeforeSend,
  type BuildSentryOptionsInput,
} from "./options.js";

export {
  scrubEmails,
  scrubEvent,
  scrubPaths,
  scrubSecrets,
  scrubText,
} from "./scrub.js";

export { browserNoiseFilter, isBrowserNoiseEvent } from "./browser-filter.js";

export { alert } from "./alert.js";
