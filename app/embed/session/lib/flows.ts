import type { Flow, FlowButton, FlowResponse } from '../../../../types/widget';

/**
 * Pure flow/localization helpers lifted out of EmbedClient.controller.
 *
 * These carry the interaction-button and flow semantics, including the
 * AI-answered-button rules, so they are kept side-effect free and explicitly
 * parameterised — the controller supplies locale/config and owns the state
 * updates.
 */

/**
 * Resolve a localized string bag to the best available text.
 *
 * Priority: user's locale -> base locale -> widget's default language ->
 * English -> first available.
 */
export function getLocalizedText(
  textObj: { [lang: string]: string } | string | undefined,
  activeLocale: string,
  defaultLang: string,
): string {
  if (textObj == null) return '';
  if (typeof textObj === 'string') return textObj;

  const userLocale = activeLocale || 'en';
  const baseLocale = userLocale.split('-')[0];
  const fallbackLang = defaultLang || 'en';

  // Try user's locale first (e.g. 'nb-NO'), then base code (e.g. 'nb')
  if (textObj[userLocale]) return textObj[userLocale];
  if (baseLocale !== userLocale && textObj[baseLocale]) return textObj[baseLocale];
  if (textObj[fallbackLang]) return textObj[fallbackLang];
  if (textObj['en']) return textObj['en'];

  const values = Object.values(textObj);
  return values.length > 0 ? values[0] : '';
}

/**
 * Resolve the flow a button's action triggers, if any. Only considers flows
 * whose `languages` whitelist includes the visitor's locale (legacy flows with
 * no `languages` are visible in all locales).
 */
export function findFlowForAction(
  action: string | undefined,
  flows: Flow[],
  activeLocale: string,
): Flow | null {
  if (!action || action === 'text') return null;
  const visible = (flows || []).filter((candidate: Flow) => {
    const langs = candidate.languages;
    return !langs || langs.length === 0 || langs.includes(activeLocale);
  });
  return visible.find((candidate: Flow) => candidate.trigger === action) || null;
}

/**
 * The static replies a flow should append, or `null` when there is no static
 * reply to render.
 *
 * `null` is the "did NOT render a static reply" signal and covers two cases: no
 * matching flow, and an AI flow — whose reply comes from the agent via the normal
 * message path instead. An authored flow that happens to have no responses still
 * returns `[]`, because it *did* handle the action.
 */
export function collectFlowResponses(
  flow: Flow | null,
  localize: (text: { [lang: string]: string } | string | undefined) => string,
  now: () => number = Date.now,
): FlowResponse[] | null {
  if (!flow) return null;
  if (flow.answer_mode === 'ai') return null;

  type RawFlowResp = (Flow['responses'] extends Array<infer R> ? R : never);
  const responses: RawFlowResp[] = (flow.responses || []) as RawFlowResp[];

  const out: FlowResponse[] = [];
  responses.forEach((response: RawFlowResp) => {
    const responseText = localize(
      response.text as unknown as { [k: string]: string } | string | undefined,
    );
    if (responseText || (response.buttons && response.buttons.length > 0)) {
      out.push({
        text: responseText || '',
        buttons: response.buttons || [],
        timestamp: now(),
      });
    }
  });
  return out;
}

/**
 * Decide whether a clicked button should be answered by the agent, and with
 * what text.
 *
 * AI mode can be set on the button itself or on the flow its action triggers —
 * either is enough, so a merchant can flip one shared flow to AI without
 * editing every button that points at it. Returns the prompt to send, or null
 * when this click is the ordinary merchant-authored kind.
 *
 * Prompt precedence: the button's own `ai_prompt`, then the flow's, then the
 * visitor-visible label. Falling back to the label is what makes the whole
 * feature work with zero authoring — and it is already localized, so a
 * Norwegian visitor sends a Norwegian question without the merchant writing
 * a prompt per language.
 */
export function resolveAiPrompt(
  button: FlowButton,
  flow: Flow | null,
  labelText: string,
): string | null {
  if (button.answer_mode !== 'ai' && flow?.answer_mode !== 'ai') return null;
  const prompt = button.ai_prompt?.trim() || flow?.ai_prompt?.trim() || labelText.trim();
  return prompt || null;
}
