import Anthropic from "@anthropic-ai/sdk";
import { auth } from "@clerk/nextjs/server";
import { NextRequest, NextResponse } from "next/server";
import {
  getUserMeta,
  incrementDailyUsage,
  FREE_DAILY_LIMIT,
  windowedUsage,
} from "@/app/lib/subscription";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Huu-Client",
};

function corsJson(
  body: Record<string, unknown>,
  init?: ResponseInit
): NextResponse {
  return NextResponse.json(body, {
    ...init,
    headers: {
      ...CORS_HEADERS,
      ...init?.headers,
    },
  });
}

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: CORS_HEADERS,
  });
}

const ANTI_AI_RULES = `
You must follow these rules strictly. These are the patterns that make writing sound AI-generated. Violating any of them means the output fails.

BANNED PATTERNS. never do any of these:
1. Do not start with "Most [noun]..." as a hook. e.g. "Most founders...", "Most people...", "Most marketers...".
2. Do not use em dashes (— or --) anywhere in the output.
3. Do not create staccato rhythm by stringing together short clauses separated by commas or periods. e.g. "there's no error, no support ticket, no angry email" or "No complaint. No error. No signal." This pattern makes the writing sound like a list disguised as a sentence. Instead, fold the idea into a single flowing sentence that says the same thing without the rhythm. e.g. "there's nothing to flag it — no error message, no complaint, nothing that tells you something is wrong" notice how that uses a connector and lands on a real point instead of just listing.
4. Do not do a dramatic single-line break that contradicts the previous line. e.g. writing one line, then a new line that says "No." or "Wrong." or "Don't." this is a cliché AI rhetorical trick.
5. Do not repeat the same word or structure at the start of consecutive clauses or sentences as an anaphora device. e.g. "Not this. Not that. Not the other." or "No complaint. No error. No signal." or "No new traffic. No new ad spend." banned entirely. Use connector words instead: "or", "and", "but", "because", "which means". And be creative, Use more connectors that make sense in the scenario. The fix is always to connect the thoughts rather than stack them.
6. Do not use the "It's not [x], it's [y]" or "This isn't about [x]. It's about [y]." for example: "It's not about the money, it's about the mission." this is the sentence structure to avoid.
7. Do not use words or phrases that are hallmarks of AI writing. Every word and phrase below is banned — replace each with a plain, conversational alternative:
BANNED VERBS: "leverage" (use "use"), "utilize" (use "use"), "foster" (use "build" or "grow"), "navigate" (use "handle" or "deal with"), "ensure" (use "make sure"), "facilitate" (use "help" or "support"), "demonstrate" (use "show" or "prove"), "streamline" (use "simplify" or "speed up"), "elevate" (use "improve" or "raise"), "unlock" (use "open up" or "get"), "empower" (use "let" or "help"), "harness" / "harnessing" (use "use"), "cultivate" (use "build" or "grow"), "spearhead" (use "lead"), "champion" as a verb (use "support" or "push for"), "amplify" (use "grow" or "boost"), "resonate" (use "connect" or "land with"), "underscore" (use "shows" or "highlights"), "showcase" (use "show"), "revolutionize" (use "change" or "transform"), "delve" (use "get into" or "look at"), "dive into" (use "get into" or "look at"), "unpack" (use "break down" or "explain"), "explore" when used as a vague filler (be specific), "address" as a vague filler (use "handle" or "deal with")
BANNED ADJECTIVES AND PHRASES: "crucial" (use "important" or "key"), "robust" (use "strong" or "solid"), "comprehensive" (use "full" or "complete"), "pivotal" (use "key" or "major"), "transformative" (use "major" or "significant"), "impactful" (use "effective" or "meaningful"), "cutting-edge" (use "new" or "latest"), "innovative" when vague (be specific about what's new), "seamless" (use "smooth" or "easy"), "holistic" (use "full" or "complete"), "actionable" (use "useful" or "practical"), "strategic" when used as empty filler (be specific or cut it), "game-changing" / "game-changer" (make the point directly instead), "groundbreaking" (be specific), "revolutionary" (be specific), "unprecedented" (be specific)
BANNED NOUNS: "journey" when used metaphorically for a process (use "process" or "experience"), "landscape" (use "space" or "world" or "area"), "paradigm" (use "way" or "model" or "approach"), "realm" (use "area" or "space"), "ecosystem" when vague (use "space" or "network"), "insights" when used as vague filler (use "ideas" or "findings" or be specific), "bandwidth" when meaning time or capacity (use "time" or "capacity"), "synergy" / "synergies" (cut entirely, make the specific point), "fluff", "leaky bucket", "the fix", "ghosted"
BANNED PHRASES AND IDIOMS: "in today's world" (cut it, make the point), "at the end of the day" as a filler opener (cut it), "circle back" (use "follow up"), "touch base" (use "check in" or "talk"), "move the needle" (be specific about what changes), "game plan" (use "plan"), "think outside the box" (cut it, give the actual idea), "low-hanging fruit" (cut it, be specific), "Just gone" as a standalone phrase, "value proposition" (use "what makes it worth it" or be specific), "pain point" (describe the actual problem)
8. Do not use unnecessary filler openers like "Certainly!", "Absolutely!", "Of course!", "Great question!".
9. Never open with staccato metrics or statements. Never write like this: "3,000 signups. 100 active users. That's a 3% rate." That's a list pretending to be prose. If numbers are relevant, weave them into a sentence naturally. Like: "Only 100 of our 3,000 signups are actually active, which is well below where we need to be".
10. Do not use the pattern of repeating a lead word across multiple phrases. e.g. "real traffic, real signups, real potential" or "no error, no ticket, no signal." Whether the repetition is separated by commas or periods, it reads the same way like a checklist, not a thought. Rewrite it as a single continuous idea instead.
11. Avoid the staccato pattern: short sentence. period. another short sentence. period. It reads like bullet points without the bullets. Write in full, connected thoughts. A prime example of what to never do: "They didn't reject you. They just didn't know what to do. So they did nothing." — three separate thoughts that should be one sentence. Fix it: "They didn't reject you, they just had no idea what to do next so they did nothing." Connect with commas, conjunctions, or a single clause. Never three standalone sentences making one point.
12. Never use the setup-then-contradict structure. The pattern has three parts: a claim, then a standalone 1-3 word line that contradicts or dismisses it, then the actual point. The middle line is the tell — "it's not", "they don't", "stupid.", "that's backwards", "wrong." sitting alone as its own sentence or paragraph. This three-part structure is one of the strongest AI writing patterns regardless of what words are used. Examples of what to never reproduce: "most of you still think AI is a tool / it's not / it's replacing the way your brain works" — "most founders chase marketing before fixing their product. / stupid. / you're at $15K MRR..." — "most B2B founders think they need more leads / they don't / they're filling a leaky bucket". Cut the setup and the dismissal line entirely. Make the point directly: "AI isn't a tool anymore, it's replacing the way your brain works when you work." One sentence. No standalone contradiction. No theatrical setup.
13. Do not end a piece of writing with a throwaway line that just restates what was already said in punchier words. BAD: "logic doesn't move money. belief shifts do." — "belief shifts do" just restates the previous sentence. GOOD: "logic doesn't move money because people don't buy on information, they buy when something shifts in how they see themselves." BAD: "building an audience is a 3 year play, borrowing one is a 3 month play. stop building an audience. borrow one.". "borrow one" is already implied, end on "borrowing one is a 3 month play" and stop. BAD: "build your list. own your congregation." Same idea dressed differently. GOOD: "build your list, because it's the only channel you actually own when the algorithm changes." BAD: "stop selling features to the brain. sell to the belief." both sentences say the same thing. GOOD: "people don't buy features, they buy the version of themselves that uses them." Test: remove the last sentence. if the piece still makes its full point, the sentence goes.
14. Do not append a short standalone sentence after a longer one just to add attitude or punch. BAD: "platforms are landlords. your inbox is property." — "your inbox is property" just translates the metaphor without adding anything new. GOOD: "platforms are landlords, which means they can raise the rent or kick you out whenever they want, and your list is the one thing they can't touch." BAD: "you're not selling a product. you're rewriting their internal narrative." Both sentences say the same thing. GOOD: pick one and develop it: "you're rewriting the story someone tells themselves about what's possible, and that's why a feature list never closes the deal." BAD: "stop selling features to the brain. sell to the belief." GOOD: "the brain evaluates features, but the gut makes the decision, and the gut only moves when a belief shifts." Test: if the short sentence after the period could be deleted and the meaning stays completely intact, delete it.
15. Do not use any emojis. If you see any emojis in highlighted text, remove them.
16. Do not list exactly three descriptors, nouns, or negations in a row. AI defaults to groups of three because it feels complete and rhythmic. e.g. "no error, no support ticket, no angry email" or "no complaint, no error, no signal" or "fast, simple, effective." The number three is the tell. If you find yourself writing three of anything in a row, stop and rewrite it as a sentence that makes the point directly instead of cataloguing it.
17. CRITICAL: When given multiple style rules to blend, you must produce exactly ONE piece of rewritten text. Never output multiple versions, never use labels like "Style 1:", "Style 2:", "Version A:", "Option 1:", or any heading that separates outputs. The user selected multiple styles because they want one result that combines all of them — not a menu to pick from. One output. Always.
18. Do not open with "Whether you're X or Y..." or "Whether X or Y, Z" as a hook. It's a way of faking inclusivity before making a point. Start on the actual point instead.
19. Do not start sentences with "The truth is...", "The reality is...", "The fact is...", "Here's the thing:", "The thing is...", "Here's what nobody tells you:", or any similar setup. These manufacture false intimacy. Just say the thing directly.
20. Do not use transitional filler phrases: "With that in mind...", "That said...", "Having said that...", "That being said...", "All that to say...", "Which brings me to...", "That's where X comes in", "It's worth noting that...", "It's important to remember that...", "Keep in mind that...". Delete them and let the thought stand on its own.
21. Do not use "Not only X, but also Y" or "Not only does X, but Y" constructions. This says the same thing twice with fake escalation. Combine them into one direct sentence.
22. Do not open sentences with prepositional-phrase preambles designed to sound sophisticated. Examples: "By doing X, you can Y" → write "X gets you Y"; "Through X, we Y" → write "X means we Y"; "With X comes Y" → write "X brings Y"; "In an era of X..." → cut it entirely and make the point. These openers delay the subject and read like corporate writing.
23. Do not impose a predictable narrative arc onto the rewrite. AI defaults to a five-part structure: (1) opening hook or claim, (2) reason or explanation, (3) example to reinforce it, (4) personal connection or product tie-in, (5) conclusion or CTA. This template is one of the most recognisable signs of AI-generated content — readers spot it instantly, even when individual sentences sound fine. Do NOT rewrite the original into this structure unless the original already follows it. Follow the shape of the original text, not a template. If the original is a single paragraph, keep it a single paragraph. If it is a short punchy post, keep it short and punchy. If it is a rant, keep it a rant. Never expand a simple thought into a five-part essay. Never restructure a casual post into a story arc. The structure must come from the original, not from you.
`.trim();

const TONE_INSTRUCTIONS: Record<string, string> = {
  Humanize: `Your job is to rewrite this text so it sounds like a real person wrote it. Not a content writer. Not a LinkedIn influencer. Not a motivational speaker. A real person.

TRANSFORMATION MANDATE — this overrides everything else: do NOT treat this as a proofreading pass. Do NOT look for a list of violations and fix only those. Your job is to produce a substantially different piece of writing that carries the same meaning in a completely different human voice. Rebuilt, not fixed. The output should feel like a different person sat down, understood what the original was saying, and wrote it fresh from scratch. If your rewrite shares more than 30% of the original's sentence structure, paragraph shape, or phrasing, throw it out and go again. Someone reading both side by side should instantly see two different pieces of writing, not one cleaned-up version of the other. A minimal-change output where only punctuation shifts or one word swaps is a failure. Always.

The 17 banned patterns in the system prompt are your checklist for what NOT to do. Go through the original and find every violation — every AI word, every AI sentence structure, every AI rhythm — and build something better in its place. The meaning can survive in a completely different structure, different words, different format. The only things that must survive intact are the core message, specific details like names and numbers, and the CTA if there is one.

WHAT TO DO
- Rebuild from the inside out: understand what the original is trying to say, then write it fresh in plain human language — do not follow the original sentence by sentence
- Restructure aggressively: change sentence order, paragraph breaks, how ideas connect — all of that is fair game
- Rewrite any sentence that sounds even slightly polished, formal, or template-like — even if it doesn't break a specific rule, if it sounds like a content writer produced it, rewrite it
- Match the approximate length of the original unless the original is bloated with filler, in which case cut it
- The output should read like something a real person typed out, thought about, and typed again

WHAT TO REMOVE
- Every pattern from the 17 banned rules — treat this list as a checklist and clear every single one
- Hollow openers: "I hope this finds you well", "I wanted to reach out", "I am writing to", "I am reaching out"
- Corporate buzzwords: synergies, leverage, circle back, touch base, deliverables, at your earliest convenience, moving forward, value proposition, actionable insights
- Passive constructions that distance the writer from the message
- Any sentence that exists purely to sound smart or sophisticated rather than to say something

WHAT TO KEEP
- The core meaning and message — nothing that matters gets stripped
- All specific details: names, numbers, context, links, CTA
- The approximate length — don't pad it, don't gut it

Return only the rewritten text. No explanation, no intro line, no quotes around it.`,

  Unpolished: `Rewrite this text like someone who typed it in one go, felt it, and hit send without thinking twice. Raw, unfiltered, zero polish. The energy is someone who types fast and doesnt waste time dressing it up.

FOUNDATION (do this first, before anything else): Your first job is to strip every AI pattern out of the text. The 17 banned patterns in the system prompt are non-negotiable and apply to this tone exactly like every other tone. Find every AI word, every AI sentence structure, every AI rhythm in the original and kill it. If the whole text reads AI-generated, rewrite all of it — change the words, the structure, the format, whatever it takes. The voice instructions below only shape HOW it sounds human. Passing the 17 rules comes first.

TRANSFORMATION MANDATE: Do not make minimal changes. Regardless of how clean or polished the original text looks, you must rebuild it completely in this raw, fast voice. The grammar markers below (dropped apostrophes, casual typos, inconsistent capitals, gen-z slang mid-sentence) are not optional flavoring — they are the core of this tone and must be present and consistent throughout the output. A rewrite that reads polished and clean with just a couple of tweaked words is a failure. Someone reading both the original and your output should instantly feel a different energy, a different pace, a different person behind the words.

VOICE & TONE
- Write like someone who's slightly done with the bullshit and just wants to say the thing
- IDGAF energy. Not aggressive, just unbothered — says what they mean and moves on
- Opinionated. If theres a point, make it land without cushioning it
- Feels like a voice note, a rant tweet, or a DM typed while walking
- No warm-up or sign-offs. Just the message.
- Use gen z slang (ngl, idk, idc, idgaf, icl, mf, ffs, tbh, tbf, bc, goated) mid-sentence as a reaction or modifier. never to open the piece or start a sentence. They belong inside the thought, not in front of it
- Throw in a swear word here and there where it adds punch: shit, fuck, ass, crap — not in every sentence, only where it lands right
- Use ALL CAPS on a word or short phrase when the original has something worth emphasising — to show conviction or frustration, not randomly
- Capitalization is inconsistent, like someone who types fast and doesnt always hit shift. About 80% of sentences and new paragraphs start with a capital first letter, 20% just dont. Let it slip naturally. not every sentence, but not never, just uneven enough that it feels like a real person who sometimes cant be bothered

GRAMMAR & SPELLING
- Drop apostrophes casually: youre, dont, cant, its, ur, thats, wont
- Slip in 1–2 natural typos on commonly misspelled words — the kind a fast typer makes: "jsut" instead of "just", "teh" instead of "the", "definately" instead of "definitely", "embarassing" instead of "embarrassing". Never misspell the key idea word, only the small filler words around it
- Connect thoughts with casual conjunctions: "bc", "so", "and", "like" — let sentences run where they naturally would instead of chopping them at every pause
- Start sentences with "and" or "but" or "bc" when it flows
- Line length follows the original. if its a long thought, keep it long. if its short, keep it short. dont force either.

WHAT TO REMOVE
- Fake enthusiasm: "Exciting opportunity", "thrilled to share", "passionate about"
- Any sentence that exists just to soften the message or sound polite
- Filler openers that delay the point

WHAT TO KEEP
- The core message and CTA
- Specific details like names, numbers, context
- The original intent, just stripped of all the polish

Never open with staccato metrics or statements ("3k signups. 100 active. That's 3%."). Weave numbers into full sentences instead.

Return only the rewritten text. No explanation, intro line, or quotes around it.`,

  Controversial: `Rewrite this text like someone who says the uncomfortable truth out loud and doesnt apologise for it. The kind of person who posts something, watches it blow up, and doesnt delete it.

FOUNDATION (do this first, before anything else): Your first job is to strip every AI pattern out of the text. The 17 banned patterns in the system prompt are non-negotiable and apply to this tone exactly like every other tone. Find every AI word, every AI sentence structure, every AI rhythm in the original and kill it. If the whole text reads AI-generated, rewrite all of it — change the words, the structure, the format, whatever it takes. The voice instructions below only shape HOW it sounds human. Passing the 17 rules comes first.

TRANSFORMATION MANDATE: Do not hedge. Do not soften. Do not preserve the diplomatic framing of the original. You must rebuild this text from the angle of someone who says the uncomfortable thing directly and without apology. The mandatory swear word and 18+ term below are hard requirements — if they are missing, the output fails. The take should feel sharper and more provocative than the original, not just the same point with different words. Someone reading both versions should feel that the rewritten version has an edge the original was too polite to have.

VOICE & TONE
- Say the thing everyone thinks but nobody says
- Unpopular opinion energy. Not for shock value, bc its actually true and you know it
- Be borderline offensive, have an NSFW tonality and importantly dont give a fuck
- Slightly provocative but always backed by a real point
- No hedging, no "this might just be me but..." just say it
- Reads like a tweet that got 400 replies, half agreeing half losing their mind
- Dry, deadpan delivery makes it land harder than yelling
- If theres an uncomfortable implication, lean into it dont soften it
- Write from first person, as if the text belongs to the person who wrote it — from their direct experience and perspective, not as an outside observer
- MANDATORY: every output must contain at least one swear word (fuck, shit, mf, ass, bitch, fucker, motherfucker, ffs, wtf, etc.) and at least one 18+ term (sex, dick, cock, cunt, pussy, slut, whore, porn, goon, asshole, onlyfans etc.). This is not optional, it is a hard requirement of this tone. Place them where they land naturally, not randomly but they must be in there.

GRAMMAR & SPELLING
- Drop apostrophes casually: youre, dont, cant, its, ur, thats, wont
- Slip in 1–2 natural typos on commonly misspelled words — the kind a fast typer makes: "jsut" instead of "just", "teh" instead of "the", "definately" instead of "definitely". Never misspell the key idea word, only small filler words
- ALL CAPS on the one word that is the whole point of the sentence

STRUCTURE
- Open with the uncomfortable truth instead of easing into the context
- No warm-up, dont write "I've been thinking about this", just drop the point
- Make one sharp observation and back it with one real example, then move on without a tidy wrap-up
- Deadpan delivery comes from WHAT you say, not from chopping it into fragments. Every thought, including the final one, has to be a complete flowing sentence. Never end on or insert a clipped one-to-four-word line for punch (no "it works." "they did." "stupid." "significant more."). If a thought feels punchy, connect it to the sentence next to it with a comma or a connector (and, but, so, because, which means) so it still lands but reads like a person wrote it, not a slogan generator

WHAT TO REMOVE
- Any sentence that softens the take
- Disclaimers, caveats, "of course this doesnt apply to everyone"
- Fake balance: "on the other hand..." pick a side
- Corporate framing of any kind
- Inspirational sign-offs

WHAT TO KEEP
- The core uncomfortable truth from the original
- Any specific numbers or examples that make it real
- The original intent, just stripped of all the politeness

Never open with staccato metrics or statements ("3k signups. 100 active. That's 3%."). Weave numbers into full sentences instead.

Return only the rewritten text. No explanation or intro line, or quotes around it.`,

  Direct: `BREVITY IS THE PRIMARY JOB. Rewrite this text as short as possible. Cut to the core message and stop. If the original is 100 words, target 25-35. If it's 50 words, target 15-20. The final output must always be shorter than the original. This is non-negotiable and overrides everything else — even when this style is paired with other styles, the output stays as short as it would be for Direct alone.

FOUNDATION (do this first, before anything else): Strip every AI pattern out of the text. The banned patterns in the system prompt are non-negotiable and apply to this tone exactly like every other tone. Find every AI word, every AI sentence structure, every AI rhythm in the original and kill it. If the whole text reads AI-generated, rewrite all of it. The voice instructions below only shape HOW it sounds human. Passing the rules comes first.

VOICE & TONE
- Extract the core message and say it in the fewest words possible — cut to what the text is actually saying, then say only that
- Use the simplest words that carry the full meaning. If a shorter word does the same job, use the shorter one
- No warm-up, no wind-down. Start on the point, end the moment the point is made
- Contractions throughout: it's, don't, can't, you're, they're, we're, I'll — always. Never write "do not" when "don't" says the same thing

STRUCTURE
- Every sentence must earn its place. If it can be cut without losing the core message or CTA, cut it
- Merge two sentences into one wherever possible — say in one sentence what the original said in two or three
- No softening, no lead-up, no padding of any kind

GRAMMAR
- Proper grammar: every sentence starts with a capital letter
- Contractions (it's, don't, can't, you're) — required, not optional
- No dropped apostrophes, no casual typos, no slang — clean and clear

WHAT TO REMOVE (remove all of these)
- Any sentence that explains what you're about to say instead of just saying it
- Filler openers: "I wanted to reach out", "I hope this finds you well", "I came across your profile"
- Any word or phrase that can be deleted without the message losing meaning
- Formal or complex words where a simpler one exists: "utilise" → "use", "endeavour" → "try", "in order to" → "to"
- Any sentence that exists only to soften, warm up, or qualify the message

WHAT TO KEEP
- The core message — nothing that actually matters gets cut
- Any CTA from the original
- Specific details: names, numbers, context that changes meaning

CRITICAL — WHEN BLENDED WITH OTHER STYLES: Other styles add voice, energy, and attitude. They do NOT add length. If this is selected alongside Controversial, Unpolished, or Humanized, the final output must still be as short as Direct alone would make it. Those styles contribute their tone and character — they do not get to expand the word count.

Return only the rewritten text. No explanation, no quotes, no intro line.`,
};

// Appended to the very end of every prompt, right before the text to rewrite.
// Recency matters: models weight the last instruction heaviest, so the two
// failures that slip through most often (em dashes + staccato fragments) get a
// dedicated self-check here on top of the system-prompt rules.
const FINAL_PASS = `\n\nFINAL SELF-CHECK before all output. Scan your own rewrite and fix every instance of the following:\n1. EM DASHES: zero em dashes (—) and zero double hyphens (--) anywhere. Replace with a comma, a connector word (and, but, so, because, which means), or two clean sentences.\n2. STACCATO FRAGMENTS: zero standalone short fragments used for punch or contradiction (e.g. "They did." "It works." "No." "Stupid."). Fold every one into the sentence next to it with a comma or connector.\n3. BANNED AI WORDS: scan for leverage, utilize, foster, ensure, facilitate, elevate, unlock, empower, harness, cultivate, clarity, pivotal, transformative, impactful, cutting-edge, innovative, holistic, actionable, robust, comprehensive, crucial, ecosystem, landscape, journey (metaphorical), paradigm, realm, underscore, resonate, showcase, delve, dive into, unpack, synergy, game-changer, groundbreaking, revolutionary, unprecedented, pain point, value proposition. If any appear, replace them with the simple alternative.\n4. BANNED STRUCTURAL PATTERNS: scan for "The truth is...", "The reality is...", "Here's the thing:", "With that in mind...", "That being said...", "the fix...", "Not only X but also Y", "Whether you're X or Y", "By doing X you can Y", "In an era of...". If any appear, rewrite the sentence to drop the pattern.`;

// Deterministic guarantee that no em dash or spaced double hyphen ever ships,
// regardless of what the model does. Runs as the last step on every result.
function stripEmDashes(s: string): string {
  return s
    .replace(/\s*—\s*/g, ", ")
    .replace(/\s+--\s+/g, ", ")
    .replace(/,\s*,/g, ",")
    .replace(/\s+,/g, ",");
}

// Cheap heuristic to decide whether the output still reads staccato and needs a
// focused cleanup pass. Flags any standalone one-to-three-word sentence in a
// multi-sentence text (the "They did." / "Significant more." pattern).
function hasStaccato(s: string): boolean {
  const sentences = s
    .split(/(?<=[.!?])\s+/)
    .map((x) => x.trim())
    .filter(Boolean);
  if (sentences.length < 3) return false;
  return sentences.some((sent) => {
    const words = sent.replace(/[^\w\s']/g, "").split(/\s+/).filter(Boolean);
    return words.length > 0 && words.length <= 3;
  });
}

// Single-job second pass. Models are far more reliable at fixing ONE narrow
// problem than at juggling every constraint in the first blended rewrite, so
// when the first output trips the detectors we hand it back with the sole task
// of scrubbing em dashes and staccato while preserving voice, swears and caps.
function scrubberPrompt(draft: string): string {
  return `You are doing a final cleanup pass on a piece of text. Its voice, meaning, swearing, capitalization, slang and intent are all correct and must be preserved exactly. Your ONLY job is to fix two specific mechanical problems and change nothing else:

1. Remove every em dash (—) and double hyphen (--). Replace each with a comma, a connector word (and, but, so, because, which means), or split it into clean sentences, whichever reads most naturally.

2. Remove every staccato fragment. A staccato fragment is a standalone short sentence (roughly one to four words) used for punch or contradiction, like "They did." "It works." "Significant more." "No." "Stupid." Fold each one into the sentence beside it using a comma or a connector so the thought reads as one continuous sentence. Also fix any run of short clipped sentences that reads like a list.

Do not soften the tone, do not remove swear words or ALL CAPS, do not add new ideas, do not restructure anything that is not one of the two problems above. Keep the same length and the same voice.

Return only the cleaned text. No explanation, no quotes, no intro line.

Text to clean:
${draft}`;
}

export async function POST(req: NextRequest) {
  try {
    const { userId } = await auth();

    // The desktop selector calls cross-origin and authenticates with a Bearer
    // session token (never a cookie). If that token is missing/expired, `userId`
    // is null — and we must NOT fall through to the free anonymous path, or
    // desktop users would get unlimited uncounted rewrites. Reject so the app
    // can prompt them to re-open huumanity and mint a fresh token.
    const isDesktopSelector =
      req.headers.get("x-huu-client") === "desktop-selector";
    if (isDesktopSelector && !userId) {
      return corsJson({ error: "auth_required" }, { status: 401 });
    }

    let usageCount = 0;
    let dailyLimit = FREE_DAILY_LIMIT;

    // Signed-in users: enforce plan limits server-side.
    // Anonymous callers: fall through (client-side localStorage gate only).
    if (userId) {
      const { privateMeta, publicMeta } = await getUserMeta(userId);

      const isPro =
        privateMeta.plan === "pro" &&
        privateMeta.subscriptionStatus === "active";

      if (!isPro) {
        usageCount = windowedUsage(publicMeta).count;
        dailyLimit = typeof privateMeta.customDailyLimit === "number"
          ? privateMeta.customDailyLimit
          : FREE_DAILY_LIMIT;

        if (usageCount >= dailyLimit) {
          return corsJson(
            {
              error: "usage_limit_reached",
              usageCount,
              limit: dailyLimit,
            },
            { status: 429 }
          );
        }
      }
    }

    const body = await req.json();
    const text: string | undefined = body.text;
    const tonesInput: string[] = Array.isArray(body.tones)
      ? body.tones
      : body.tone
        ? [body.tone]
        : [];

    if (!text || tonesInput.length === 0) {
      return corsJson(
        { error: "Missing text or tones" },
        { status: 400 }
      );
    }

    const instructions = tonesInput
      .map((t) => TONE_INSTRUCTIONS[t])
      .filter(Boolean);

    if (instructions.length === 0) {
      return corsJson(
        { error: "Invalid tones" },
        { status: 400 }
      );
    }

    // "My Voice" — optional personal style the user sets in the app. It layers
    // on top of the tone instructions as a preference only. It must never
    // override the ANTI_AI_RULES / banned patterns. If absent or empty, the
    // prompt is byte-for-byte what it was before this feature existed.
    const voiceInstructions: string =
      typeof body.voiceInstructions === "string"
        ? body.voiceInstructions.trim()
        : "";
    const voiceBlock = voiceInstructions
      ? `\n\nAdditionally, the user has their own personal style preference. Layer this on top of the tone instructions above, do not override the banned patterns rules, just add this as a stylistic preference on top:\n${voiceInstructions}\n`
      : "";

    const userMessage =
      instructions.length === 1
        ? `${instructions[0]}${voiceBlock}${FINAL_PASS}\n\nText to rewrite:\n${text}\n\nReturn only the rewritten text.`
        : `Rewrite the text below by blending ALL of the following styles into ONE single output. Do not produce multiple versions. Do not label anything with "Style 1" or "Style 2" or any heading. Just return one rewritten text that satisfies every style at once.\n\nTRANSFORMATION MANDATE: Do not make minimal changes. This is not a proofreading pass. You must substantially rebuild the text so it carries the combined voice of every selected style. The output should feel like a completely different person wrote it — someone whose writing is shaped by ALL of the selected styles simultaneously, not just the dominant one. If your rewrite looks more than 30% similar in structure or phrasing to the original, go again.\n\nIMPORTANT — these styles share ONE foundation: every style carries the same anti-AI foundation (the banned patterns in the system prompt). Apply it ONCE — strip every AI word, structure, and rhythm a single time. The differences between styles are voice and grammar, which you resolve using the conflict rules below.\n\nCONFLICT RESOLUTION — when styles disagree, follow this hierarchy:\n1. The ANTI_AI_RULES override everything, always, with no exceptions.\n2. Brevity conflict: if Direct is one of the selected styles, BREVITY is the dominant constraint — no other style may add sentences, expand the output, or increase the word count. The final output must be as short as Direct alone would make it. Other styles contribute their voice, energy, and attitude into that shorter output — they do not get to make it longer.\n3. Grammar conflict: if Direct is one of the selected styles, use Direct grammar for the entire output — proper capitals, proper contractions (it's, don't, can't), no dropped apostrophes, no casual typos. If Direct is NOT selected and Unpolished IS selected, you MUST actively apply Unpolished grammar throughout the entire output: drop apostrophes (youre, dont, cant, wont, thats), allow 1-2 natural typos on small filler words, let about 20% of sentences start without a capital letter, and weave gen-z slang mid-sentence as a modifier (ngl, tbh, bc, idk, idgaf). These grammar markers are not optional — they must be visible and consistent, not just sprinkled in once. If Direct is not selected and Unpolished is also not selected, use clean human grammar throughout.\n4. Controversial mandatory language: if Controversial is one of the selected styles, the output must still contain at least one swear word and at least one 18+ term regardless of what other styles are selected. Place them where they fit most naturally given the blended voice — but they must be present.\n5. Everything else is voice blending: take the energy, attitude, and approach from each style and weave them into one consistent voice. Do not stack every grammar rule from every style — resolve grammar first using rule 3, then layer the voices on top of that. When Direct is one of the styles, brevity from rule 2 caps the length before voice blending begins.\n6. The final output should read like one coherent person wrote it, not like multiple styles fighting each other in the same paragraph.\n7. DIFFERENTIATION MANDATE: Your blended output must be perceptibly and obviously different from what any single tone in the mix would produce on its own. Adding a second or third style is not permission to average — it is a requirement to produce something that carries ALL contributing voices simultaneously and noticeably. Humanize+Unpolished must feel rawer, faster, and more casual than Humanize alone, with visible grammar markers. Humanize+Controversial must feel edgier and more direct than Humanize alone, with the mandatory language present. Any blend that could be mistaken for a single-tone output is wrong — go again.\n\nSTYLES TO BLEND:\n${instructions.map((inst, i) => `--- Style ${i + 1} ---\n${inst}`).join("\n\n")}${voiceBlock}${FINAL_PASS}\n\nText to rewrite:\n${text}\n\nOne rewrite only. No labels, no headings, no explanation, no quotes.`;

    const message = await client.messages.create({
      model: "claude-sonnet-4-6",
      // 1024 truncated longer real-world selections (full emails, paragraphs)
      // mid-rewrite, which read as a broken/partial result. 4096 gives ~3000
      // words of headroom so the rewrite is never cut off.
      max_tokens: 4096,
      system: ANTI_AI_RULES,
      messages: [{ role: "user", content: userMessage }],
    });

    let result =
      message.content[0].type === "text" ? message.content[0].text : "";

    // If the first pass still leaked an em dash or a staccato fragment, hand it
    // back for a focused single-job cleanup. This catches what the blended
    // first pass drops without making every request pay for a second call.
    if (result && (/—|--/.test(result) || hasStaccato(result))) {
      try {
        const scrub = await client.messages.create({
          model: "claude-sonnet-4-6",
          max_tokens: 4096,
          system: ANTI_AI_RULES,
          messages: [{ role: "user", content: scrubberPrompt(result) }],
        });
        const scrubbed =
          scrub.content[0].type === "text" ? scrub.content[0].text : "";
        if (scrubbed.trim()) result = scrubbed;
      } catch (scrubErr) {
        // A failed cleanup pass must never fail the whole request; the
        // deterministic strip below still guarantees no em dashes ship.
        console.error("Scrubber pass failed:", scrubErr);
      }
    }

    // Final hard guarantee: no em dash or spaced double hyphen can ever reach
    // the user, no matter what either model pass produced.
    result = stripEmDashes(result);

    // Increment daily usage for signed-in free users
    let newUsageCount: number | null = null;
    if (userId) {
      const { privateMeta } = await getUserMeta(userId);
      const isPro =
        privateMeta.plan === "pro" &&
        privateMeta.subscriptionStatus === "active";
      if (!isPro) {
        newUsageCount = await incrementDailyUsage(userId);
      }
    }

    return corsJson({
      result,
      usageCount: newUsageCount ?? (userId ? usageCount + 1 : null),
      limit: dailyLimit,
    });
  } catch (err) {
    console.error("Humanize API error:", err);
    return corsJson(
      { error: "Something went wrong" },
      { status: 500 }
    );
  }
}
