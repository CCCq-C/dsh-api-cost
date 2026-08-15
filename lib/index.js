/**
 * Real-time API usage cost meter, node half.
 *
 * Registers the `apiCost` session projection: a pure fold that prices each
 * provider-reported usage sample (assistant/chunk `usage` or
 * assistant/message `usage`) at the model's configured rate, so the browser
 * half can render a live running cost. The fold mirrors the token-meter's
 * bucket semantics (disjoint input / cache-read / cache-write / output) and
 * its last-wins per-(turn, step) replacement, so a streaming usage chunk and
 * the finalized assistant message never double-count.
 *
 * Pricing is configuration, not code: override `config` on this plugin's row
 * (see README) to change currency or per-model rates. Rates are USD per one
 * million tokens; unknown models fall back to the `rates` defaults.
 *
 * @module dsh-api-cost
 */
import { z } from "zod";

/** Dollars per one million tokens. */
const PER_MILLION = 1_000_000;

/**
 * Default per-model pricing, USD per 1M tokens. DeepSeek's public V3/R1 rates
 * are used for the legacy ids; the V4 ids are placeholders that a deployment
 * should replace through config once official pricing is published.
 */
const DEFAULT_RATES = { input: 0.27, cacheRead: 0.07, cacheWrite: 0.27, output: 1.1 };
const DEFAULT_MODELS = {
  "deepseek-chat": { input: 0.27, cacheRead: 0.07, cacheWrite: 0.27, output: 1.1 },
  "deepseek-reasoner": { input: 0.55, cacheRead: 0.14, cacheWrite: 0.55, output: 2.19 },
  "deepseek-v4-pro": { input: 0.27, cacheRead: 0.07, cacheWrite: 0.27, output: 1.1 },
  "deepseek-v4-flash": { input: 0.14, cacheRead: 0.03, cacheWrite: 0.14, output: 0.55 }
};

/** Cordis plugin name. */
const name = "api-cost";
/** The projection registry is the plugin's whole purpose. */
const inject = ["sessionProjections"];

const apiCostSchema = z.object({
  cost: z.number(),
  inputCost: z.number(),
  cacheReadCost: z.number(),
  cacheWriteCost: z.number(),
  outputCost: z.number(),
  inputTokens: z.number().int().nonnegative(),
  outputTokens: z.number().int().nonnegative(),
  cacheReadTokens: z.number().int().nonnegative(),
  cacheWriteTokens: z.number().int().nonnegative(),
  model: z.string().nullable(),
  provider: z.string().nullable(),
  currency: z.string()
}).strict();

/** Merge a partial per-model override over the fallback rates. */
function ratesFor(model, models, fallback) {
  const override = models[model];
  if (override === void 0) return fallback;
  return {
    input: override.input ?? fallback.input,
    cacheRead: override.cacheRead ?? fallback.cacheRead,
    cacheWrite: override.cacheWrite ?? fallback.cacheWrite,
    output: override.output ?? fallback.output
  };
}

/** Disjoint bucket counts from a provider usage sample. */
function bucketsFrom(usage) {
  return {
    inputTokens: usage.inputTokens ?? 0,
    outputTokens: usage.outputTokens ?? 0,
    cacheReadTokens: usage.cacheReadTokens ?? 0,
    cacheWriteTokens: usage.cacheWriteTokens ?? 0
  };
}

function bucketsEqual(left, right) {
  return left.inputTokens === right.inputTokens &&
    left.outputTokens === right.outputTokens &&
    left.cacheReadTokens === right.cacheReadTokens &&
    left.cacheWriteTokens === right.cacheWriteTokens;
}

/** The usage sample an event reports for its step, if any. */
function usageOfEvent(event) {
  if (event.type === "assistant/chunk" && event.data.chunk.type === "usage") {
    return { turn: event.data.turn, step: event.data.step, usage: event.data.chunk.usage };
  }
  if (event.type === "assistant/message" && event.data.usage !== void 0) {
    return { turn: event.data.turn, step: event.data.step, usage: event.data.usage };
  }
  return void 0;
}

/**
 * Build the projection unit over a resolved pricing table. All three functions
 * stay pure and synchronous (the session-projection contract); pricing is
 * captured once per registration from the plugin config.
 */
function buildDefinition(cfg) {
  const zero = {
    model: null,
    provider: null,
    cost: 0,
    inputCost: 0,
    cacheReadCost: 0,
    cacheWriteCost: 0,
    outputCost: 0,
    inputTokens: 0,
    outputTokens: 0,
    cacheReadTokens: 0,
    cacheWriteTokens: 0,
    last: null
  };

  return {
    key: "apiCost",
    schema: apiCostSchema,
    init: () => zero,
    apply: (state, event) => {
      let next = state;

      // Track the current route last-wins from the header and context records,
      // both of which precede the usage they describe.
      if (event.type === "request/context") {
        const { provider, model } = event.data;
        if (provider !== state.provider || model !== state.model) {
          next = { ...next, provider, model };
        }
      } else if (event.type === "request/header") {
        const config = event.data.header?.config;
        const provider = config?.provider;
        const model = config?.model;
        if ((provider !== void 0 && provider !== next.provider) || (model !== void 0 && model !== next.model)) {
          next = {
            ...next,
            provider: provider === void 0 ? next.provider : provider,
            model: model === void 0 ? next.model : model
          };
        }
      }

      const sample = usageOfEvent(event);
      if (sample !== void 0) {
        const buckets = bucketsFrom(sample.usage);
        const previous = next.last !== null && next.last.turn === sample.turn && next.last.step === sample.step
          ? next.last.buckets
          : null;
        if (previous === null || !bucketsEqual(previous, buckets)) {
          const rates = ratesFor(next.model ?? "", cfg.models, cfg.rates);
          const delta = {
            inputTokens: buckets.inputTokens - (previous?.inputTokens ?? 0),
            outputTokens: buckets.outputTokens - (previous?.outputTokens ?? 0),
            cacheReadTokens: buckets.cacheReadTokens - (previous?.cacheReadTokens ?? 0),
            cacheWriteTokens: buckets.cacheWriteTokens - (previous?.cacheWriteTokens ?? 0)
          };
          next = {
            ...next,
            inputTokens: next.inputTokens + delta.inputTokens,
            outputTokens: next.outputTokens + delta.outputTokens,
            cacheReadTokens: next.cacheReadTokens + delta.cacheReadTokens,
            cacheWriteTokens: next.cacheWriteTokens + delta.cacheWriteTokens,
            inputCost: next.inputCost + delta.inputTokens * rates.input / PER_MILLION,
            cacheReadCost: next.cacheReadCost + delta.cacheReadTokens * rates.cacheRead / PER_MILLION,
            cacheWriteCost: next.cacheWriteCost + delta.cacheWriteTokens * rates.cacheWrite / PER_MILLION,
            outputCost: next.outputCost + delta.outputTokens * rates.output / PER_MILLION,
            cost: next.cost + (
              delta.inputTokens * rates.input +
              delta.cacheReadTokens * rates.cacheRead +
              delta.cacheWriteTokens * rates.cacheWrite +
              delta.outputTokens * rates.output
            ) / PER_MILLION,
            last: { turn: sample.turn, step: sample.step, buckets }
          };
        }
      }

      return next;
    },
    view: (state) => ({
      cost: state.cost,
      inputCost: state.inputCost,
      cacheReadCost: state.cacheReadCost,
      cacheWriteCost: state.cacheWriteCost,
      outputCost: state.outputCost,
      inputTokens: state.inputTokens,
      outputTokens: state.outputTokens,
      cacheReadTokens: state.cacheReadTokens,
      cacheWriteTokens: state.cacheWriteTokens,
      model: state.model,
      provider: state.provider,
      currency: cfg.currency
    }),
    stateVersion: 1
  };
}

/**
 * Register the `apiCost` unit; the registration is an effect on this plugin's
 * fiber, so unloading removes the key. Pricing is merged from defaults plus
 * the row's `config`.
 * @param ctx - registrant context carrying the projection registry.
 * @param config - optional pricing config (currency / rates / models).
 */
function apply(ctx, config = {}) {
  const cfg = {
    currency: typeof config.currency === "string" && config.currency !== "" ? config.currency : "USD",
    rates: { ...DEFAULT_RATES, ...(config.rates ?? {}) },
    models: { ...DEFAULT_MODELS, ...(config.models ?? {}) }
  };
  ctx.sessionProjections.register(buildDefinition(cfg));
}

export { apply, inject, name };
