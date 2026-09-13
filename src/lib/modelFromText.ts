// Rule-based interpreter that turns a plain-English description of a model into a
// PROPOSED path model for the researcher to review and confirm. It parses the
// SENTENCE STRUCTURE (mediation/moderation/relationship/covariate cues) and
// matches the named phrases to real dataset variables by lexical similarity.
//
// It makes NO causal or statistical claim: it only proposes a starting structure
// the researcher edits and confirms. It never invents variables — a phrase with
// no confident match is surfaced as "needs a variable".
import { type VariableInfo } from './pathVariableUtils';

export type ProposedRole = 'predictor' | 'mediator' | 'outcome' | 'covariate' | 'moderator';
export type RelType = 'direct' | 'mediation' | 'moderation' | 'covariance';

export interface ProposedItem {
  role: ProposedRole;
  phrase: string;            // the words from the sentence
  match: string | null;      // best-matching variable name (or null)
  alternatives: string[];    // other plausible matches for the picker
}
export interface ProposedPath { from: string; to: string; type: RelType; moderates?: string }
export interface ProposedModel {
  items: ProposedItem[];
  paths: ProposedPath[];
  unmatched: string[];       // phrases we couldn't confidently match to a variable
  summary: string;
}

const clean = (s: string) => s.toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();

// Score a phrase against the variable index; returns the best name + alternatives.
function matchVariable(phrase: string, variables: VariableInfo[]): { best: string | null; alternatives: string[] } {
  const p = clean(phrase);
  if (!p) return { best: null, alternatives: [] };
  const tokens = p.split(' ').filter((t) => t.length > 2);
  const scored = variables.map((v) => {
    const name = v.name.toLowerCase();
    const h = v._h;
    let score = 0;
    if (name === p) score += 100;
    else if (name.replace(/[_\-.]/g, '') === p.replace(/ /g, '')) score += 90;
    if (h.includes(p)) score += 50;
    for (const t of tokens) { if (name.includes(t)) score += 12; else if (h.includes(t)) score += 8; }
    if (name.startsWith(p.slice(0, 4)) && p.length >= 4) score += 4;
    return { name: v.name, score };
  }).filter((s) => s.score > 0).sort((a, b) => b.score - a.score);
  return { best: scored[0]?.name ?? null, alternatives: scored.slice(1, 4).map((s) => s.name) };
}

// Split a covariate list ("age, sex and education") into phrases.
function splitList(s: string): string[] {
  return s.split(/,|\band\b|&/i).map((x) => x.trim()).filter((x) => x.length > 1 && !/^(the|a|an)$/i.test(x));
}

export function parseModelSpec(text: string, variables: VariableInfo[]): ProposedModel {
  const raw = text.trim();
  const t = ' ' + raw.toLowerCase().replace(/\s+/g, ' ') + ' ';
  const items: ProposedItem[] = [];
  const unmatched: string[] = [];
  const add = (role: ProposedRole, phrase: string) => {
    // strip a leading run of question/filler words so the phrase is just the concept
    phrase = phrase.trim().replace(/^((?:the|a|an|of|on|that|whether|if|does|do|is|are|i|we|want|would|like|to|test|examine|explore|investigate|assess|check|see|know)\b\s*)+/i, '').trim();
    if (!phrase) return null;
    const { best, alternatives } = matchVariable(phrase, variables);
    items.push({ role, phrase, match: best, alternatives });
    if (!best) unmatched.push(phrase);
    return best;
  };

  // Covariates: "controlling for / adjusting for / covariates: A, B and C"
  let covPart = '';
  const covM = t.match(/(?:controll?ing for|control for|adjust(?:ing|ed)? for|covariates?:?|holding constant)\s+([^.;]+?)(?:[.;]|$)/i);
  if (covM) { covPart = covM[1]; splitList(covM[1]).forEach((c) => add('covariate', c)); }

  // Work on the text with the covariate clause removed so it doesn't pollute X/Y.
  const core = covPart ? t.replace(covM![0], ' ') : t;

  // Take the last N words before a keyword position — the concept usually sits
  // right before "mediates"/"moderates".
  const wordsBefore = (str: string, idx: number, n = 4) => str.slice(0, idx).trim().split(/\s+/).filter(Boolean).slice(-n).join(' ');

  // Mediator: "M mediates", "mediated by M"
  let mediator: string | null = null;
  const medBy = core.match(/mediated by\s+([^,.;]+?)(?:[,.;]| controlling| adjusting|$)/i);
  const medIdx = core.search(/\bmediat[a-z]*\b/i);
  if (medBy) mediator = add('mediator', medBy[1]);
  else if (medIdx >= 0) mediator = add('mediator', wordsBefore(core, medIdx));

  // Moderator: "MOD moderates", "moderated by MOD"
  let moderator: string | null = null;
  const modBy = core.match(/moderated by\s+([^,.;]+?)(?:[,.;]|$)/i);
  const modIdx = core.search(/\bmoderat[a-z]*\b/i);
  if (modBy) moderator = add('moderator', modBy[1]);
  else if (modIdx >= 0) moderator = add('moderator', wordsBefore(core, modIdx));

  // Predictor + Outcome via common structures.
  let predictor: string | null = null, outcome: string | null = null;
  const between = core.match(/(?:relationship|association|link|effect|correlation)\s+between\s+([^,.;]+?)\s+and\s+([^,.;]+?)(?:[,.;]|$)/i);
  const effectOf = core.match(/(?:effect|impact|influence)\s+of\s+([^,.;]+?)\s+on\s+([^,.;]+?)(?:[,.;]|$)/i);
  const predicts = core.match(/([a-z0-9 _-]+?)\s+(?:predicts?|influences?|affects?|impacts?|drives?|leads? to|on)\s+([^,.;]+?)(?:[,.;]|$)/i);
  if (between) { predictor = add('predictor', between[1]); outcome = add('outcome', between[2]); }
  else if (effectOf) { predictor = add('predictor', effectOf[1]); outcome = add('outcome', effectOf[2]); }
  else if (predicts) { predictor = add('predictor', predicts[1]); outcome = add('outcome', predicts[2]); }

  // Build proposed paths from whatever matched (reused when the researcher edits
  // a variable choice in the proposal).
  const paths = edgesFromRoles({
    predictor, outcome, mediator, moderator,
    covariates: items.filter((i) => i.role === 'covariate').map((c) => c.match).filter((x): x is string => !!x),
  });

  const parts: string[] = [];
  if (predictor || outcome) parts.push(`${predictor ? '“' + itemPhrase(items, 'predictor') + '”' : '?'} → ${outcome ? '“' + itemPhrase(items, 'outcome') + '”' : '?'}`);
  if (mediator) parts.push(`mediated by “${itemPhrase(items, 'mediator')}”`);
  if (moderator) parts.push(`moderated by “${itemPhrase(items, 'moderator')}”`);
  const covs = items.filter((i) => i.role === 'covariate');
  if (covs.length) parts.push(`controlling for ${covs.map((c) => '“' + c.phrase + '”').join(', ')}`);

  return {
    items, paths, unmatched,
    summary: parts.length ? parts.join(', ') : 'Could not identify a model structure. Try: “the effect of X on Y, mediated by M, controlling for A and B”.',
  };
}

function itemPhrase(items: ProposedItem[], role: ProposedRole): string {
  return items.find((i) => i.role === role)?.phrase ?? '';
}

export interface ResolvedRoles {
  predictor: string | null; outcome: string | null;
  mediator: string | null; moderator: string | null; covariates: string[];
}

// Turn a resolved set of role→variable assignments into path edges. Standard
// structures only: mediation (X→M, M→Y, X→Y), direct (X→Y), covariates→Y, and a
// moderation edge (moderator→Y moderating X→Y).
export function edgesFromRoles(r: ResolvedRoles): ProposedPath[] {
  const paths: ProposedPath[] = [];
  const { predictor, outcome, mediator, moderator, covariates } = r;
  if (predictor && outcome) {
    if (mediator) { paths.push({ from: predictor, to: mediator, type: 'mediation' }); paths.push({ from: mediator, to: outcome, type: 'mediation' }); }
    paths.push({ from: predictor, to: outcome, type: 'direct' });
  } else if (predictor && mediator) {
    paths.push({ from: predictor, to: mediator, type: 'direct' });
  }
  if (outcome) covariates.filter(Boolean).forEach((c) => paths.push({ from: c, to: outcome, type: 'direct' }));
  if (moderator && predictor && outcome) paths.push({ from: moderator, to: outcome, type: 'moderation', moderates: predictor });
  return paths;
}

export const ROLE_LABEL: Record<ProposedRole, string> = {
  predictor: 'Predictor', mediator: 'Mediator', outcome: 'Outcome', covariate: 'Covariate', moderator: 'Moderator',
};
